using Peek.Core.Configuration;
using Peek.Core.Windows;

namespace Peek.Core.Tests;

public sealed class WindowMatcherTests
{
    private static WindowTarget Target(string process, string title = "") =>
        new() { ProcessName = process, TitlePattern = title };

    private static readonly WindowInfo[] Open =
    [
        new(101, "chrome", "Guide du raid — Google Chrome"),
        new(102, "chrome", "Boîte de réception — Google Chrome"),
        new(103, "Discord", "Discord"),
        new(104, "eldenring", "ELDEN RING"),
    ];

    [Fact]
    public void Le_processus_suffit_quand_il_n_y_a_pas_de_titre()
    {
        Assert.Equal(103, WindowMatcher.Match(Open, Target("Discord"))!.Value.Handle);
    }

    [Fact]
    public void A_egalite_c_est_la_fenetre_la_plus_en_avant_qui_gagne()
    {
        // Les candidates arrivent dans l'ordre d'affichage : la premiere est
        // celle que l'utilisateur a consultee le plus recemment.
        Assert.Equal(101, WindowMatcher.Match(Open, Target("chrome"))!.Value.Handle);
    }

    [Fact]
    public void Le_titre_departage_deux_fenetres_du_meme_processus()
    {
        Assert.Equal(102, WindowMatcher.Match(Open, Target("chrome", "réception"))!.Value.Handle);
    }

    [Fact]
    public void Le_titre_est_compare_sans_tenir_compte_de_la_casse()
    {
        Assert.Equal(101, WindowMatcher.Match(Open, Target("chrome", "GUIDE"))!.Value.Handle);
    }

    [Theory]
    [InlineData("chrome")]
    [InlineData("chrome.exe")]
    [InlineData("Chrome.EXE")]
    [InlineData("  chrome  ")]
    public void Le_nom_du_processus_s_ecrit_comme_on_veut(string written)
    {
        Assert.NotNull(WindowMatcher.Match(Open, Target(written)));
    }

    [Fact]
    public void Un_titre_qui_ne_correspond_plus_retombe_sur_le_processus()
    {
        // Le titre d'un navigateur change a chaque onglet. Ne rien afficher
        // serait pire que d'afficher la mauvaise fenetre du bon programme.
        var match = WindowMatcher.Match(Open, Target("chrome", "un onglet ferme depuis"));

        Assert.Equal(101, match!.Value.Handle);
    }

    [Fact]
    public void Une_fenetre_disparue_ne_renvoie_rien()
    {
        Assert.Null(WindowMatcher.Match(Open, Target("obs64")));
    }

    [Fact]
    public void Une_cible_vide_ne_renvoie_rien()
    {
        Assert.Null(WindowMatcher.Match(Open, Target("")));
        Assert.Null(WindowMatcher.Match([], Target("chrome")));
    }
}
