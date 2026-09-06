using System;
using System.Diagnostics;
using System.Linq;
using System.Windows.Threading;
using Microsoft.Extensions.Logging;
using Peek.App.Overlay;
using Peek.App.Windows;
using Peek.Core.Configuration;
using Peek.Core.Input;
using Peek.Core.Windows;

namespace Peek.App.Infrastructure;

/// <summary>
/// Ce qui execute les intentions : trouve la fenetre visee, l'amene devant sans
/// lui donner le focus, et la remet exactement ou elle etait.
///
/// L'ordre des operations n'est pas negociable et il vient de I4 : l'etat
/// d'origine part sur le disque **avant** la premiere modification. Si
/// l'ecriture echoue, le coup d'oeil est annule — mieux vaut ne rien faire que
/// de faire sans filet.
/// </summary>
internal sealed class PeekOrchestrator : IDisposable
{
    /// <summary>Budget d'apparition de la section 6.</summary>
    private const long AppearBudgetMilliseconds = 80;

    private readonly ConfigStore _config;
    private readonly RestoreStateStore _restore;
    private readonly Dispatcher _dispatcher;
    private readonly ILogger<PeekOrchestrator> _logger;

    private VeilWindow? _veil;
    private WindowRestorePoint? _active;
    private bool _disposed;

    internal PeekOrchestrator(
        ConfigStore config,
        RestoreStateStore restore,
        Dispatcher dispatcher,
        ILogger<PeekOrchestrator> logger)
    {
        _config = config;
        _restore = restore;
        _dispatcher = dispatcher;
        _logger = logger;
    }

    /// <summary>
    /// I4, au demarrage. Un fichier de restitution qui traine veut dire que
    /// Peek a ete tue en plein coup d'oeil : on remet tout en place avant de
    /// laisser l'utilisateur s'en apercevoir.
    /// </summary>
    internal void RecoverFromPreviousRun()
    {
        var state = _restore.Read();

        if (state is null)
        {
            return;
        }

        _logger.LogWarning(
            "Peek s'est arrete en plein coup d'oeil. Restitution de {Count} fenetre(s).",
            state.Windows.Count);

        foreach (var window in state.Windows)
        {
            TargetWindow.Restore(window);
        }

        _restore.Clear();
    }

    /// <summary>
    /// Construit le voile a l'avance, si au moins un raccourci peut le
    /// declencher.
    ///
    /// Creer une fenetre WPF transparente coute des dizaines de millisecondes.
    /// Les payer au premier coup d'oeil ferait sauter le budget de 80 ms
    /// exactement au moment ou l'utilisateur juge le produit. Sans raccourci
    /// configure, rien n'est construit et I6 est intact.
    /// </summary>
    internal void Prepare()
    {
        if (!_config.Current.Shortcuts.Any(s => s.Enabled && s.Key.IsAssigned))
        {
            return;
        }

        var veil = Veil();
        veil.Show();
        veil.Dismiss();
    }

    /// <summary>Recoit une intention depuis le fil de travail du hook.</summary>
    internal void Handle(PeekIntent intent)
    {
        if (_disposed)
        {
            return;
        }

        // Tout ce qui touche a une fenetre passe par le fil d'interface.
        _dispatcher.BeginInvoke(DispatcherPriority.Send, () => Execute(intent));
    }

