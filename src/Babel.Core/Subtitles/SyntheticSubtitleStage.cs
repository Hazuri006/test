using System.Diagnostics;
using Babel.Core.Pipeline;

namespace Babel.Core.Subtitles;

/// <summary>
/// Generateur de sous-titres synthetiques.
///
/// C'est le « texte de test » du jalon M0. Il traverse le vrai pipeline, avec les
/// vrais liens et la vraie politique de rejet, ce qui rend le budget de rendu
/// mesurable avant qu'il existe la moindre ligne d'audio.
///
/// Il imite aussi la forme reelle du flux a venir : quelques hypotheses partielles
/// puis une phrase finale, pour que le chemin d'affichage progressif soit exerce
/// des maintenant.
/// </summary>
public sealed class SyntheticSubtitleStage : IPipelineStage
{
    private static readonly string[] Phrases =
    [
        "だから、この扉の向こうには誰もいないはずだ。",
        "그 이야기는 나중에 하기로 하죠.",
        "我们必须在天亮之前离开这里。",
        "The signal is holding steady for now.",
    ];

    private readonly StageLink<SubtitleMessage> _output;
    private readonly PipelineHost _host;
    private readonly TimeSpan _partialInterval;
    private readonly TimeSpan _sentenceInterval;

    private long _sequence;

    public SyntheticSubtitleStage(
        StageLink<SubtitleMessage> output,
        PipelineHost host,
        TimeSpan? partialInterval = null,
        TimeSpan? sentenceInterval = null)
    {
        _output = output;
        _host = host;
        _partialInterval = partialInterval ?? TimeSpan.FromMilliseconds(150);
        _sentenceInterval = sentenceInterval ?? TimeSpan.FromMilliseconds(1800);
    }

    public string Name => "Générateur de test";

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        var phraseIndex = 0;

        while (!cancellationToken.IsCancellationRequested)
        {
            if (!_host.IsFlowing)
            {
                await Task.Delay(_partialInterval, cancellationToken).ConfigureAwait(false);
                continue;
            }

            var phrase = Phrases[phraseIndex % Phrases.Length];
            phraseIndex++;

            // Hypotheses partielles : la phrase se revele par morceaux.
            for (var cut = 1; cut < 4; cut++)
            {
                var length = Math.Max(1, phrase.Length * cut / 4);
                Emit(phrase[..length], isPartial: true);
                await Task.Delay(_partialInterval, cancellationToken).ConfigureAwait(false);
            }

            Emit(phrase, isPartial: false);
            await Task.Delay(_sentenceInterval, cancellationToken).ConfigureAwait(false);
        }
    }

    private void Emit(string text, bool isPartial)
    {
        var message = new SubtitleMessage(
            Interlocked.Increment(ref _sequence),
            Stopwatch.GetTimestamp(),
            text,
            isPartial);

        _output.Publish(message);
    }
}
