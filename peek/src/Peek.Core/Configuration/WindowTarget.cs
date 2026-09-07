namespace Peek.Core.Configuration;

/// <summary>
/// Fenetre visee par un raccourci.
///
/// Le schema est defini des M0 alors que rien ne le lit encore : une migration
/// de fichier de configuration au jalon suivant coute plus cher que quatre
/// champs ecrits d'avance.
/// </summary>
public sealed class WindowTarget
{
    /// <summary>Nom du processus, sans extension. Critere principal.</summary>
    public string ProcessName { get; set; } = string.Empty;

    /// <summary>
    /// Fragment de titre, pour distinguer deux fenetres du meme processus. Vide
    /// signifie « n'importe quelle fenetre de ce processus ».
    /// </summary>
    public string TitlePattern { get; set; } = string.Empty;

    public bool IsAssigned => !string.IsNullOrWhiteSpace(ProcessName);
}
