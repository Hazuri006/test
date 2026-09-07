using Peek.Core.Configuration;
using Peek.Core.Input;

namespace Peek.Core.Tests;

public sealed class PeekStateMachineTests
{
    private const int Threshold = AdvancedSettings.DefaultHoldThresholdMs;

    [Fact]
    public void Le_coup_d_oeil_commence_des_l_enfoncement()
    {
        var machine = Configured(Keyboard.Shortcut(Keyboard.G));

        var intents = machine.Handle(Keyboard.Down(Keyboard.G, 1000));

        // A l'enfoncement on ignore encore si ce sera un maintien ou une
        // pression breve : le voile doit apparaitre tout de suite.
        Assert.Equal(1, intents.Count);
        Assert.Equal(PeekIntentKind.Begin, intents[0].Kind);
        Assert.Equal(PeekState.Held, machine.State);
    }

    [Fact]
    public void Un_maintien_referme_au_relachement()
    {
        var machine = Configured(Keyboard.Shortcut(Keyboard.G));
        machine.Handle(Keyboard.Down(Keyboard.G, 1000));

        var intents = machine.Handle(Keyboard.Up(Keyboard.G, 1000 + Threshold));

        Assert.Equal(1, intents.Count);
        Assert.Equal(PeekIntentKind.End, intents[0].Kind);
        Assert.Equal((uint)Threshold, intents[0].HeldMilliseconds);
        Assert.Equal(PeekState.Idle, machine.State);
    }

    [Fact]
    public void Une_pression_breve_laisse_la_fenetre_affichee()
    {
        var machine = Configured(Keyboard.Shortcut(Keyboard.G));
        machine.Handle(Keyboard.Down(Keyboard.G, 1000));

        var intents = machine.Handle(Keyboard.Up(Keyboard.G, 1000 + Threshold - 1));

        Assert.Equal(1, intents.Count);
        Assert.Equal(PeekIntentKind.Latch, intents[0].Kind);
        Assert.Equal(PeekState.Latched, machine.State);
    }

    [Fact]
    public void Une_pression_breve_en_mode_utilisation_demande_le_focus()
    {
        var machine = Configured(Keyboard.Shortcut(Keyboard.G, mode: PeekMode.Use));
        machine.Handle(Keyboard.Down(Keyboard.G, 1000));

        var intents = machine.Handle(Keyboard.Up(Keyboard.G, 1050));

        Assert.Equal(2, intents.Count);
        Assert.Equal(PeekIntentKind.Latch, intents[0].Kind);
        Assert.Equal(PeekIntentKind.EnterUse, intents[1].Kind);
    }

    [Fact]
    public void Une_seconde_pression_referme_des_l_enfoncement()
    {
        var machine = Configured(Keyboard.Shortcut(Keyboard.G));
        machine.Handle(Keyboard.Down(Keyboard.G, 1000));
        machine.Handle(Keyboard.Up(Keyboard.G, 1050));

        var closing = machine.Handle(Keyboard.Down(Keyboard.G, 2000));
        var released = machine.Handle(Keyboard.Up(Keyboard.G, 2100));

        Assert.Equal(1, closing.Count);
        Assert.Equal(PeekIntentKind.End, closing[0].Kind);
        Assert.Equal(0, released.Count);
        Assert.Equal(PeekState.Idle, machine.State);
    }

    [Fact]
    public void La_repetition_automatique_n_ouvre_rien_de_plus()
    {
        var machine = Configured(Keyboard.Shortcut(Keyboard.G));
        machine.Handle(Keyboard.Down(Keyboard.G, 1000));

        // Windows renvoie des enfoncements tant que la touche est tenue.
        for (uint t = 1030; t < 1200; t += 30)
        {
            Assert.Equal(0, machine.Handle(Keyboard.Down(Keyboard.G, t)).Count);
        }

        Assert.Equal(PeekState.Held, machine.State);
    }

