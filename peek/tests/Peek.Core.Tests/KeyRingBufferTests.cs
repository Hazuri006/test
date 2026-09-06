using Peek.Core.Input;

namespace Peek.Core.Tests;

public sealed class KeyRingBufferTests
{
    [Fact]
    public void Une_capacite_qui_n_est_pas_une_puissance_de_deux_est_refusee()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new KeyRingBuffer(1000));
        Assert.Throws<ArgumentOutOfRangeException>(() => new KeyRingBuffer(1));
    }

    [Fact]
    public void Les_evenements_ressortent_dans_l_ordre()
    {
        var buffer = new KeyRingBuffer(4);

        for (var i = 1; i <= 4; i++)
        {
            Assert.True(buffer.TryEnqueue(Keyboard.Down(i, (uint)i)));
        }

        for (var i = 1; i <= 4; i++)
        {
            Assert.True(buffer.TryDequeue(out var item));
            Assert.Equal(i, item.VirtualKey);
        }

        Assert.False(buffer.TryDequeue(out _));
        Assert.True(buffer.IsEmpty);
    }

    [Fact]
    public void Une_file_pleine_compte_les_pertes_au_lieu_d_attendre()
    {
        var buffer = new KeyRingBuffer(2);

        Assert.True(buffer.TryEnqueue(Keyboard.Down(1, 1)));
        Assert.True(buffer.TryEnqueue(Keyboard.Down(2, 2)));

        // Le callback du hook ne doit jamais attendre : il perd l'evenement et
        // le fil de travail le verra dans le compteur.
        Assert.False(buffer.TryEnqueue(Keyboard.Down(3, 3)));
        Assert.Equal(1, buffer.Dropped);
    }

    [Fact]
    public void Les_index_se_replient_sans_perdre_d_evenement()
    {
        var buffer = new KeyRingBuffer(2);

        for (var i = 0; i < 100; i++)
        {
            Assert.True(buffer.TryEnqueue(Keyboard.Down(i, (uint)i)));
            Assert.True(buffer.TryDequeue(out var item));
            Assert.Equal(i, item.VirtualKey);
        }

        Assert.Equal(0, buffer.Dropped);
    }

    [Fact]
    public async Task Un_producteur_et_un_consommateur_gardent_l_ordre_sous_charge()
    {
        const int total = 200_000;

        var buffer = new KeyRingBuffer(1024);
        var received = 0;
        var refused = 0L;

        var consumer = Task.Run(() =>
        {
            while (received < total)
            {
                if (buffer.TryDequeue(out var item))
                {
                    // Rien ne se perd et rien ne se double : c'est la propriete
                    // dont depend I2, un relachement perdu laisse une touche
                    // bloquee dans le jeu.
                    Assert.Equal(received % 254 + 1, item.VirtualKey);
                    received++;
                }
            }
        });

        var producer = Task.Run(() =>
        {
            for (var i = 0; i < total; i++)
            {
                while (!buffer.TryEnqueue(Keyboard.Down(i % 254 + 1, (uint)i)))
                {
                    // Le test a le droit d'attendre que le consommateur passe ;
                    // le callback du hook, lui, ne l'a pas, et c'est pour cela
                    // qu'un refus compte comme une perte.
                    refused++;
                    Thread.SpinWait(1);
                }
            }
        });

        await Task.WhenAll(producer, consumer);

        Assert.Equal(total, received);
        Assert.Equal(refused, buffer.Dropped);
    }
}
