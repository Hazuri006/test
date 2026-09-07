using Babel.Core.Audio;

namespace Babel.Core.Tests;

/// <summary>
/// Le decoupage en phrases est la piece la plus facile a casser du jalon M1 et la
/// plus facile a tester : elle ne voit que des probabilites, jamais du son.
///
/// Avec les valeurs par defaut et des trames de 32 ms :
/// ouverture apres 3 trames de parole, fermeture apres 7 trames de silence,
/// hypothese partielle toutes les 16 trames, plafond a 94 trames.
/// </summary>
public sealed class VadSegmenterTests
{
    private const double Speech = 0.9;
    private const double Silence = 0.1;

    private const int OpenFrames = 3;
    private const int HangoverFrames = 7;
    private const int PartialFrames = 16;

    private static List<VadEvent> Feed(VadSegmenter segmenter, double probability, int times)
    {
        var events = new List<VadEvent>();

        for (var i = 0; i < times; i++)
        {
            events.Add(segmenter.Feed(probability));
        }

        return events;
    }

    [Fact]
    public void Le_silence_ne_declenche_rien()
    {
        var segmenter = new VadSegmenter();

        Assert.All(Feed(segmenter, Silence, 200), e => Assert.Equal(VadEvent.None, e));
        Assert.False(segmenter.InSpeech);
    }

    [Fact]
    public void Une_impulsion_trop_breve_n_ouvre_pas_de_phrase()
    {
        var segmenter = new VadSegmenter();

        // Un claquement de porte ne doit pas devenir un sous-titre.
        Assert.All(Feed(segmenter, Speech, OpenFrames - 1), e => Assert.Equal(VadEvent.None, e));
        Assert.False(segmenter.InSpeech);
    }

    [Fact]
    public void Une_phrase_s_ouvre_apres_la_duree_minimale_de_parole()
    {
        var segmenter = new VadSegmenter();

        var events = Feed(segmenter, Speech, OpenFrames);

        Assert.Equal(VadEvent.SpeechStarted, events[^1]);
        Assert.All(events[..^1], e => Assert.Equal(VadEvent.None, e));
        Assert.True(segmenter.InSpeech);

        // L'appelant doit reprendre ces trames dans son tampon d'amorce, sinon la
        // premiere syllabe de chaque phrase est perdue.
        Assert.Equal(OpenFrames, segmenter.LeadInFrames);
    }

    [Fact]
    public void Une_phrase_se_ferme_apres_le_silence_de_fin()
    {
        var segmenter = new VadSegmenter();
        Feed(segmenter, Speech, OpenFrames);
        Feed(segmenter, Speech, 20);

        var events = Feed(segmenter, Silence, HangoverFrames);

        Assert.Equal(VadEvent.SegmentEnded, events[^1]);
        Assert.All(events[..^1], e => Assert.Equal(VadEvent.None, e));
        Assert.False(segmenter.InSpeech);
    }

    [Fact]
    public void Une_respiration_ne_coupe_pas_la_phrase_en_deux()
    {
        var segmenter = new VadSegmenter();
        Feed(segmenter, Speech, OpenFrames + 10);

        var pause = Feed(segmenter, Silence, HangoverFrames - 1);
        var resumed = Feed(segmenter, Speech, 5);

        Assert.DoesNotContain(VadEvent.SegmentEnded, pause);
        Assert.DoesNotContain(VadEvent.SegmentEnded, resumed);
        Assert.True(segmenter.InSpeech);
    }

    [Fact]
    public void Un_segment_trop_court_est_jete_au_lieu_d_etre_transcrit()
    {
        var segmenter = new VadSegmenter();
        Feed(segmenter, Speech, OpenFrames);

        var events = Feed(segmenter, Silence, HangoverFrames);

        Assert.Equal(VadEvent.SegmentDiscarded, events[^1]);
        Assert.False(segmenter.InSpeech);
    }

    [Fact]
    public void Un_monologue_continu_est_coupe_au_plafond()
    {
        var options = new VadOptions();
        var segmenter = new VadSegmenter(options);
        var maxFrames = (int)Math.Ceiling(options.MaxSegmentMilliseconds / AudioFormat.FrameMilliseconds);

        Feed(segmenter, Speech, OpenFrames);
        var events = Feed(segmenter, Speech, maxFrames);

        // Sans ce plafond, quelqu'un qui parle sans respirer ne produirait jamais
        // le moindre sous-titre.
        Assert.Contains(VadEvent.SegmentEnded, events);
        Assert.Equal(maxFrames - OpenFrames, events.IndexOf(VadEvent.SegmentEnded) + 1);
    }

    [Fact]
    public void Les_hypotheses_partielles_arrivent_a_cadence_reguliere()
    {
        var segmenter = new VadSegmenter();
        Feed(segmenter, Speech, OpenFrames);

        var events = Feed(segmenter, Speech, PartialFrames * 3);
        var positions = events
            .Select((e, i) => (Event: e, Index: i))
            .Where(pair => pair.Event == VadEvent.PartialDue)
            .Select(pair => pair.Index)
            .ToArray();

        Assert.Equal([PartialFrames - 1, (PartialFrames * 2) - 1, (PartialFrames * 3) - 1], positions);
    }

    [Fact]
    public void Deux_phrases_successives_sont_decoupees_independamment()
    {
        var segmenter = new VadSegmenter();

        for (var round = 0; round < 3; round++)
        {
            Assert.Equal(VadEvent.SpeechStarted, Feed(segmenter, Speech, OpenFrames)[^1]);
            Feed(segmenter, Speech, 20);
            Assert.Equal(VadEvent.SegmentEnded, Feed(segmenter, Silence, HangoverFrames)[^1]);
            Assert.False(segmenter.InSpeech);
        }
    }

    [Fact]
    public void Un_silence_de_fin_plus_court_retarde_moins_l_affichage()
    {
        // Le compromis central du jalon, rendu explicite : la duree de silence
        // exigee s'ajoute telle quelle a la latence percue.
        var court = new VadSegmenter(new VadOptions { HangoverMilliseconds = 100 });
        var long_ = new VadSegmenter(new VadOptions { HangoverMilliseconds = 400 });

        foreach (var segmenter in new[] { court, long_ })
        {
            Feed(segmenter, Speech, OpenFrames + 20);
        }

        var framesCourt = CountUntilEnd(court);
        var framesLong = CountUntilEnd(long_);

        Assert.True(framesCourt < framesLong);
        Assert.Equal(4, framesCourt);
        Assert.Equal(13, framesLong);
    }

    private static int CountUntilEnd(VadSegmenter segmenter)
    {
        for (var i = 1; i <= 100; i++)
        {
            if (segmenter.Feed(Silence) is VadEvent.SegmentEnded or VadEvent.SegmentDiscarded)
            {
                return i;
            }
        }

        return -1;
    }
}
