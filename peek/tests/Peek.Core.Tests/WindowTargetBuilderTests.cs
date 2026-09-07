using Peek.Core.Windows;

namespace Peek.Core.Tests;

public sealed class WindowTargetBuilderTests
{
    private static readonly WindowInfo Chrome1 = new(101, "chrome", "Guide du raid — Google Chrome");
    private static readonly WindowInfo Chrome2 = new(102, "chrome", "Boîte de réception — Google Chrome");
    private static readonly WindowInfo Discord = new(103, "Discord", "Discord");

    [Fact]
    public void Un_programme_a_une_seule_fenetre_ne_retient_pas_son_titre()
    {
        var target = WindowTargetBuilder.For(Discord, [Chrome1, Chrome2, Discord]);

        // Retenir « Discord » comme motif marcherait aujourd'hui et casserait le
        // jour ou le titre change. Le processus suffit.
        Assert.Equal("Discord", target.ProcessName);
        Assert.Empty(target.TitlePattern);
    }

    [Fact]
    public void Deux_fenetres_du_meme_programme_obligent_a_retenir_le_titre()
    {
        var target = WindowTargetBuilder.For(Chrome2, [Chrome1, Chrome2, Discord]);

        Assert.Equal("chrome", target.ProcessName);
        Assert.Equal("Boîte de réception — Google Chrome", target.TitlePattern);
    }

    [Fact]
    public void La_cible_construite_retrouve_bien_sa_fenetre()
    {
        var open = new[] { Chrome1, Chrome2, Discord };

        // La boucle complete : ce que l'utilisateur choisit doit etre ce que le
        // coup d'oeil affichera.
        foreach (var chosen in open)
        {
            var target = WindowTargetBuilder.For(chosen, open);

            Assert.Equal(chosen.Handle, WindowMatcher.Match(open, target)!.Value.Handle);
        }
    }

    [Fact]
    public void Une_liste_reduite_a_la_fenetre_choisie_ne_retient_pas_le_titre()
    {
        Assert.Empty(WindowTargetBuilder.For(Chrome1, [Chrome1]).TitlePattern);
    }
}
