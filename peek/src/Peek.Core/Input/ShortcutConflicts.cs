using Peek.Core.Configuration;

namespace Peek.Core.Input;

/// <summary>Nature d'un conflit sur une touche.</summary>
public enum ConflictKind
{
    /// <summary>Deux raccourcis reclament la meme touche.</summary>
    DuplicateKey,

    /// <summary>Touche que Peek refuse de capturer.</summary>
    ReservedKey,

    /// <summary>Raccourci sans touche assignee.</summary>
    UnassignedKey,
}

/// <summary>
/// Un conflit, avec le message exact montre a l'utilisateur.
///
/// Le message fait partie de la donnee et non de l'interface : la section 6
/// demande qu'il dise ce qui s'est passe et quoi faire, et c'est ici qu'on peut
/// le verifier par un test.
/// </summary>
/// <param name="Kind">Nature du conflit.</param>
/// <param name="ShortcutId">Raccourci fautif.</param>
/// <param name="OtherShortcutId">Raccourci deja en place, pour un doublon.</param>
/// <param name="Message">Texte montre a l'utilisateur.</param>
public sealed record ShortcutConflict(
    ConflictKind Kind,
    string ShortcutId,
    string OtherShortcutId,
    string Message);

/// <summary>
/// Detection des conflits de touches, en logique pure. Utilisee par M2 pour
/// refuser une capture, et des M0 pour refuser de charger une configuration
/// ecrite a la main qui se contredit.
/// </summary>
public static class ShortcutConflicts
{
    /// <summary>
    /// Touches que Peek n'assigne jamais.
    ///
    /// Les modificateurs seuls, parce qu'ils accompagnent tout le reste et
    /// qu'un jeu en a besoin en permanence. Les boutons de souris, parce qu'un
    /// hook clavier ne les avale pas et que promettre le contraire serait
    /// mentir. Echap, parce que c'est la sortie de secours du mode utilisation
    /// et qu'elle doit rester libre.
    /// </summary>
    private static readonly int[] Reserved =
    [
        VirtualKeys.LeftButton,
        VirtualKeys.RightButton,
        VirtualKeys.Cancel,
        VirtualKeys.MiddleButton,
        VirtualKeys.XButton1,
        VirtualKeys.XButton2,
        VirtualKeys.Escape,
        VirtualKeys.Shift,
        VirtualKeys.Control,
        VirtualKeys.Menu,
        VirtualKeys.LeftWindows,
        VirtualKeys.RightWindows,
        VirtualKeys.LeftShift,
        VirtualKeys.RightShift,
        VirtualKeys.LeftControl,
        VirtualKeys.RightControl,
        VirtualKeys.LeftMenu,
        VirtualKeys.RightMenu,
    ];

    public static bool IsReserved(int virtualKey) => Array.IndexOf(Reserved, virtualKey) >= 0;

    /// <summary>Conflits d'une liste complete, dans l'ordre ou l'utilisateur les lira.</summary>
    public static IReadOnlyList<ShortcutConflict> Find(IReadOnlyList<Shortcut> shortcuts)
    {
        ArgumentNullException.ThrowIfNull(shortcuts);

        var conflicts = new List<ShortcutConflict>();
        var seen = new Dictionary<int, Shortcut>();

        foreach (var shortcut in shortcuts)
        {
            if (!shortcut.Enabled)
            {
                continue;
            }

            var key = shortcut.Key;

            if (key is null || !key.IsAssigned)
            {
                conflicts.Add(new ShortcutConflict(
                    ConflictKind.UnassignedKey,
                    shortcut.Id,
                    string.Empty,
                    "Ce raccourci n'a pas encore de touche. Appuie sur celle que tu veux lui donner."));

                continue;
            }

            if (IsReserved(key.VirtualKey))
            {
                conflicts.Add(new ShortcutConflict(
                    ConflictKind.ReservedKey,
                    shortcut.Id,
                    string.Empty,
                    $"Peek ne peut pas utiliser {Name(key)}. Choisis une autre touche."));

                continue;
            }

            if (seen.TryGetValue(key.VirtualKey, out var other))
            {
                conflicts.Add(new ShortcutConflict(
                    ConflictKind.DuplicateKey,
                    shortcut.Id,
                    other.Id,
                    $"Cette touche est déjà utilisée par le raccourci {other.DisplayName}. Choisis-en une autre."));

                continue;
            }

            seen[key.VirtualKey] = shortcut;
        }

        return conflicts;
    }

    /// <summary>
    /// Le conflit qu'une touche declencherait si on l'ajoutait maintenant.
    /// C'est la question que pose la capture de touche de M2, et elle merite sa
    /// propre entree plutot qu'un parcours de toute la liste.
    /// </summary>
    public static ShortcutConflict? Check(
        IReadOnlyList<Shortcut> existing,
        int virtualKey,
        string candidateId = "")
    {
        ArgumentNullException.ThrowIfNull(existing);

        if (virtualKey <= 0 || virtualKey >= KeyBinding.VirtualKeyCount)
        {
            return new ShortcutConflict(
                ConflictKind.UnassignedKey,
                candidateId,
                string.Empty,
                "Cette touche n'est pas utilisable. Appuie sur une autre.");
        }

        if (IsReserved(virtualKey))
        {
            return new ShortcutConflict(
                ConflictKind.ReservedKey,
                candidateId,
                string.Empty,
                "Peek ne peut pas utiliser cette touche. Choisis-en une autre.");
        }

        foreach (var shortcut in existing)
        {
            if (!shortcut.Enabled
                || shortcut.Id == candidateId
                || shortcut.Key is null
                || shortcut.Key.VirtualKey != virtualKey)
            {
                continue;
            }

            return new ShortcutConflict(
                ConflictKind.DuplicateKey,
                candidateId,
                shortcut.Id,
                $"Cette touche est déjà utilisée par le raccourci {shortcut.DisplayName}. Choisis-en une autre.");
        }

        return null;
    }

    private static string Name(KeyBinding key) =>
        string.IsNullOrWhiteSpace(key.Label) ? "cette touche" : $"la touche {key.Label}";
}
