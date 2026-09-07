using System;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.Extensions.Logging;
using Peek.Core.Input;

namespace Peek.App.Interop;

/// <summary>
/// Le hook clavier bas niveau, sur son propre fil, avec sa propre boucle de
/// messages.
///
/// RegisterHotKey ne convient pas : elle ne signale pas le relachement des
/// touches, et Peek est construit sur le maintien. Il faut donc WH_KEYBOARD_LL,
/// avec tout ce que cela impose.
///
/// I7 gouverne cette classe entiere. Le callback lit un instantane immuable,
/// copie l'evenement dans un emplacement deja reserve, reveille le fil de
/// travail, et retourne. Il n'alloue pas, ne prend aucun verrou, ne journalise
/// rien, n'appelle aucun code qui pourrait etre compile a la volee. Windows ne
/// previent pas quand un callback est trop lent : il retire le hook, et
/// l'utilisateur perd des touches sans explication.
///
/// I8 : le hook est un mecanisme public de Windows, hors du processus vise. Il
/// n'injecte rien et ne lit la memoire de personne.
/// </summary>
internal sealed unsafe class KeyboardHookThread : IDisposable
{
    private readonly KeyRingBuffer _buffer;
    private readonly AutoResetEvent _signal;
    private readonly ILogger<KeyboardHookThread> _logger;
    private readonly ManualResetEventSlim _ready = new(false);

    // Le delegue est garde dans un champ et epingle. Un delegue ramasse par le
    // ramasse-miettes pendant que Windows en detient le pointeur fait tomber le
    // processus, sans trace exploitable.
    private readonly NativeMethods.LowLevelKeyboardProc _callback;
    private GCHandle _callbackHandle;

    private Thread? _thread;
    private uint _threadId;
    private IntPtr _hook;
    private int _installError;
    private bool _disposed;

    // Ecrit par le fil du hook seulement, lu par le fil de travail.
    private long _lastCallbackTicks;

    private KeySnapshot _keys = KeySnapshot.Empty;
    private volatile bool _suspended;
    private volatile bool _capturing;
    private volatile int _swallowUpFor = -1;

    internal KeyboardHookThread(KeyRingBuffer buffer, AutoResetEvent signal, ILogger<KeyboardHookThread> logger)
    {
        _buffer = buffer;
        _signal = signal;
        _logger = logger;
        _callback = OnKeyboardEvent;
        _callbackHandle = GCHandle.Alloc(_callback);
    }

    /// <summary>Vrai quand le hook est en place et voit passer les frappes.</summary>
    internal bool IsInstalled => _hook != IntPtr.Zero;

    /// <summary>
    /// Suspend l'avalement sans retirer le hook. Utilise par l'entree « Peek est
    /// actif » du menu : les touches repartent au jeu immediatement.
    /// </summary>
    internal bool Suspended
    {
        get => _suspended;
        set => _suspended = value;
    }

    /// <summary>
    /// Remplace le jeu des touches avalees. La publication est un echange de
    /// reference : un callback en cours finit sa lecture sur l'ancienne
    /// version, complete et coherente.
    /// </summary>
    internal void UpdateKeys(KeySnapshot keys) => Volatile.Write(ref _keys, keys);

    /// <summary>
    /// Saisit la prochaine touche enfoncee, quelle qu'elle soit, au lieu de la
    /// laisser passer.
    ///
    /// C'est la seule situation ou le hook avale une touche non assignee, et
    /// elle est toujours declenchee par un geste explicite de l'utilisateur :
    /// il a cliqué sur « Ajouter » et Peek attend qu'il appuie. Le desarmement
    /// est immediat, des la premiere touche.
    /// </summary>
    internal void ArmCapture() => _capturing = true;

    internal void CancelCapture() => _capturing = false;

    /// <summary>
    /// Duree du dernier passage dans le callback, en ticks, remise a zero par la
    /// lecture. Le fil de travail echantillonne ; il peut manquer une mesure
    /// quand deux frappes se suivent de tres pres, jamais une frappe.
    /// </summary>
    internal long TakeLastCallbackTicks() => Interlocked.Exchange(ref _lastCallbackTicks, 0);

    internal bool Start()
    {
        _thread = new Thread(Run)
        {
            Name = "Peek.KeyboardHook",
            IsBackground = true,
        };

        _thread.SetApartmentState(ApartmentState.STA);
        _thread.Start();

        // Delai de garde : sans lui, un fil qui meurt avant d'avoir signale
        // bloquerait le demarrage de Peek pour toujours.
        if (!_ready.Wait(TimeSpan.FromSeconds(5)))
        {
            _logger.LogError("Le fil du hook clavier n'a pas demarre dans le delai imparti.");
            return false;
        }

        if (IsInstalled)
        {
            _logger.LogInformation("Hook clavier installe.");
            return true;
        }

        _logger.LogError(
            "Le hook clavier n'a pas pu etre installe (erreur Windows {Code}). Les raccourcis ne repondront pas.",
            _installError);

        return false;
    }

