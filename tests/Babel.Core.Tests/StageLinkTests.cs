using Babel.Core.Pipeline;

namespace Babel.Core.Tests;

/// <summary>
/// La politique de rejet est la traduction directe de la contrainte 5 : quand le
/// consommateur prend du retard, on jette, on ne met jamais en file. Ces tests
/// sont la pour que cette regle reste vraie apres n'importe quelle refonte.
/// </summary>
public sealed class StageLinkTests
{
    [Fact]
    public void Un_consommateur_en_retard_recoit_le_message_le_plus_recent()
    {
        var link = new StageLink<int>("test", capacity: 1);

        for (var i = 1; i <= 5; i++)
        {
            Assert.True(link.Publish(i));
        }

        Assert.True(link.Reader.TryRead(out var received));
        Assert.Equal(5, received);
        Assert.False(link.Reader.TryRead(out _));
    }

    [Fact]
    public void Les_elements_jetes_sont_comptes_exactement()
    {
        var link = new StageLink<int>("test", capacity: 1);

        for (var i = 0; i < 100; i++)
        {
            link.Publish(i);
        }

        Assert.Equal(99, link.Dropped);
        Assert.Equal(100, link.Published);
    }

    [Fact]
    public void La_file_ne_grossit_jamais_au_dela_de_sa_capacite()
    {
        const int capacity = 4;
        var link = new StageLink<int>("test", capacity);

        for (var i = 0; i < 10_000; i++)
        {
            link.Publish(i);
        }

        var drained = 0;
        while (link.Reader.TryRead(out _))
        {
            drained++;
        }

        Assert.Equal(capacity, drained);
        Assert.Equal(10_000 - capacity, link.Dropped);
    }

    [Fact]
    public void Un_element_jete_est_rendu_au_pool()
    {
        var recycled = new List<int>();
        var link = new StageLink<int>("test", capacity: 1, recycle: recycled.Add);

        link.Publish(1);
        link.Publish(2);
        link.Publish(3);

        Assert.Equal([1, 2], recycled);
    }

    [Fact]
    public void Publier_sur_un_lien_termine_echoue_sans_lever()
    {
        var link = new StageLink<int>("test");
        link.Complete();

        Assert.False(link.Publish(1));
    }

    [Fact]
    public async Task Le_consommateur_voit_toujours_la_valeur_la_plus_recente_sous_charge()
    {
        var link = new StageLink<long>("test", capacity: 1);
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));

        var producer = Task.Run(
            () =>
            {
                for (long i = 1; i <= 200_000; i++)
                {
                    link.Publish(i);
                }

                link.Complete();
            },
            cts.Token);

        long previous = 0;
        var observed = 0;

        await foreach (var value in link.Reader.ReadAllAsync(cts.Token))
        {
            // Une valeur plus ancienne que la precedente signifierait que la file
            // a reordonne ou rejoue des messages : jamais acceptable.
            Assert.True(value > previous, $"{value} devrait suivre {previous}");
            previous = value;
            observed++;
        }

        await producer;

        Assert.Equal(200_000, previous);
        Assert.True(observed < 200_000, "Sans rejet, la politique DropOldest ne sert a rien.");
    }
}
