using System.Buffers;
using System.Diagnostics;

namespace Babel.Core.Diagnostics;

/// <summary>
/// Enregistre les latences d'un etage dans un anneau prealloue.
///
/// Contrainte de la section 3 : aucune allocation sur le chemin chaud.
/// <see cref="Record"/> n'ecrit que deux valeurs et n'alloue rien. Le tri et le
/// calcul des centiles sont faits dans <see cref="Snapshot"/>, appele a 4 Hz par
/// le HUD, ou le cout est sans consequence.
/// </summary>
public sealed class LatencyRecorder
{
    /// <summary>Puissance de deux : le modulo devient un masque.</summary>
    public const int Capacity = 512;

    private const int Mask = Capacity - 1;

    private readonly long[] _samples = new long[Capacity];
    private long _count;
    private long _last;
    private long _dropped;

    public LatencyRecorder(string name, double budgetMs)
    {
        Name = name;
        BudgetMs = budgetMs;
    }

    public string Name { get; }

    public double BudgetMs { get; }

    /// <summary>Enregistre une duree deja mesuree, exprimee en ticks de <see cref="Stopwatch"/>.</summary>
    public void Record(long elapsedTicks)
    {
        if (elapsedTicks < 0)
        {
            elapsedTicks = 0;
        }

        Volatile.Write(ref _last, elapsedTicks);

        var slot = (int)((ulong)(Interlocked.Increment(ref _count) - 1) & Mask);
        Volatile.Write(ref _samples[slot], elapsedTicks);
    }

    /// <summary>
    /// Enregistre le temps ecoule depuis un horodatage obtenu par
    /// <see cref="Stopwatch.GetTimestamp"/>.
    /// </summary>
    public void RecordSince(long startTimestamp) =>
        Record(Stopwatch.GetTimestamp() - startTimestamp);

    /// <summary>Signale des elements jetes par la politique de rejet.</summary>
    public void RecordDropped(long count = 1) => Interlocked.Add(ref _dropped, count);

    /// <summary>Force le compteur de rejets sur la valeur tenue par un lien.</summary>
    public void SetDropped(long total) => Interlocked.Exchange(ref _dropped, total);

    public void Reset()
    {
        Interlocked.Exchange(ref _count, 0);
        Interlocked.Exchange(ref _last, 0);
        Interlocked.Exchange(ref _dropped, 0);
        Array.Clear(_samples);
    }

    public LatencySnapshot Snapshot()
    {
        var total = Interlocked.Read(ref _count);
        var dropped = Interlocked.Read(ref _dropped);

        if (total == 0)
        {
            return LatencySnapshot.Empty(Name, BudgetMs) with { Dropped = dropped };
        }

        var available = (int)Math.Min(total, Capacity);
        var buffer = ArrayPool<long>.Shared.Rent(available);

        try
        {
            for (var i = 0; i < available; i++)
            {
                buffer[i] = Volatile.Read(ref _samples[i]);
            }

            var window = buffer.AsSpan(0, available);
            window.Sort();

            return new LatencySnapshot(
                Name,
                BudgetMs,
                available,
                ToMilliseconds(Volatile.Read(ref _last)),
                ToMilliseconds(Percentile(window, 0.50)),
                ToMilliseconds(Percentile(window, 0.95)),
                dropped);
        }
        finally
        {
            ArrayPool<long>.Shared.Return(buffer);
        }
    }

    /// <summary>Centile par rang le plus proche, sur un echantillon deja trie.</summary>
    private static long Percentile(ReadOnlySpan<long> sorted, double percentile)
    {
        var rank = (int)Math.Ceiling(percentile * sorted.Length) - 1;
        return sorted[Math.Clamp(rank, 0, sorted.Length - 1)];
    }

    private static double ToMilliseconds(long ticks) =>
        ticks * 1000.0 / Stopwatch.Frequency;
}
