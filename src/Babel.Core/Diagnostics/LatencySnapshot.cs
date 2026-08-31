namespace Babel.Core.Diagnostics;

/// <summary>
/// Releve instantane d'un etage. Produit a la cadence de rafraichissement du HUD,
/// jamais sur le chemin du sous-titre.
/// </summary>
public readonly record struct LatencySnapshot(
    string Name,
    double BudgetMs,
    int SampleCount,
    double LastMs,
    double P50Ms,
    double P95Ms,
    long Dropped)
{
    /// <summary>Vrai quand le p95 mesure depasse le budget de la specification.</summary>
    public bool OverBudget => SampleCount > 0 && P95Ms > BudgetMs;

    public static LatencySnapshot Empty(string name, double budgetMs) =>
        new(name, budgetMs, 0, 0, 0, 0, 0);
}
