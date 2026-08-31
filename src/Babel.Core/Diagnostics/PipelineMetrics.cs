using Babel.Core.Pipeline;

namespace Babel.Core.Diagnostics;

/// <summary>
/// Un enregistreur par etage, indexe par l'enumeration. C'est la source unique
/// du HUD de latence et de PERF.md.
/// </summary>
public sealed class PipelineMetrics
{
    private readonly LatencyRecorder[] _recorders;

    public PipelineMetrics()
    {
        _recorders = new LatencyRecorder[PipelineStages.Count];

        for (var i = 0; i < PipelineStages.Count; i++)
        {
            var stage = (PipelineStage)i;
            _recorders[i] = new LatencyRecorder(PipelineStages.Label(stage), PipelineStages.BudgetMs(stage));
        }
    }

    public LatencyRecorder this[PipelineStage stage] => _recorders[(int)stage];

    /// <summary>Latence bout en bout, de l'entree du pipeline a la trame affichee.</summary>
    public LatencyRecorder EndToEnd { get; } = new("Bout en bout", 550);

    public LatencySnapshot[] SnapshotAll()
    {
        var result = new LatencySnapshot[_recorders.Length + 1];

        for (var i = 0; i < _recorders.Length; i++)
        {
            result[i] = _recorders[i].Snapshot();
        }

        result[^1] = EndToEnd.Snapshot();
        return result;
    }

    public void Reset()
    {
        foreach (var recorder in _recorders)
        {
            recorder.Reset();
        }

        EndToEnd.Reset();
    }
}
