namespace Peek.Core.Configuration;

/// <summary>
/// Reglages avances, replies derriere un lien discret dans l'interface. Les
/// bornes existent parce que le fichier est modifiable a la main : une opacite
/// a 5 ou un seuil a zero ne doit pas rendre le produit inutilisable.
/// </summary>
public sealed class AdvancedSettings
{
    public const int DefaultHoldThresholdMs = 250;
    public const int MinimumHoldThresholdMs = 80;
    public const int MaximumHoldThresholdMs = 1000;

    public const double DefaultVeilOpacity = 0.40;
    public const int DefaultAudioDuckPercent = 60;

    /// <summary>Seuil qui separe la pression breve du maintien. Section 3.</summary>
    public int HoldThresholdMs { get; set; } = DefaultHoldThresholdMs;

    /// <summary>Opacite du voile sombre, de 0 a 1. Inutilise avant M1.</summary>
    public double VeilOpacity { get; set; } = DefaultVeilOpacity;

    /// <summary>Baisse du son du jeu pendant un coup d'oeil. Inutilise avant M4.</summary>
    public int AudioDuckPercent { get; set; } = DefaultAudioDuckPercent;

    /// <summary>Lancement avec Windows. Inutilise avant M4.</summary>
    public bool StartWithWindows { get; set; }

    /// <summary>
    /// Journalisation detaillee des touches assignees. Par defaut a faux, et ce
    /// defaut est une regle de confidentialite, pas un confort : voir
    /// DECISIONS.md, D5.
    /// </summary>
    public bool DiagnosticLogging { get; set; }

    /// <summary>Ramene chaque valeur dans ses bornes. Applique apres chaque lecture du fichier.</summary>
    public void Normalize()
    {
        HoldThresholdMs = Math.Clamp(HoldThresholdMs, MinimumHoldThresholdMs, MaximumHoldThresholdMs);
        VeilOpacity = Math.Clamp(VeilOpacity, 0.0, 0.95);
        AudioDuckPercent = Math.Clamp(AudioDuckPercent, 0, 100);
    }
}
