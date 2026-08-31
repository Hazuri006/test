using Babel.Core.Settings;

namespace Babel.Core.Tests;

public sealed class OverlayPlacementTests
{
    private static readonly WorkArea Fhd = new(0, 0, 1920, 1040);

    [Fact]
    public void La_position_par_defaut_est_centree_en_bas()
    {
        var rect = OverlayPlacement.Resolve(Fhd, new OverlaySettings(), height: 120);

        Assert.Equal(1920 * 0.7, rect.Width, 1);
        Assert.Equal(960, rect.X + (rect.Width / 2), 1);
        Assert.True(rect.Bottom <= Fhd.Height);
    }

    [Fact]
    public void L_overlay_reste_entierement_dans_la_zone_de_travail()
    {
        var settings = new OverlaySettings { AnchorX = 1.0, AnchorY = 1.0 };

        var rect = OverlayPlacement.Resolve(Fhd, settings, height: 200);

        Assert.True(rect.X >= 0);
        Assert.True(rect.Y >= 0);
        Assert.True(rect.Right <= Fhd.Width);
        Assert.True(rect.Bottom <= Fhd.Height);
    }

    [Fact]
    public void Un_moniteur_secondaire_decale_ne_perd_pas_l_overlay()
    {
        var secondary = new WorkArea(-1920, 200, 1920, 1080);

        var rect = OverlayPlacement.Resolve(secondary, new OverlaySettings(), height: 120);

        Assert.True(rect.X >= secondary.X);
        Assert.True(rect.Right <= secondary.X + secondary.Width);
        Assert.True(rect.Y >= secondary.Y);
    }

    [Theory]
    [InlineData(0.40, 0.40)]
    [InlineData(0.50, 0.82)]
    [InlineData(0.60, 0.10)]
    public void Le_deplacement_a_la_souris_revient_sur_les_memes_ancrages(double anchorX, double anchorY)
    {
        var settings = new OverlaySettings { AnchorX = anchorX, AnchorY = anchorY };

        var rect = OverlayPlacement.Resolve(Fhd, settings, height: 120);
        var (roundTripX, roundTripY) = OverlayPlacement.ToAnchors(Fhd, rect);

        Assert.Equal(anchorX, roundTripX, 3);
        Assert.Equal(anchorY, roundTripY, 3);
    }

    [Fact]
    public void Un_ancrage_recadre_se_stabilise_des_le_premier_aller_retour()
    {
        // Pres du bord, le recadrage deplace volontairement l'overlay : l'aller-retour
        // n'est donc pas l'identite. Ce qui compte, c'est qu'il converge tout de suite,
        // sinon la position deriverait a chaque sauvegarde des reglages.
        var settings = new OverlaySettings { AnchorX = 0.95, AnchorY = 0.99 };

        var first = OverlayPlacement.Resolve(Fhd, settings, height: 120);
        var (anchorX, anchorY) = OverlayPlacement.ToAnchors(Fhd, first);

        var second = OverlayPlacement.Resolve(
            Fhd,
            new OverlaySettings { AnchorX = anchorX, AnchorY = anchorY },
            height: 120);

        Assert.Equal(first, second);
    }

    [Fact]
    public void Un_changement_de_resolution_conserve_la_position_relative()
    {
        var settings = new OverlaySettings { AnchorX = 0.3, AnchorY = 0.7 };

        var onFhd = OverlayPlacement.Resolve(Fhd, settings, height: 120);
        var onUhd = OverlayPlacement.Resolve(new WorkArea(0, 0, 3840, 2120), settings, height: 120);

        Assert.Equal(
            (onFhd.X + (onFhd.Width / 2)) / 1920,
            (onUhd.X + (onUhd.Width / 2)) / 3840,
            3);
    }

    [Fact]
    public void Une_largeur_absurde_est_ramenee_dans_les_bornes()
    {
        var settings = new OverlaySettings { WidthFraction = 12 };

        var rect = OverlayPlacement.Resolve(Fhd, settings, height: 120);

        Assert.Equal(Fhd.Width, rect.Width, 1);
    }
}
