using System.Globalization;
using System.Text;

namespace Babel.Core.Diagnostics;

/// <summary>
/// Ecrit une entree datee dans PERF.md, comme l'exige la section 3 de la
/// specification. Le fichier reste sur la machine : rien n'est envoye nulle part
/// (contrainte 3).
/// </summary>
public static class PerfReportWriter
{
    /// <summary>
    /// Ajoute une session de mesure a la fin du fichier et renvoie le chemin ecrit.
    /// </summary>
    public static string Append(
        string perfFilePath,
        string sessionLabel,
        string environmentDescription,
        IReadOnlyList<LatencySnapshot> snapshots)
    {
        ArgumentException.ThrowIfNullOrEmpty(perfFilePath);
        ArgumentNullException.ThrowIfNull(snapshots);

        var builder = new StringBuilder();
        builder.AppendLine();
        builder.Append("## ")
               .Append(DateTimeOffset.Now.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture))
               .Append(" — ")
               .AppendLine(sessionLabel);
        builder.AppendLine();
        builder.Append("Environnement : ").AppendLine(environmentDescription);
        builder.AppendLine();
        builder.AppendLine("| Étage | Budget p95 | Dernier | p50 | p95 | Échantillons | Jetés | Verdict |");
        builder.AppendLine("|---|---|---|---|---|---|---|---|");

        foreach (var snapshot in snapshots)
        {
            var verdict = snapshot.SampleCount == 0
                ? "non mesuré"
                : snapshot.OverBudget ? "**hors budget**" : "tenu";

            builder.Append("| ").Append(snapshot.Name)
                   .Append(" | ").Append(Format(snapshot.BudgetMs))
                   .Append(" | ").Append(Format(snapshot.LastMs))
                   .Append(" | ").Append(Format(snapshot.P50Ms))
                   .Append(" | ").Append(Format(snapshot.P95Ms))
                   .Append(" | ").Append(snapshot.SampleCount.ToString(CultureInfo.InvariantCulture))
                   .Append(" | ").Append(snapshot.Dropped.ToString(CultureInfo.InvariantCulture))
                   .Append(" | ").Append(verdict)
                   .AppendLine(" |");
        }

        var directory = Path.GetDirectoryName(perfFilePath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        File.AppendAllText(perfFilePath, builder.ToString(), Encoding.UTF8);
        return perfFilePath;
    }

    private static string Format(double milliseconds) =>
        double.IsPositiveInfinity(milliseconds)
            ? "—"
            : milliseconds.ToString("0.00", CultureInfo.InvariantCulture) + " ms";
}
