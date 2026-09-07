using Peek.Core.Configuration;

namespace Peek.Core.Windows;

/// <summary>
/// Construit la cible d'un raccourci a partir de la fenetre que l'utilisateur
/// vient de choisir.
///
/// La regle tient en une phrase et elle a des consequences : le titre n'est
/// retenu que s'il faut departager deux fenetres du meme programme. Le titre
/// d'un navigateur change a chaque onglet ; le figer casserait le raccourci des
/// le lendemain.
/// </summary>
public static class WindowTargetBuilder
{
    public static WindowTarget For(WindowInfo chosen, IReadOnlyList<WindowInfo> open)
    {
        ArgumentNullException.ThrowIfNull(open);

        var sameProcess = 0;

        foreach (var candidate in open)
        {
            if (string.Equals(candidate.ProcessName, chosen.ProcessName, StringComparison.OrdinalIgnoreCase))
            {
                sameProcess++;
            }
        }

        return new WindowTarget
        {
            ProcessName = chosen.ProcessName,
            TitlePattern = sameProcess > 1 ? chosen.Title : string.Empty,
        };
    }
}
