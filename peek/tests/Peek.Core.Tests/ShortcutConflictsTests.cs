using Peek.Core.Configuration;
using Peek.Core.Input;

namespace Peek.Core.Tests;

public sealed class ShortcutConflictsTests
{
    [Fact]
    public void Une_liste_saine_ne_produit_aucun_conflit()
    {
        var conflicts = ShortcutConflicts.Find(
        [
            Keyboard.Shortcut(Keyboard.G),
            Keyboard.Shortcut(Keyboard.T),
        ]);

        Assert.Empty(conflicts);
    }

    [Fact]
    public void Deux_raccourcis_sur_la_meme_touche_se_signalent()
    {
        var conflicts = ShortcutConflicts.Find(
        [
            Keyboard.Shortcut(Keyboard.G, id: "premier"),
            Keyboard.Shortcut(Keyboard.G, id: "second"),
        ]);

        var conflict = Assert.Single(conflicts);
        Assert.Equal(ConflictKind.DuplicateKey, conflict.Kind);
        Assert.Equal("second", conflict.ShortcutId);
        Assert.Equal("premier", conflict.OtherShortcutId);
    }

    [Fact]
    public void Le_message_dit_ce_qui_se_passe_et_quoi_faire()
    {
        var conflicts = ShortcutConflicts.Find(
        [
            Keyboard.Shortcut(Keyboard.G, id: "premier"),
            Keyboard.Shortcut(Keyboard.G, id: "second"),
        ]);

        // Section 6 : jamais d'excuse, jamais de jargon, une action a la fin.
        Assert.Equal(
            "Cette touche est déjà utilisée par le raccourci G. Choisis-en une autre.",
            conflicts[0].Message);
    }

    [Theory]
    [InlineData(VirtualKeys.LeftControl)]
    [InlineData(VirtualKeys.LeftShift)]
    [InlineData(VirtualKeys.LeftWindows)]
    [InlineData(VirtualKeys.Escape)]
    [InlineData(VirtualKeys.LeftButton)]
    public void Les_touches_reservees_sont_refusees(int virtualKey)
    {
        var conflicts = ShortcutConflicts.Find([Keyboard.Shortcut(virtualKey)]);

        Assert.Equal(ConflictKind.ReservedKey, Assert.Single(conflicts).Kind);
    }

    [Fact]
    public void Un_raccourci_sans_touche_se_signale()
    {
        var conflicts = ShortcutConflicts.Find([new Shortcut { Id = "vide" }]);

        Assert.Equal(ConflictKind.UnassignedKey, Assert.Single(conflicts).Kind);
    }

    [Fact]
    public void Un_raccourci_desactive_ne_bloque_pas_sa_touche()
    {
        var conflicts = ShortcutConflicts.Find(
        [
            Keyboard.Shortcut(Keyboard.G, id: "actif"),
            Keyboard.Shortcut(Keyboard.G, id: "eteint", enabled: false),
        ]);

        Assert.Empty(conflicts);
    }

    [Fact]
    public void La_capture_de_touche_repond_avant_l_ajout()
    {
        var existing = new[] { Keyboard.Shortcut(Keyboard.G, id: "premier") };

        Assert.Null(ShortcutConflicts.Check(existing, Keyboard.T));
        Assert.Equal(ConflictKind.DuplicateKey, ShortcutConflicts.Check(existing, Keyboard.G)!.Kind);
        Assert.Equal(ConflictKind.ReservedKey, ShortcutConflicts.Check(existing, VirtualKeys.Escape)!.Kind);
        Assert.Equal(ConflictKind.UnassignedKey, ShortcutConflicts.Check(existing, 0)!.Kind);
    }

    [Fact]
    public void Reassigner_la_meme_touche_au_meme_raccourci_n_est_pas_un_conflit()
    {
        var existing = new[] { Keyboard.Shortcut(Keyboard.G, id: "premier") };

        Assert.Null(ShortcutConflicts.Check(existing, Keyboard.G, candidateId: "premier"));
    }
}
