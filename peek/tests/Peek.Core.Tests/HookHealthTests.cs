using System.Diagnostics;
using Peek.Core.Diagnostics;

namespace Peek.Core.Tests;

public sealed class HookHealthTests
{
    private static long Microseconds(long value) => value * Stopwatch.Frequency / 1_000_000;

    [Fact]
    public void Un_hook_qui_n_a_rien_vu_ne_raconte_rien()
    {
        var snapshot = new HookHealth().Snapshot();

        Assert.Equal(0, snapshot.Samples);
        Assert.Equal(0, snapshot.AverageCallbackMicroseconds);
        Assert.Equal(0, snapshot.MaximumCallbackMicroseconds);
    }

    [Fact]
    public void La_moyenne_et_le_pire_cas_se_suivent()
    {
        var health = new HookHealth();

        health.RecordCallback(Microseconds(100));
        health.RecordCallback(Microseconds(300));

        var snapshot = health.Snapshot();

        Assert.Equal(2, snapshot.Samples);
        Assert.InRange(snapshot.AverageCallbackMicroseconds, 190, 210);
        Assert.InRange(snapshot.MaximumCallbackMicroseconds, 290, 310);
        Assert.Equal(0, snapshot.OverBudgetCallbacks);
    }

    [Fact]
    public void Un_depassement_de_budget_est_compte()
    {
        var health = new HookHealth();

        health.RecordCallback(Microseconds(HookHealth.CallbackBudgetMicroseconds + 500));

        Assert.Equal(1, health.Snapshot().OverBudgetCallbacks);
    }

    [Fact]
    public void On_reinstalle_bien_avant_que_Windows_ne_retire_le_hook()
    {
        // LowLevelHooksTimeout vaut 5000 ms par defaut. Le seuil de
        // reinstallation est vingt fois plus bas, pour ne jamais y arriver.
        Assert.False(HookHealth.NeedsReinstall(Microseconds(1_000)));
        Assert.True(HookHealth.NeedsReinstall(Microseconds(HookHealth.ReinstallThresholdMicroseconds + 1_000)));
    }

    [Fact]
    public void Le_releve_tient_sur_une_ligne()
    {
        var health = new HookHealth();
        health.RecordCallback(Microseconds(50));
        health.RecordQueueLatency(Microseconds(120));
        health.RecordDropped(3);
        health.RecordReinstallation();

        var line = health.Snapshot().Describe();

        Assert.Contains("1 frappes", line, StringComparison.Ordinal);
        Assert.Contains("3 perdues", line, StringComparison.Ordinal);
        Assert.Contains("1 reinstallations", line, StringComparison.Ordinal);
        Assert.DoesNotContain('\n', line);
    }
}
