using System.Buffers;
using System.Diagnostics;
using Babel.Core.Diagnostics;
using Babel.Core.Pipeline;
using Babel.Core.Subtitles;
using Microsoft.Extensions.Logging;

namespace Babel.Core.Audio;

/// <summary>
/// Etage de transcription : une phrase entre, du texte sort.
///
/// Les hypotheses partielles ressortent marquees comme telles, pour etre affichees
/// en gris attenue avant la version definitive. C'est le mecanisme d'affichage
/// progressif de la section 3 : l'utilisateur voit bouger quelque chose bien avant
/// que la phrase soit sure.
/// </summary>
public sealed class AsrStage : IPipelineStage
{
    private readonly StageLink<Utterance> _input;
    private readonly StageLink<SubtitleMessage> _output;
    private readonly IAsrEngine _engine;
    private readonly PipelineMetrics _metrics;
    private readonly ILogger<AsrStage> _logger;
    private readonly Func<string> _language;

    public AsrStage(
        StageLink<Utterance> input,
        StageLink<SubtitleMessage> output,
        IAsrEngine engine,
        PipelineMetrics metrics,
        Func<string> language,
        ILogger<AsrStage> logger)
    {
        _input = input;
        _output = output;
        _engine = engine;
        _metrics = metrics;
        _language = language;
        _logger = logger;
    }

    public string Name => "Transcription";

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        await foreach (var utterance in _input.Reader.ReadAllAsync(cancellationToken).ConfigureAwait(false))
        {
            _metrics[PipelineStage.Vad].SetDropped(_input.Dropped);

            try
            {
                await TranscribeAsync(utterance, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                // Une phrase perdue ne doit pas emporter l'etage : la suivante
                // arrive dans une seconde.
                _logger.LogError(ex, "Transcription impossible pour le segment {Sequence}.", utterance.Sequence);
            }
            finally
            {
                ArrayPool<float>.Shared.Return(utterance.Buffer);
            }
        }
    }

    private async Task TranscribeAsync(Utterance utterance, CancellationToken cancellationToken)
    {
        if (!_engine.IsReady)
        {
            return;
        }

        var started = Stopwatch.GetTimestamp();

        var text = await _engine
            .TranscribeAsync(utterance.Samples, _language(), cancellationToken)
            .ConfigureAwait(false);

        _metrics[PipelineStage.Asr].RecordSince(started);

        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        _output.Publish(new SubtitleMessage(
            utterance.Sequence,
            utterance.OriginTimestamp,
            text.Trim(),
            IsPartial: !utterance.IsFinal));
    }
}
