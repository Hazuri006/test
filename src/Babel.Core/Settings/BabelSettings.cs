namespace Babel.Core.Settings;

/// <summary>
/// Reglages de l'application.
///
/// Decision D4 : JSON pour les reglages globaux, SQLite a partir de M4 pour les
/// profils et glossaires. Voir DECISIONS.md.
/// </summary>
public sealed class BabelSettings
{
    /// <summary>
    /// Version du schema. Incrementee quand une migration devient necessaire ;
    /// un fichier plus recent que l'application est ignore au profit des defauts.
    /// </summary>
    public int SchemaVersion { get; set; } = CurrentSchemaVersion;

    public const int CurrentSchemaVersion = 1;

    public OverlaySettings Overlay { get; set; } = new();

    public HotkeySettings Hotkeys { get; set; } = new();

    /// <summary>Etat d'affichage du HUD de latence au demarrage.</summary>
    public bool HudVisible { get; set; }

    /// <summary>Identifiant du peripherique de sortie surveille. Inutilise avant M1.</summary>
    public string AudioDeviceId { get; set; } = string.Empty;

    /// <summary>Langue source. Inutilise avant M2.</summary>
    public string SourceLanguage { get; set; } = "ja";

    /// <summary>Langue cible. Inutilise avant M2.</summary>
    public string TargetLanguage { get; set; } = "fr";
}
