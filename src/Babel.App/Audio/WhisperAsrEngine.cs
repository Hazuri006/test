using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Babel.Core.Audio;
using Microsoft.Extensions.Logging;
using Whisper.net;
using Whisper.net.LibraryLoader;

namespace Babel.App.Audio;

/// <summary>
/// Transcription par whisper.cpp, via Whisper.net.
///
/// L'ordre d'execution suit la specification : CUDA, puis Vulkan, puis le
/// processeur. Whisper.net retombe seul sur le suivant quand une bibliotheque
/// native n'est pas presente, ce qui rend le repli automatique.
/// </summary>
internal sealed class WhisperAsrEngine : IAsrEngine
{
    /// <summary>
    /// whisper.cpp refuse les extraits de moins d'une seconde. Les phrases plus
    /// courtes sont completees par du silence plutot que jetees.
    /// </summary>
    private const int MinimumSamples = AudioFormat.SampleRate;

    private readonly ILogger<WhisperAsrEngine> _logger;
    private readonly WhisperFactory? _factory;
    private readonly object _gate = new();

    private WhisperProcessor? _processor;
    private string _processorLanguage = string.Empty;
    private float[] _padded = new float[MinimumSamples];
    private bool _disposed;

    internal WhisperAsrEngine(ILogger<WhisperAsrEngine> logger)
    {
        _logger = logger;

        RuntimeOptions.RuntimeLibraryOrder =
        [
            RuntimeLibrary.Cuda,
            RuntimeLibrary.Vulkan,
            RuntimeLibrary.Cpu,
        ];

        if (!File.Exists(ModelPaths.Whisper))
        {
            UnavailableReason = ModelPaths.MissingMessage(Path.GetFileName(ModelPaths.Whisper));
            Backend = "aucun";
            return;
        }

        try
        {
            _factory = WhisperFactory.FromPath(ModelPaths.Whisper);
            Backend = RuntimeOptions.LoadedLibrary?.ToString() ?? "automatique";

            _logger.LogInformation("Modèle de transcription chargé, exécution sur {Backend}.", Backend);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Chargement du modèle de transcription impossible.");
            Backend = "aucun";
            UnavailableReason = "Le modèle de transcription n'a pas pu être chargé. Le fichier est peut-être incomplet ou d'un format inattendu.";
        }
    }

    public bool IsReady => _factory is not null;

    public string? UnavailableReason { get; }

    public string Backend { get; } = "aucun";

    public async Task<string> TranscribeAsync(
        ReadOnlyMemory<float> samples,
        string language,
        CancellationToken cancellationToken)
    {
        var processor = GetProcessor(language);

        if (processor is null)
        {
            return string.Empty;
        }

        var input = Pad(samples);
        var text = new StringBuilder();

        await foreach (var segment in processor.ProcessAsync(input, cancellationToken).ConfigureAwait(false))
        {
            text.Append(segment.Text);
        }

        return text.ToString();
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;

        lock (_gate)
        {
            _processor?.Dispose();
            _factory?.Dispose();
        }
    }

    private ReadOnlyMemory<float> Pad(ReadOnlyMemory<float> samples)
    {
        if (samples.Length >= MinimumSamples)
        {
            return samples;
        }

        if (_padded.Length < MinimumSamples)
        {
            _padded = new float[MinimumSamples];
        }

        Array.Clear(_padded, 0, MinimumSamples);
        samples.Span.CopyTo(_padded);

        return _padded.AsMemory(0, MinimumSamples);
    }

    /// <summary>
    /// Un seul processeur, reconstruit uniquement quand la langue change. Le
    /// reconstruire a chaque phrase couterait plus que la transcription elle-meme.
    /// </summary>
    private WhisperProcessor? GetProcessor(string language)
    {
        if (_factory is null)
        {
            return null;
        }

        lock (_gate)
        {
            if (_processor is not null && _processorLanguage == language)
            {
                return _processor;
            }

            _processor?.Dispose();

            var builder = _factory.CreateBuilder();

            // Vide ou « auto » : on laisse whisper deviner. C'est plus lent d'une
            // poignee de millisecondes et ca evite un contresens quand
            // l'utilisateur n'a pas encore choisi sa langue.
            builder = string.IsNullOrWhiteSpace(language) || language == "auto"
                ? builder.WithLanguageDetection()
                : builder.WithLanguage(language);

            _processor = builder
                // Recherche gloutonne plutot qu'en faisceau : le faisceau gagne
                // quelques pourcents de justesse pour plusieurs fois le temps de
                // calcul, ce que le budget de 250 ms ne permet pas.
                .WithGreedySamplingStrategy()
                .ParentBuilder

                // Chaque segment est independant : sans ca, whisper enchaine sur
                // le contexte precedent et invente la suite d'une phrase deja finie.
                .WithNoContext()
                .Build();

            _processorLanguage = language;

            return _processor;
        }
    }
}
