namespace Peek.Core.Configuration;

/// <summary>
/// Contenu de %APPDATA%\Peek\config.json.
///
/// Le schema est complet des M0, y compris les champs que seuls M1 a M4
/// liront. Aucune migration a ecrire plus tard, aucun fichier a reparer.
/// </summary>
public sealed class PeekConfig
{
    public const int CurrentSchemaVersion = 1;

    /// <summary>
    /// Un fichier plus recent que l'application est ignore au profit des
    /// defauts, jamais reecrit a l'aveugle.
    /// </summary>
    public int SchemaVersion { get; set; } = CurrentSchemaVersion;

    public List<Shortcut> Shortcuts { get; set; } = [];

    public AdvancedSettings Advanced { get; set; } = new();

    /// <summary>Remet toutes les valeurs hors bornes a leur place.</summary>
    public void Normalize()
    {
        Advanced ??= new AdvancedSettings();
        Advanced.Normalize();

        Shortcuts ??= [];

        foreach (var shortcut in Shortcuts)
        {
            shortcut.Key ??= new KeyBinding();
            shortcut.Target ??= new WindowTarget();

            if (string.IsNullOrWhiteSpace(shortcut.Id))
            {
                shortcut.Id = Guid.NewGuid().ToString("n")[..8];
            }
        }
    }
}
