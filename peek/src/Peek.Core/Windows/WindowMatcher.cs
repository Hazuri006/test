using Peek.Core.Configuration;

namespace Peek.Core.Windows;

/// <summary>
/// Retrouve la fenetre visee par un raccourci parmi celles qui sont ouvertes.
///
/// Logique pure : l'enumeration des fenetres est du Win32 et vit dans
/// Peek.App, la decision est ici et se teste sans Windows.
/// </summary>
public static class WindowMatcher
{
    /// <summary>
    /// La fenetre visee, ou rien si elle a disparu.
    ///
    /// Les candidates sont attendues dans l'ordre d'affichage, la plus en avant
    /// d'abord. A egalite de criteres, c'est donc celle que l'utilisateur a
    /// consultee le plus recemment qui gagne, ce qui est le comportement le
    /// moins surprenant quand un navigateur a douze fenetres.
    /// </summary>
    public static WindowInfo? Match(IReadOnlyList<WindowInfo> candidates, WindowTarget target)
    {
        ArgumentNullException.ThrowIfNull(candidates);
        ArgumentNullException.ThrowIfNull(target);

        if (!target.IsAssigned)
        {
            return null;
        }

        WindowInfo? fallback = null;

        foreach (var candidate in candidates)
        {
            if (!SameProcess(candidate.ProcessName, target.ProcessName))
            {
                continue;
            }

            if (string.IsNullOrWhiteSpace(target.TitlePattern))
            {
                return candidate;
            }

            if (candidate.Title.Contains(target.TitlePattern, StringComparison.OrdinalIgnoreCase))
            {
                return candidate;
            }

            // Le titre d'un navigateur change a chaque onglet. Plutot que de
            // ne rien afficher, on retient la premiere fenetre du bon
            // processus et on s'en sert si aucun titre ne correspond.
            fallback ??= candidate;
        }

        return fallback;
    }

    private static bool SameProcess(string candidate, string wanted)
    {
        if (string.IsNullOrWhiteSpace(candidate) || string.IsNullOrWhiteSpace(wanted))
        {
            return false;
        }

        return Trim(candidate).Equals(Trim(wanted), StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>L'utilisateur ecrira « chrome.exe » aussi souvent que « chrome ».</summary>
    private static ReadOnlySpan<char> Trim(string name)
    {
        var span = name.AsSpan().Trim();

        return span.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
            ? span[..^4]
            : span;
    }
}
