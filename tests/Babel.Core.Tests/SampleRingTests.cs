using Babel.Core.Audio;

namespace Babel.Core.Tests;

public sealed class SampleRingTests
{
    [Fact]
    public void Un_tampon_vide_ne_rend_rien()
    {
        var ring = new SampleRing(8);
        Span<float> destination = stackalloc float[8];

        Assert.Equal(0, ring.CopyLast(8, destination));
    }

    [Fact]
    public void On_ne_peut_pas_relire_plus_que_ce_qui_a_ete_ecrit()
    {
        var ring = new SampleRing(8);
        ring.Write([1, 2, 3]);

        Span<float> destination = stackalloc float[8];

        Assert.Equal(3, ring.CopyLast(8, destination));
        Assert.Equal([1, 2, 3], destination[..3].ToArray());
    }

    [Fact]
    public void Les_echantillons_reviennent_dans_l_ordre_chronologique()
    {
        var ring = new SampleRing(8);
        ring.Write([1, 2, 3, 4, 5]);

        Span<float> destination = stackalloc float[3];

        Assert.Equal(3, ring.CopyLast(3, destination));
        Assert.Equal([3, 4, 5], destination.ToArray());
    }

    [Fact]
    public void Le_bouclage_conserve_l_ordre()
    {
        var ring = new SampleRing(4);

        // Deux tours complets : seules les quatre dernieres valeurs survivent.
        ring.Write([1, 2, 3, 4]);
        ring.Write([5, 6, 7, 8, 9]);

        Span<float> destination = stackalloc float[4];

        Assert.Equal(4, ring.CopyLast(4, destination));
        Assert.Equal([6, 7, 8, 9], destination.ToArray());
        Assert.Equal(4, ring.Available);
    }

    [Fact]
    public void Une_ecriture_plus_grande_que_le_tampon_garde_la_fin()
    {
        var ring = new SampleRing(3);
        ring.Write([1, 2, 3, 4, 5, 6, 7]);

        Span<float> destination = stackalloc float[3];

        Assert.Equal(3, ring.CopyLast(3, destination));
        Assert.Equal([5, 6, 7], destination.ToArray());
    }

    [Fact]
    public void Le_nettoyage_remet_le_tampon_a_vide()
    {
        var ring = new SampleRing(4);
        ring.Write([1, 2, 3, 4]);
        ring.Clear();

        Span<float> destination = stackalloc float[4];

        Assert.Equal(0, ring.Available);
        Assert.Equal(0, ring.CopyLast(4, destination));
    }
}
