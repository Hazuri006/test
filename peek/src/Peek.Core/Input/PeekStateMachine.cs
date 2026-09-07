using Peek.Core.Configuration;

namespace Peek.Core.Input;

/// <summary>Ou en est le raccourci actif.</summary>
public enum PeekState
{
    /// <summary>Rien d'affiche.</summary>
    Idle,

    /// <summary>Touche maintenue, coup d'oeil en cours, l'issue depend du relachement.</summary>
    Held,

    /// <summary>Pression breve : la fenetre reste affichee, touche relachee.</summary>
    Latched,

    /// <summary>Refermeture demandee, on attend le relachement pour revenir au repos.</summary>
    Closing,
}

/// <summary>
/// Logique du maintien contre la bascule, section 3, sans une ligne de Win32.
///
/// Deux consequences de la specification sont inscrites ici et il faut les
/// avoir en tete pour lire le code.
///
/// D'abord, a l'enfoncement on ne peut pas savoir si ce sera une pression breve
/// ou un maintien. Le coup d'oeil commence donc immediatement, et le seuil ne
/// decide que de ce qui se passe au relachement : refermer, ou rester. C'est
/// aussi ce qui permet au voile de tenir son budget de 80 ms.
///
/// Ensuite, les durees viennent de l'horodatage que Windows attache a
/// l'evenement, jamais d'une horloge lue au moment du traitement. Un retard du
/// fil de travail ne doit pas transformer une pression breve en maintien. La
/// classe n'a donc aucune dependance a une horloge, et ses tests sont
/// deterministes.
/// </summary>
public sealed class PeekStateMachine
{
    private readonly Dictionary<int, Shortcut> _byVirtualKey = [];

    private int _holdThresholdMs = AdvancedSettings.DefaultHoldThresholdMs;
    private int _activeVirtualKey = -1;
    private uint _pressedAtMs;

    public PeekState State { get; private set; } = PeekState.Idle;

    /// <summary>Raccourci actuellement affiche, vide au repos.</summary>
    public string ActiveShortcutId { get; private set; } = string.Empty;

    /// <summary>
    /// Installe une nouvelle configuration. Si un coup d'oeil etait en cours, il
    /// est referme : une liste de raccourcis qui change sous une fenetre
    /// affichee laisserait un etat que personne ne saurait defaire.
    /// </summary>
    public PeekIntentBatch Apply(IReadOnlyList<Shortcut> shortcuts, int holdThresholdMs)
    {
        ArgumentNullException.ThrowIfNull(shortcuts);

        var closing = CloseActive();

        _byVirtualKey.Clear();

        foreach (var shortcut in shortcuts)
        {
            if (!shortcut.Enabled || shortcut.Key is null || !shortcut.Key.IsAssigned)
            {
                continue;
            }

            // Deux raccourcis sur la meme touche : le premier gagne, et le
            // conflit est signale a l'utilisateur par ShortcutConflicts.
            _byVirtualKey.TryAdd(shortcut.Key.VirtualKey, shortcut);
        }

        _holdThresholdMs = Math.Clamp(
            holdThresholdMs,
            AdvancedSettings.MinimumHoldThresholdMs,
            AdvancedSettings.MaximumHoldThresholdMs);

        return closing;
    }

    public PeekIntentBatch Handle(in KeyEvent keyEvent) =>
        keyEvent.Transition == KeyTransition.Down
            ? HandleDown(keyEvent)
            : HandleUp(keyEvent);

    private PeekIntentBatch HandleDown(in KeyEvent keyEvent)
    {
        if (!_byVirtualKey.TryGetValue(keyEvent.VirtualKey, out var shortcut))
        {
            return PeekIntentBatch.None;
        }

        if (keyEvent.VirtualKey == _activeVirtualKey)
        {
            return State switch
            {
                // Windows renvoie des enfoncements en rafale tant que la touche
                // est tenue. Un seul appui, une seule ouverture.
                PeekState.Held or PeekState.Closing => PeekIntentBatch.None,

                // Seconde pression sur un raccourci reste affiche : on referme
                // des l'enfoncement, pour que la reaction soit immediate.
                PeekState.Latched => CloseFrom(PeekState.Closing),

                _ => Begin(shortcut, keyEvent.SystemTimeMs),
            };
        }

        if (State == PeekState.Idle)
        {
            return Begin(shortcut, keyEvent.SystemTimeMs);
        }

        // Une seule fenetre a la fois : les dispositions simultanees sont hors
        // perimetre (section 8). Le raccourci en cours se referme d'abord.
        var ending = ActiveEndIntent();
        Begin(shortcut, keyEvent.SystemTimeMs);

        return PeekIntentBatch.Of(
            ending,
            new PeekIntent(PeekIntentKind.Begin, shortcut.Id, 0));
    }

    private PeekIntentBatch HandleUp(in KeyEvent keyEvent)
    {
        if (keyEvent.VirtualKey != _activeVirtualKey)
        {
            // Relachement orphelin : touche deja enfoncee avant le demarrage de
            // Peek, ou raccourci retire entre-temps. On ignore, sans etat casse.
            return PeekIntentBatch.None;
        }

        switch (State)
        {
            case PeekState.Closing:
                Reset();
                return PeekIntentBatch.None;

            case PeekState.Held:
                break;

            default:
                return PeekIntentBatch.None;
        }

        var held = unchecked(keyEvent.SystemTimeMs - _pressedAtMs);
        var shortcutId = ActiveShortcutId;

        if (held >= (uint)_holdThresholdMs)
        {
            Reset();
            return PeekIntentBatch.Of(new PeekIntent(PeekIntentKind.End, shortcutId, held));
        }

        State = PeekState.Latched;

        var latch = new PeekIntent(PeekIntentKind.Latch, shortcutId, held);

        if (_byVirtualKey.TryGetValue(_activeVirtualKey, out var shortcut) && shortcut.Mode == PeekMode.Use)
        {
            // Le destinataire neutralise les touches maintenues avant de donner
            // le focus. Sans cela, le personnage continue de courir (I2).
            return PeekIntentBatch.Of(latch, new PeekIntent(PeekIntentKind.EnterUse, shortcutId, held));
        }

        return PeekIntentBatch.Of(latch);
    }

    private PeekIntentBatch Begin(Shortcut shortcut, uint atMs)
    {
        _activeVirtualKey = shortcut.Key.VirtualKey;
        _pressedAtMs = atMs;
        ActiveShortcutId = shortcut.Id;
        State = PeekState.Held;

        return PeekIntentBatch.Of(new PeekIntent(PeekIntentKind.Begin, shortcut.Id, 0));
    }

    private PeekIntent ActiveEndIntent() => new(PeekIntentKind.End, ActiveShortcutId, 0);

    private PeekIntentBatch CloseFrom(PeekState next)
    {
        var intent = ActiveEndIntent();
        State = next;
        return PeekIntentBatch.Of(intent);
    }

    private PeekIntentBatch CloseActive()
    {
        if (State == PeekState.Idle)
        {
            return PeekIntentBatch.None;
        }

        var intent = ActiveEndIntent();
        Reset();
        return PeekIntentBatch.Of(intent);
    }

    private void Reset()
    {
        State = PeekState.Idle;
        _activeVirtualKey = -1;
        _pressedAtMs = 0;
        ActiveShortcutId = string.Empty;
    }
}