    [Fact]
    public void Un_relachement_orphelin_est_ignore()
    {
        var machine = Configured(Keyboard.Shortcut(Keyboard.G));

        // Touche deja enfoncee avant le demarrage de Peek.
        var intents = machine.Handle(Keyboard.Up(Keyboard.G, 1000));

        Assert.Equal(0, intents.Count);
        Assert.Equal(PeekState.Idle, machine.State);
    }

    [Fact]
    public void Un_second_raccourci_referme_le_premier()
    {
        var machine = Configured(
            Keyboard.Shortcut(Keyboard.G, id: "g"),
            Keyboard.Shortcut(Keyboard.T, id: "t"));

        machine.Handle(Keyboard.Down(Keyboard.G, 1000));
        var intents = machine.Handle(Keyboard.Down(Keyboard.T, 1100));

        // Une seule fenetre a la fois : les dispositions simultanees sont hors
        // perimetre pour la version 1.
        Assert.Equal(2, intents.Count);
        Assert.Equal(PeekIntentKind.End, intents[0].Kind);
        Assert.Equal("g", intents[0].ShortcutId);
        Assert.Equal(PeekIntentKind.Begin, intents[1].Kind);
        Assert.Equal("t", intents[1].ShortcutId);
        Assert.Equal("t", machine.ActiveShortcutId);
    }

    [Fact]
    public void Une_touche_non_assignee_ne_produit_rien()
    {
        var machine = Configured(Keyboard.Shortcut(Keyboard.G));

        Assert.Equal(0, machine.Handle(Keyboard.Down(Keyboard.R, 1000)).Count);
        Assert.Equal(PeekState.Idle, machine.State);
    }

    [Fact]
    public void Un_raccourci_desactive_est_ignore()
    {
        var machine = Configured(Keyboard.Shortcut(Keyboard.G, enabled: false));

        Assert.Equal(0, machine.Handle(Keyboard.Down(Keyboard.G, 1000)).Count);
    }

    [Fact]
    public void Le_compteur_de_Windows_peut_repasser_par_zero_sans_fausser_la_duree()
    {
        var machine = Configured(Keyboard.Shortcut(Keyboard.G));

        // GetTickCount revient a zero au bout de 49,7 jours de fonctionnement.
        // Une soustraction non protegee ferait ici un maintien de 49 jours.
        machine.Handle(Keyboard.Down(Keyboard.G, uint.MaxValue - 50));
        var intents = machine.Handle(Keyboard.Up(Keyboard.G, 49));

        Assert.Equal(PeekIntentKind.Latch, intents[0].Kind);
        Assert.Equal(100u, intents[0].HeldMilliseconds);
    }

    [Fact]
    public void Changer_la_configuration_referme_ce_qui_etait_affiche()
    {
        var machine = Configured(Keyboard.Shortcut(Keyboard.G, id: "g"));
        machine.Handle(Keyboard.Down(Keyboard.G, 1000));

        var intents = machine.Apply([Keyboard.Shortcut(Keyboard.T, id: "t")], Threshold);

        Assert.Equal(1, intents.Count);
        Assert.Equal(PeekIntentKind.End, intents[0].Kind);
        Assert.Equal("g", intents[0].ShortcutId);
        Assert.Equal(PeekState.Idle, machine.State);
    }

    [Fact]
    public void Le_seuil_reste_dans_ses_bornes()
    {
        var machine = new PeekStateMachine();
        machine.Apply([Keyboard.Shortcut(Keyboard.G)], holdThresholdMs: 5);

        machine.Handle(Keyboard.Down(Keyboard.G, 1000));
        var intents = machine.Handle(Keyboard.Up(Keyboard.G, 1000 + AdvancedSettings.MinimumHoldThresholdMs));

        // Un seuil a 5 ms rendrait toute pression breve impossible : il est
        // ramene au minimum utilisable.
        Assert.Equal(PeekIntentKind.End, intents[0].Kind);
    }

    private static PeekStateMachine Configured(params Shortcut[] shortcuts)
    {
        var machine = new PeekStateMachine();
        machine.Apply(shortcuts, Threshold);
        return machine;
    }
}
