using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows.Interop;
using Babel.Core.Settings;
using Microsoft.Extensions.Logging;

namespace Babel.App.Interop;

/// <summary>
/// Raccourcis globaux, par RegisterHotKey sur une fenetre message-only.
///
/// Choix delibere : pas de hook clavier bas niveau (WH_KEYBOARD_LL). Un hook
/// global a exactement la signature d'un enregistreur de frappe ; il attire les
/// faux positifs antivirus et l'attention des anticheat, ce qui va contre l'esprit
/// de la contrainte 1. RegisterHotKey ne voit que la combinaison demandee.
/// </summary>
internal sealed class GlobalHotkeyService : IDisposable
{
    private const int HwndMessage = -3;

    private readonly HwndSource _source;
    private readonly ILogger<GlobalHotkeyService> _logger;
    private readonly Dictionary<int, HotkeyAction> _registered = new();
    private readonly List<(HotkeyAction Action, string Gesture)> _failures = new();

    private bool _disposed;

    internal GlobalHotkeyService(ILogger<GlobalHotkeyService> logger)
    {
        _logger = logger;

        var parameters = new HwndSourceParameters("Babel.Hotkeys")
        {
            ParentWindow = new IntPtr(HwndMessage),
        };

        _source = new HwndSource(parameters);
        _source.AddHook(WndProc);
    }

    internal event Action<HotkeyAction>? Pressed;

    /// <summary>
    /// Raccourcis qui n'ont pas pu etre pris, parce qu'une autre application les
    /// detient deja. Montre a l'utilisateur dans les reglages, en clair.
    /// </summary>
    internal IReadOnlyList<(HotkeyAction Action, string Gesture)> Failures => _failures;

    internal void RegisterAll(HotkeySettings settings)
    {
        foreach (var action in Enum.GetValues<HotkeyAction>())
        {
            Register(action, settings.For(action));
        }
    }

    internal bool Register(HotkeyAction action, string gestureText)
    {
        if (!HotkeyGesture.TryParse(gestureText, out var gesture))
        {
            _logger.LogWarning("Raccourci illisible pour {Action} : {Gesture}", action, gestureText);
            _failures.Add((action, gestureText));
            return false;
        }

        var id = (int)action + 1;

        if (!NativeMethods.RegisterHotKey(_source.Handle, id, gesture.Modifiers, gesture.VirtualKey))
        {
            // Cas courant et sans gravite : une autre application tient deja la
            // combinaison. On l'expose au lieu de la subir en silence.
            _logger.LogWarning("Le raccourci {Gesture} est deja utilise par une autre application.", gestureText);
            _failures.Add((action, gestureText));
            return false;
        }

        _registered[id] = action;
        return true;
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;

        foreach (var id in _registered.Keys)
        {
            NativeMethods.UnregisterHotKey(_source.Handle, id);
        }

        _registered.Clear();
        _source.RemoveHook(WndProc);
        _source.Dispose();
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg != NativeMethods.WmHotkey)
        {
            return IntPtr.Zero;
        }

        if (_registered.TryGetValue(wParam.ToInt32(), out var action))
        {
            handled = true;
            Pressed?.Invoke(action);
        }

        return IntPtr.Zero;
    }
}