    /// <summary>
    /// Referme ce qui serait encore ouvert. Appele a la fermeture de Peek, pour
    /// que l'arret normal ne laisse jamais le travail a la reprise sur plantage.
    /// </summary>
    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        End();
    }

    private void Execute(PeekIntent intent)
    {
        switch (intent.Kind)
        {
            case PeekIntentKind.Begin:
                Begin(intent.ShortcutId);
                break;

            case PeekIntentKind.End:
                End();
                break;

            case PeekIntentKind.Latch:
                // La fenetre reste affichee : il n'y a rien a faire de plus, le
                // voile et la fenetre sont deja en place.
                break;

            case PeekIntentKind.EnterUse:
                // Jalon M3. Le basculement exige d'abord de neutraliser les
                // touches maintenues, sinon le personnage continue de courir.
                _logger.LogInformation("Mode utilisation demande. Il arrive au jalon M3.");
                break;

            default:
                break;
        }
    }

    private void Begin(string shortcutId)
    {
        var started = Stopwatch.GetTimestamp();

        // Un coup d'oeil deja en cours : on le referme avant, la machine a
        // etats a deja emis le End correspondant mais l'ordre n'est pas garanti
        // si une intention s'est perdue.
        if (_active is not null)
        {
            End();
        }

        var shortcut = _config.Current.Shortcuts.FirstOrDefault(s => s.Id == shortcutId);

        if (shortcut is null)
        {
            return;
        }

        var match = WindowMatcher.Match(WindowFinder.TopLevelWindows(), shortcut.Target);

        if (match is null)
        {
            // Assombrir le jeu pour ne rien montrer serait pire que de ne rien
            // faire du tout.
            _logger.LogWarning(
                "Aucune fenetre ouverte ne correspond a {Process} pour le raccourci {Shortcut}.",
                shortcut.Target.ProcessName,
                shortcutId);

            return;
        }

        var handle = new IntPtr(match.Value.Handle);
        var capture = TargetWindow.Capture(handle, match.Value.ProcessName);

        if (capture is null)
        {
            _logger.LogWarning("L'etat de la fenetre visee n'a pas pu etre releve. Coup d'oeil annule.");
            return;
        }

        // I4 : le filet avant la modification, jamais l'inverse.
        var state = new RestoreState
        {
            OwnerProcessId = Environment.ProcessId,
            WrittenAtUtc = DateTime.UtcNow.ToString("O"),
            Windows = [capture],
        };

        if (!_restore.Write(state))
        {
            return;
        }

        _active = capture;

        // Le voile d'abord, la fenetre ensuite : parmi les fenetres topmost,
        // la derniere placee passe devant. La cible se retrouve donc au-dessus
        // du voile, et le voile au-dessus du jeu.
        Veil().Present(
            shortcut.Key.Label,
            _config.Current.Advanced.VeilOpacity,
            NativeForegroundWindow());

        TargetWindow.BringToFront(handle);

        var elapsed = Stopwatch.GetElapsedTime(started).TotalMilliseconds;

        if (elapsed > AppearBudgetMilliseconds)
        {
            _logger.LogWarning(
                "Le coup d'oeil a mis {Elapsed:F0} ms a apparaitre, au-dela du budget de {Budget} ms.",
                elapsed,
                AppearBudgetMilliseconds);
        }
    }

    private void End()
    {
        if (_active is null)
        {
            return;
        }

        var started = Stopwatch.GetTimestamp();
        var window = _active;
        _active = null;

        // Les deux operations visibles d'abord, dans le meme passage du fil
        // d'interface : elles seront composees ensemble et l'utilisateur ne
        // verra pas d'etat intermediaire.
        _veil?.Dismiss();
        TargetWindow.Restore(window);

        // Le filet ne se retire qu'une fois la fenetre reellement remise.
        _restore.Clear();

        var elapsed = Stopwatch.GetElapsedTime(started).TotalMilliseconds;

        if (elapsed > 100)
        {
            _logger.LogWarning("Le retour au jeu a mis {Elapsed:F0} ms, au-dela des 100 ms de I3.", elapsed);
        }
    }

    /// <summary>
    /// Le voile n'est construit qu'au premier coup d'oeil, puis conserve cache.
    /// Construire une fenetre WPF coute des dizaines de millisecondes : le faire
    /// a chaque fois tiendrait mal le budget de 80 ms.
    /// </summary>
    private VeilWindow Veil() => _veil ??= new VeilWindow();

    /// <summary>La fenetre de premier plan, c'est-a-dire le jeu.</summary>
    private static IntPtr NativeForegroundWindow() => Interop.NativeMethods.GetForegroundWindow();
}
