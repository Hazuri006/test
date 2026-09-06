using System.Diagnostics;
using System.Globalization;

namespace Peek.Core.Diagnostics;

/// <summary>Etat du hook a un instant donne, tel qu'il part dans le journal.</summary>
/// <param name="Samples">Nombre de callbacks mesures.</param>
/// <param name="AverageCallbackMicroseconds">Duree moyenne du callback.</param>
/// <param name="MaximumCallbackMicroseconds">Pire duree observee.</param>
/// <param name="OverBudgetCallbacks">Callbacks au-dela du budget.</param>
/// <param name="AverageQueueMicroseconds">Delai moyen entre la capture et le traitement.</param>
/// <param name="MaximumQueueMicroseconds">Pire delai observe.</param>
/// <param name="DroppedEvents">Evenements perdus faute de place dans la file.</param>
/// <param name="Reinstallations">Nombre de reinstallations du hook.</param>
public readonly record struct HookHealthSnapshot(
    long Samples,
    double AverageCallbackMicroseconds,
    long MaximumCallbackMicroseconds,
    long OverBudgetCallbacks,
    double AverageQueueMicroseconds,
    long MaximumQueueMicroseconds,
    long DroppedEvents,
    long Reinstallations)
{
    /// <summary>Une ligne de journal, lisible sans outil.</summary>
    public string Describe() => string.Format(
        CultureInfo.InvariantCulture,
        "{0} frappes, callback moyen {1:F1} us, pire {2} us, {3} hors budget, file moyenne {4:F1} us, pire {5} us, {6} perdues, {7} reinstallations",
        Samples,
        AverageCallbackMicroseconds,
        MaximumCallbackMicroseconds,
        OverBudgetCallbacks,
        AverageQueueMicroseconds,
        MaximumQueueMicroseconds,
        DroppedEvents,
        Reinstallations);
}

/// <summary>
/// Mesure du hook clavier.
///
/// I7 n'est pas une intention, c'est un chiffre : si le callback depasse
/// LowLevelHooksTimeout, cinq secondes par defaut, Windows retire le hook sans
/// prevenir et l'utilisateur perd des touches sans que rien ne l'explique. On
/// mesure donc en permanence, et on reinstalle bien avant d'en arriver la.
///
/// Toutes les methodes ici sont appelees depuis le fil de travail, jamais
/// depuis le callback. Le callback se contente d'ecrire la duree de son dernier
/// passage dans un champ ; c'est le fil de travail qui l'agrege. Une operation
/// atomique par frappe serait supportable, mais elle serait du travail dans le
/// callback, et I7 dit qu'il n'y en a pas.
/// </summary>
public sealed class HookHealth
{
    /// <summary>Budget que le callback ne doit pas depasser en fonctionnement normal.</summary>
    public const long CallbackBudgetMicroseconds = 1_000;

    /// <summary>
    /// Au-dela, on ne discute pas : le hook est reinstalle avant que Windows ne
    /// le retire lui-meme. Un vingtieme du delai par defaut laisse de la marge.
    /// </summary>
    public const long ReinstallThresholdMicroseconds = 250_000;

    private static readonly double MicrosecondsPerTick = 1_000_000.0 / Stopwatch.Frequency;

    private long _samples;
    private long _callbackTotalMicroseconds;
    private long _callbackMaximumMicroseconds;
    private long _overBudget;
    private long _queueSamples;
    private long _queueTotalMicroseconds;
    private long _queueMaximumMicroseconds;
    private long _dropped;
    private long _reinstallations;

    public static long ToMicroseconds(long ticks) => (long)(ticks * MicrosecondsPerTick);

    /// <summary>Duree d'un passage dans le callback, en ticks de Stopwatch.</summary>
    public void RecordCallback(long ticks)
    {
        var microseconds = ToMicroseconds(ticks);

        Volatile.Write(ref _samples, _samples + 1);
        Volatile.Write(ref _callbackTotalMicroseconds, _callbackTotalMicroseconds + microseconds);

        if (microseconds > _callbackMaximumMicroseconds)
        {
            Volatile.Write(ref _callbackMaximumMicroseconds, microseconds);
        }

        if (microseconds > CallbackBudgetMicroseconds)
        {
            Volatile.Write(ref _overBudget, _overBudget + 1);
        }
    }

    /// <summary>Delai entre la capture dans le callback et le traitement.</summary>
    public void RecordQueueLatency(long ticks)
    {
        var microseconds = ToMicroseconds(ticks);

        Volatile.Write(ref _queueSamples, _queueSamples + 1);
        Volatile.Write(ref _queueTotalMicroseconds, _queueTotalMicroseconds + microseconds);

        if (microseconds > _queueMaximumMicroseconds)
        {
            Volatile.Write(ref _queueMaximumMicroseconds, microseconds);
        }
    }

    /// <summary>Total des pertes releve sur la file, qui tient son propre compteur.</summary>
    public void RecordDropped(long total) => Volatile.Write(ref _dropped, total);

    public void RecordReinstallation() => Volatile.Write(ref _reinstallations, _reinstallations + 1);

    /// <summary>Vrai quand la derniere mesure justifie de reinstaller le hook.</summary>
    public static bool NeedsReinstall(long ticks) => ToMicroseconds(ticks) > ReinstallThresholdMicroseconds;

    public HookHealthSnapshot Snapshot()
    {
        var samples = Volatile.Read(ref _samples);
        var queueSamples = Volatile.Read(ref _queueSamples);

        return new HookHealthSnapshot(
            samples,
            samples == 0 ? 0 : (double)Volatile.Read(ref _callbackTotalMicroseconds) / samples,
            Volatile.Read(ref _callbackMaximumMicroseconds),
            Volatile.Read(ref _overBudget),
            queueSamples == 0 ? 0 : (double)Volatile.Read(ref _queueTotalMicroseconds) / queueSamples,
            Volatile.Read(ref _queueMaximumMicroseconds),
            Volatile.Read(ref _dropped),
            Volatile.Read(ref _reinstallations));
    }
}
