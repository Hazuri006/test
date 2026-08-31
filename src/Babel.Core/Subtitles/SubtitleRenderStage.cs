using Babel.Core.Diagnostics;
using Babel.Core.Pipeline;

namespace Babel.Core.Subtitles;

/// <summary>
/// Dernier etage : consomme les sous-titres et les remet a l'overlay.
///
/// Il reporte aussi le compteur de rejets du lien dans les metriques, pour que le
/// HUD montre ce que la politique de rejet a reellement jete.
/// </summary>
public sealed class SubtitleRenderStage : IPipelineStage
{
    private readonly StageLink<SubtitleMessage> _input;
    private readonly ISubtitleSink _sink;
    private readonly PipelineMetrics _metrics;

    public SubtitleRenderStage(
        StageLink<SubtitleMessage> input,
        ISubtitleSink sink,
        PipelineMetrics metrics)
    {
        _input = input;
        _sink = sink;
        _metrics = metrics;
    }

    public string Name => "Rendu";

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        await foreach (var message in _input.Reader.ReadAllAsync(cancellationToken).ConfigureAwait(false))
        {
            _metrics[PipelineStage.Render].SetDropped(_input.Dropped);
            _sink.Publish(message);
        }
    }
}
