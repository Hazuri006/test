using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using Microsoft.Extensions.Logging;
using Peek.App.Interop;
using Peek.Core.Configuration;
using Peek.Core.Diagnostics;
using Peek.Core.Input;

namespace Peek.App.Infrastructure;

/// <summary>
/// Le fil de travail, de l'autre cote du hook.
///
/// C'est ici que se fait tout ce que le callback n'a pas le droit de faire :
/// decider ce qu'un appui veut dire, mesurer, journaliser, reinstaller le hook
/// si Windows menace de le retirer.
///
/// I6 : le fil dort sur un evenement et ne se reveille que quand une touche
/// assignee a ete pressee. Aucune scrutation, aucun minuteur.
///
/// Jalon M0 : les intentions sont journalisees et rien d'autre. Aucune fenetre
/// n'est touchee, c'est la frontiere du jalon et elle est volontaire.
/// </summary>
internal sealed class HookCoordinator : IDisposable
{
    private readonly ConfigStore _config;
    private readonly ILogger<HookCoordinator> _logger;
    private readonly KeyRingBuffer _buffer = new();
    private readonly HookHealth _health = new();
    private readonly PeekStateMachine _machine = new();
    private readonly AutoResetEvent _signal = new(false);
    private readonly KeyboardHookThread _hook;

    private Thread? _worker;
    private volatile bool _running;
    private volatile PendingConfiguration? _pending;
    private long _knownDropped;
    private bool _disposed;

    internal HookCoordinator(
        ConfigStore config,
        ILogger<HookCoordinator> logger,
        ILogger<KeyboardHookThread> hookLogger)
    {
        _config = config;
        _logger = logger;
        _hook = new KeyboardHookThread(_buffer, _signal, hookLogger);
    }

    /// <summary>
    /// Les intentions produites par la machine a etats, dans l'ordre.
    ///
    /// Emis depuis le fil de travail : l'abonne est responsable de repasser sur
    /// le fil d'interface avant de toucher a une fenetre.
    /// </summary>
    internal event Action<PeekIntent>? IntentProduced;

    /// <summary>
    /// Une touche saisie a la demande, pour etre assignee a un raccourci.
    /// Emis depuis le fil de travail, comme les intentions.
    /// </summary>
    internal event Action<KeyEvent>? KeyCaptured;

    internal bool IsInstalled => _hook.IsInstalled;

    internal int WatchedKeyCount { get; private set; }

    /// <summary>Suspend l'avalement des touches sans retirer le hook.</summary>
    internal bool Suspended
    {
        get => _hook.Suspended;
        set
        {
            _hook.Suspended = value;
            _logger.LogInformation(value ? "Peek suspendu." : "Peek actif.");
        }
    }

    /// <summary>Saisit la prochaine touche enfoncee au lieu de la laisser passer.</summary>
    internal void ArmKeyCapture() => _hook.ArmCapture();

    internal void CancelKeyCapture() => _hook.CancelCapture();

    internal bool Start()
    {
        _running = true;

        _worker = new Thread(Work)
        {
            Name = "Peek.HookWorker",
            IsBackground = true,
        };

        _worker.Start();

        var installed = _hook.Start();
        ApplyConfiguration();

        return installed;
    }

    /// <summary>
    /// Recharge les raccourcis. Appele au demarrage, et a chaque modification
    /// faite dans la fenetre.
    ///
    /// La machine a etats appartient au fil de travail et n'est touchee que par
    /// lui. Modifier son dictionnaire depuis le fil d'interface pendant qu'il y
    /// lit corromprait la structure, et le defaut ne se verrait qu'une fois sur
    /// mille, chez l'utilisateur. La nouvelle configuration est donc deposee
    /// puis appliquee par le fil de travail lui-meme.
    ///
    /// La liste est copiee au passage : l'originale continue d'etre modifiee
    /// par la fenetre pendant ce temps.
    /// </summary>
    internal void ApplyConfiguration()
    {
        var config = _config.Current;

        foreach (var conflict in ShortcutConflicts.Find(config.Shortcuts))
        {
            _logger.LogWarning("Raccourci {Shortcut} : {Message}", conflict.ShortcutId, conflict.Message);
        }

        var snapshot = KeySnapshot.FromShortcuts(config.Shortcuts);
        WatchedKeyCount = snapshot.Count;

        // Publication par echange de reference : sans danger depuis n'importe
        // quel fil, y compris pendant qu'un callback lit l'ancien instantane.
        _hook.UpdateKeys(snapshot);

        _pending = new PendingConfiguration(
            [.. config.Shortcuts.Select(Copy)],
            config.Advanced.HoldThresholdMs);

        _signal.Set();

        _logger.LogInformation(
            "{Count} touche(s) surveillee(s), seuil de maintien a {Threshold} ms.",
            snapshot.Count,
            config.Advanced.HoldThresholdMs);
    }