    /// <summary>
    /// Demande une reinstallation. Le fil de travail l'appelle quand une mesure
    /// approche du delai au-dela duquel Windows retirerait le hook lui-meme.
    /// </summary>
    internal void RequestReinstall()
    {
        if (_threadId != 0)
        {
            NativeMethods.PostThreadMessageW(_threadId, NativeMethods.WmReinstallHook, IntPtr.Zero, IntPtr.Zero);
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;

        if (_threadId != 0)
        {
            NativeMethods.PostThreadMessageW(_threadId, NativeMethods.WmQuit, IntPtr.Zero, IntPtr.Zero);
        }

        _thread?.Join(TimeSpan.FromSeconds(2));
        _ready.Dispose();

        if (_callbackHandle.IsAllocated)
        {
            _callbackHandle.Free();

            // Remis a zero : liberer deux fois un GCHandle fait tomber le
            // processus, et Dispose peut etre appele deux fois.
            _callbackHandle = default;
        }
    }

    private void Run()
    {
        _threadId = NativeMethods.GetCurrentThreadId();

        // Force la creation de la file de messages du fil avant l'installation :
        // un hook bas niveau n'est servi que par un fil qui en possede une.
        NativeMethods.PeekMessageW(out _, IntPtr.Zero, 0, 0, NativeMethods.PmNoRemove);

        PrepareHotPath();
        Install();

        _ready.Set();

        if (!IsInstalled)
        {
            return;
        }

        while (NativeMethods.GetMessageW(out var message, IntPtr.Zero, 0, 0) > 0)
        {
            if (message.Value == NativeMethods.WmReinstallHook)
            {
                Reinstall();
                continue;
            }

            NativeMethods.TranslateMessage(ref message);
            NativeMethods.DispatchMessageW(ref message);
        }

        Uninstall();
    }

    /// <summary>
    /// Compile le chemin chaud avant d'installer le hook. Sans cela, la toute
    /// premiere frappe paie la compilation a la volee, au moment ou le budget
    /// est le plus serre.
    /// </summary>
    private void PrepareHotPath()
    {
        try
        {
            RuntimeHelpers.PrepareDelegate(_callback);
            RuntimeHelpers.PrepareMethod(typeof(KeySnapshot).GetMethod(nameof(KeySnapshot.Contains))!.MethodHandle);
            RuntimeHelpers.PrepareMethod(typeof(KeyRingBuffer).GetMethod(nameof(KeyRingBuffer.TryEnqueue))!.MethodHandle);
        }
        catch (Exception ex) when (ex is InvalidOperationException or ArgumentException)
        {
            // Optimisation, pas une condition de fonctionnement.
            _logger.LogDebug(ex, "Preparation du chemin chaud impossible.");
        }
    }

    private void Install()
    {
        _hook = NativeMethods.SetWindowsHookExW(
            NativeMethods.WhKeyboardLowLevel,
            _callback,
            NativeMethods.GetModuleHandleW(null),
            0);

        if (_hook == IntPtr.Zero)
        {
            _installError = Marshal.GetLastWin32Error();
        }
    }

    private void Uninstall()
    {
        if (_hook == IntPtr.Zero)
        {
            return;
        }

        NativeMethods.UnhookWindowsHookEx(_hook);
        _hook = IntPtr.Zero;
    }

    private void Reinstall()
    {
        Uninstall();
        Install();

        if (IsInstalled)
        {
            _logger.LogWarning("Hook clavier reinstalle apres un callback anormalement lent.");
        }
        else
        {
            _logger.LogError("Reinstallation du hook impossible (erreur Windows {Code}).", _installError);
        }
    }

    /// <summary>
    /// Le callback. Tout ce qu'il fait est ici, et il n'en fait pas plus.
    /// </summary>
    private IntPtr OnKeyboardEvent(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode < 0)
        {
            return NativeMethods.CallNextHookEx(IntPtr.Zero, nCode, wParam, lParam);
        }

        var entry = Stopwatch.GetTimestamp();
        var swallow = false;

        try
        {
            // Dereferencement direct : Marshal.PtrToStructure allouerait, et une
            // allocation ici peut tomber pendant une pause du ramasse-miettes.
            var data = *(NativeMethods.KeyboardHookData*)lParam;
            var virtualKey = (int)data.VirtualKey;

            if ((data.Flags & NativeMethods.LlkhfInjected) == 0)
            {
                var message = (int)wParam;
                var down = message is NativeMethods.WmKeyDown or NativeMethods.WmSysKeyDown;
                var capture = _capturing && down;

                if (capture)
                {
                    // Desarme avant meme d'empiler : une repetition automatique
                    // ne doit pas produire deux captures.
                    _capturing = false;
                    _swallowUpFor = virtualKey;
                }

                // Le relachement de la touche saisie est avale lui aussi, sinon
                // l'application au premier plan recevrait un relachement seul.
                var pendingUp = !down && _swallowUpFor == virtualKey;

                if (pendingUp)
                {
                    _swallowUpFor = -1;
                }

                if (capture
                    || pendingUp
                    || (!_suspended && Volatile.Read(ref _keys).Contains(virtualKey)))
                {
                    if (!pendingUp)
                    {
                        _buffer.TryEnqueue(new KeyEvent(
                            virtualKey,
                            (int)data.ScanCode,
                            down ? KeyTransition.Down : KeyTransition.Up,
                            data.Time,
                            entry,
                            capture));

                        // Seul appel au noyau du chemin chaud, de l'ordre de la
                        // microseconde. L'alternative serait une attente active
                        // du fil de travail, et I6 l'interdit.
                        _signal.Set();
                    }

                    // I1 : la touche est avalee, le jeu ne la recoit pas.
                    swallow = true;
                }
            }
        }
        catch (Exception)
        {
            // Une exception qui remonte dans un callback de hook fait tomber le
            // processus. On laisse passer la touche et on continue.
            swallow = false;
        }

        Volatile.Write(ref _lastCallbackTicks, Stopwatch.GetTimestamp() - entry);

        return swallow
            ? new IntPtr(1)
            : NativeMethods.CallNextHookEx(IntPtr.Zero, nCode, wParam, lParam);
    }
}
