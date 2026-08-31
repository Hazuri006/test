using System.Diagnostics;
using Babel.Core.Diagnostics;

namespace Babel.Core.Tests;

public sealed class LatencyRecorderTests
{
    private static long MillisecondsToTicks(double milliseconds) =>
        (long)(milliseconds * Stopwatch.Frequency / 1000.0);

    [Fact]
    public void Un_enregistreur_vide_ne_declare_rien()
    {
        var snapshot = new LatencyRecorder("vide", 16).Snapshot();

        Assert.Equal(0, snapshot.SampleCount);
        Assert.False(snapshot.OverBudget);
    }

    [Fact]
    public void Les_centiles_suivent_une_distribution_connue()
    {
        var recorder = new LatencyRecorder("test", 16);

        // 1 a 100 ms : p50 attendu a 50 ms, p95 a 95 ms (rang le plus proche).
        for (var i = 1; i <= 100; i++)
        {
            recorder.Record(MillisecondsToTicks(i));
        }

        var snapshot = recorder.Snapshot();

        Assert.Equal(100, snapshot.SampleCount);
        Assert.Equal(50, snapshot.P50Ms, 1);
        Assert.Equal(95, snapshot.P95Ms, 1);
        Assert.Equal(100, snapshot.LastMs, 1);
    }

    [Fact]
    public void L_anneau_ne_retient_que_la_derniere_fenetre()
    {
        var recorder = new LatencyRecorder("test", 16);

        // Une premiere vague lente, ecrasee par une seconde vague rapide.
        for (var i = 0; i < LatencyRecorder.Capacity; i++)
        {
            recorder.Record(MillisecondsToTicks(500));
        }

        for (var i = 0; i < LatencyRecorder.Capacity; i++)
        {
            recorder.Record(MillisecondsToTicks(5));
        }

        var snapshot = recorder.Snapshot();

        Assert.Equal(LatencyRecorder.Capacity, snapshot.SampleCount);
        Assert.Equal(5, snapshot.P95Ms, 1);
    }

    [Fact]
    public void Le_depassement_de_budget_est_signale()
    {
        var recorder = new LatencyRecorder("rendu", budgetMs: 16);

        for (var i = 0; i < 100; i++)
        {
            recorder.Record(MillisecondsToTicks(40));
        }

        Assert.True(recorder.Snapshot().OverBudget);
    }

    [Fact]
    public void Enregistrer_n_alloue_rien()
    {
        var recorder = new LatencyRecorder("test", 16);

        // Prechauffage : on ne veut mesurer ni la JIT ni le premier acces au tableau.
        for (var i = 0; i < 1_000; i++)
        {
            recorder.Record(i);
        }

        var before = GC.GetAllocatedBytesForCurrentThread();

        for (var i = 0; i < 100_000; i++)
        {
            recorder.Record(i);
        }

        var allocated = GC.GetAllocatedBytesForCurrentThread() - before;

        Assert.Equal(0, allocated);
    }

    [Fact]
    public void Les_rejets_s_accumulent_et_se_reinitialisent()
    {
        var recorder = new LatencyRecorder("test", 16);

        recorder.RecordDropped();
        recorder.RecordDropped(4);
        Assert.Equal(5, recorder.Snapshot().Dropped);

        recorder.SetDropped(12);
        Assert.Equal(12, recorder.Snapshot().Dropped);

        recorder.Reset();
        Assert.Equal(0, recorder.Snapshot().Dropped);
    }
}
