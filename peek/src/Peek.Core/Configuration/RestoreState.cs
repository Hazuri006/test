namespace Peek.Core.Configuration;

/// <summary>
/// Etat d'origine des fenetres touchees, ecrit sur le disque avant toute
/// modification. C'est le filet de I4 : si Peek est tue en plein coup d'oeil,
/// le prochain demarrage lit ce fichier, restitue tout, puis le supprime.
///
/// Rien ne l'ecrit encore en M0, ou aucune fenetre n'est touchee. Le schema est
/// pose maintenant pour que I4 soit une lecture de fichier au jalon M1, et non
/// une reprise en catastrophe.
/// </summary>
public sealed class RestoreState
{
    public const int CurrentSchemaVersion = 1;

    public int SchemaVersion { get; set; } = CurrentSchemaVersion;

    /// <summary>
    /// Processus qui a ecrit le fichier. S'il tourne toujours au demarrage,
    /// c'est une seconde instance : on ne restitue rien.
    /// </summary>
    public int OwnerProcessId { get; set; }

    /// <summary>Horodatage ISO 8601 en UTC, pour un journal lisible.</summary>
    public string WrittenAtUtc { get; set; } = string.Empty;

    public List<WindowRestorePoint> Windows { get; set; } = [];
}

/// <summary>
/// Tout ce qu'il faut pour remettre une fenetre exactement ou elle etait (I5) :
/// GetWindowPlacement couvre la position, la taille et l'etat maximise ; le
/// drapeau topmost et le voisin dans l'ordre d'affichage couvrent le reste.
/// </summary>
public sealed class WindowRestorePoint
{
    public long WindowHandle { get; set; }

    public string ProcessName { get; set; } = string.Empty;

    /// <summary>WINDOWPLACEMENT.showCmd : normal, minimise ou maximise.</summary>
    public int ShowCommand { get; set; }

    public int NormalLeft { get; set; }

    public int NormalTop { get; set; }

    public int NormalRight { get; set; }

    public int NormalBottom { get; set; }

    public bool WasTopmost { get; set; }

    /// <summary>Fenetre situee juste derriere, pour rendre l'ordre d'affichage a l'identique.</summary>
    public long InsertAfterHandle { get; set; }
}
