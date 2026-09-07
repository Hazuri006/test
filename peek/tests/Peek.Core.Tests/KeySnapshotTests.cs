using Peek.Core.Configuration;
using Peek.Core.Input;

namespace Peek.Core.Tests;

public sealed class KeySnapshotTests
{
    [Fact]
    public void Un_instantane_vide_laisse_tout_passer()
    {
        Assert.True(KeySnapshot.Empty.IsEmpty);
        Assert.False(KeySnapshot.Empty.Contains(Keyboard.G));
    }

    [Fact]
    public void Seules_les_touches_assignees_sont_avalees()
    {
        var snapshot = KeySnapshot.FromShortcuts(
        [
            Keyboard.Shortcut(Keyboard.G),
            Keyboard.Shortcut(Keyboard.T),
        ]);

        Assert.Equal(2, snapshot.Count);
        Assert.True(snapshot.Contains(Keyboard.G));
        Assert.True(snapshot.Contains(Keyboard.T));
        Assert.False(snapshot.Contains(Keyboard.R));
    }

    [Fact]
    public void Un_raccourci_desactive_ou_sans_touche_n_avale_rien()
    {
        var snapshot = KeySnapshot.FromShortcuts(
        [
            Keyboard.Shortcut(Keyboard.G, enabled: false),
            new Shortcut { Id = "vide" },
        ]);

        Assert.True(snapshot.IsEmpty);
        Assert.False(snapshot.Contains(Keyboard.G));
    }

    [Fact]
    public void Une_touche_en_double_n_est_comptee_qu_une_fois()
    {
        var snapshot = KeySnapshot.FromShortcuts(
        [
            Keyboard.Shortcut(Keyboard.G, id: "a"),
            Keyboard.Shortcut(Keyboard.G, id: "b"),
        ]);

        Assert.Equal(1, snapshot.Count);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(0)]
    [InlineData(256)]
    [InlineData(int.MaxValue)]
    [InlineData(int.MinValue)]
    public void Un_code_hors_bornes_ne_fait_jamais_sortir_du_tableau(int virtualKey)
    {
        // Contains est appele depuis le callback du hook : une exception y tuerait
        // le processus, et Windows retirerait le hook.
        var snapshot = KeySnapshot.FromShortcuts([Keyboard.Shortcut(Keyboard.G)]);

        Assert.False(snapshot.Contains(virtualKey));
    }

    [Fact]
    public void Chaque_code_valide_se_retrouve_a_sa_place()
    {
        for (var vk = 1; vk < KeyBinding.VirtualKeyCount; vk++)
        {
            var snapshot = KeySnapshot.FromShortcuts([Keyboard.Shortcut(vk)]);

            Assert.True(snapshot.Contains(vk));
            Assert.False(snapshot.Contains(vk == 1 ? 2 : 1));
        }
    }
}