    /// <summary>
    /// Copie defensive d'un raccourci. La fenetre continue de modifier les
    /// siens ; le fil de travail doit lire une version figee.
    /// </summary>
    private static Shortcut Copy(Shortcut shortcut) => new()
    {
        Id = shortcut.Id,
        Mode = shortcut.Mode,
        Enabled = shortcut.Enabled,
        Key = new KeyBinding
        {
            VirtualKey = shortcut.Key.VirtualKey,
            ScanCode = shortcut.Key.ScanCode,
            Label = shortcut.Key.Label,
        },
        Target = new WindowTarget
        {
            ProcessName = shortcut.Target.ProcessName,
            TitlePattern = shortcut.Target.TitlePattern,
        },
    };

    /// <summary>Configuration deposee par la fenetre, en attente du fil de travail.</summary>
    private sealed record PendingConfiguration(IReadOnlyList<Shortcut> Shortcuts, int HoldThresholdMs);

    internal HookHealthSnapshot Health => _health.Snapshot();

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _running = false;
        _signal.Set();

        _worker?.Join(TimeSpan.FromSeconds(2));
        _hook.Dispose();

        _logger.LogInformation("Hook clavier : {Health}", _health.Snapshot().Describe());

        _signal.Dispose();
    }

    private void Work()
    {
        while (_running)
        {
            _signal.WaitOne();

            if (!_running)
            {
                return;
            }

            ApplyPending();
            Drain();
        }
    }

    /// <summary>Installe la configuration deposee. Sur le fil de travail, et lui seul.</summary>
    private void ApplyPending()
    {
        var pending = _pending;

        if (pending is null)
        {
            return;
        }

        _pending = null;

        var closing = _machine.Apply(pending.Shortcuts, pending.HoldThresholdMs);

        for (var i = 0; i < closing.Count; i++)
        {
            LogIntent(closing[i]);
        }
    }

    private void Drain()
    {
        while (_buffer.TryDequeue(out var keyEvent))
        {
            _health.RecordQueueLatency(Stopwatch.GetTimestamp() - keyEvent.CaptureTicks);
            SampleCallbackDuration();

            if (keyEvent.IsCapture)
            {
                // Une touche saisie pour etre assignee ne traverse pas la
                // machine a etats : elle n'a encore declenche aucun raccourci.
                KeyCaptured?.Invoke(keyEvent);
                continue;
            }

            var intents = _machine.Handle(keyEvent);

            for (var i = 0; i < intents.Count; i++)
            {
                LogIntent(intents[i]);
            }
        }

        ReportDropsIfAny();
    }

    private void SampleCallbackDuration()
    {
        var ticks = _hook.TakeLastCallbackTicks();

        if (ticks <= 0)
        {
            return;
        }

        _health.RecordCallback(ticks);

        if (!HookHealth.NeedsReinstall(ticks))
        {
            return;
        }

        // Windows retire un hook dont le callback depasse LowLevelHooksTimeout.
        // On reinstalle avant d'en arriver la : le hook resterait en place mais
        // inerte, et rien ne le dirait a l'utilisateur.
        _logger.LogWarning(
            "Callback du hook a {Microseconds} us, bien au-dela du budget. Reinstallation demandee.",
            HookHealth.ToMicroseconds(ticks));

        _health.RecordReinstallation();
        _hook.RequestReinstall();
    }

    private void ReportDropsIfAny()
    {
        var dropped = _buffer.Dropped;

        if (dropped == _knownDropped)
        {
            return;
        }

        _health.RecordDropped(dropped);

        _logger.LogWarning(
            "{Count} evenement(s) clavier perdus faute de place. Le fil de travail n'a pas suivi.",
            dropped - _knownDropped);

        _knownDropped = dropped;
    }

    /// <summary>
    /// L'intention part au journal, puis a qui veut l'executer.
    ///
    /// Seules les touches que l'utilisateur a lui-meme assignees peuvent
    /// arriver jusqu'ici : le callback ecarte tout le reste avant la file. La
    /// regle de confidentialite de DECISIONS.md, D5, n'est donc pas une
    /// consigne, c'est une propriete de la construction.
    /// </summary>
    private void LogIntent(in PeekIntent intent)
    {
        var verb = intent.Kind switch
        {
            PeekIntentKind.Begin => "coup d'oeil ouvert",
            PeekIntentKind.End => "coup d'oeil referme",
            PeekIntentKind.Latch => "reste affiche",
            PeekIntentKind.EnterUse => "passage en mode utilisation",
            _ => "intention inconnue",
        };

        _logger.LogInformation(
            "Raccourci {Shortcut} : {Verb} apres {Held} ms.",
            intent.ShortcutId,
            verb,
            intent.HeldMilliseconds);

        IntentProduced?.Invoke(intent);
    }
}
