using System;
using System.Windows.Interop;
using Microsoft.Extensions.Logging;

namespace Peek.App.Interop;

/// <summary>
/// L'icone dans la zone de notification, par Shell_NotifyIcon.
///
/// Pas de WinForms : deux boucles de messages dans un meme processus WPF ne
/// s'imposent pas pour une icone et trois entrees de menu. Pas de bibliotheque
/// tierce non plus : le produit est vendu, et chaque dependance est une licence
/// a verifier.
///
/// La fenetre qui recoit les messages est une fenetre de niveau superieur mais
/// jamais affichee, et non une fenetre a messages seuls : SetForegroundWindow
/// echoue sur ces dernieres, et un menu contextuel qui ne se referme pas au
/// clic a cote est un defaut visible.
/// </summary>
internal sealed class TrayIcon : IDisposable
{
    private const uint IconId = 1;

    private const int MenuOpen = 1;
    private const int MenuToggleSuspend = 2;
    private const int MenuOpenLogs = 3;
    private const int MenuQuit = 4;

    private const int WsPopup = unchecked((int)0x80000000);
    private const int WsExToolWindow = 0x00000080;

    private readonly HwndSource _source;
    private readonly ILogger<TrayIcon> _logger;
    private readonly uint _taskbarCreated;

    private readonly bool _ownsIcon;

    private IntPtr _icon;
    private bool _added;
    private bool _suspended;
    private bool _disposed;

    internal TrayIcon(ILogger<TrayIcon> logger)
    {
        _logger = logger;

        var parameters = new HwndSourceParameters("Peek.Tray")
        {
            Width = 1,
            Height = 1,
            PositionX = -32000,
            PositionY = -32000,
            WindowStyle = WsPopup,
            ExtendedWindowStyle = WsExToolWindow,
        };

        _source = new HwndSource(parameters);
        _source.AddHook(WndProc);

        // L'explorateur redemarre plus souvent qu'on ne croit. Sans ce message,
        // l'icone disparait definitivement et Peek devient invisible.
        _taskbarCreated = NativeMethods.RegisterWindowMessageW("TaskbarCreated");

        _icon = LoadIcon(out _ownsIcon);
        Add();
    }

    internal event Action? OpenRequested;

    internal event Action? SuspendToggled;

    internal event Action? OpenLogsRequested;

    internal event Action? QuitRequested;

    internal bool Suspended
    {
        get => _suspended;
        set
        {
            _suspended = value;
            Update();
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;

        if (_added)
        {
            var data = NewData(NativeMethods.NifMessage);
            NativeMethods.Shell_NotifyIconW(NativeMethods.NimDelete, ref data);
            _added = false;
        }

        if (_ownsIcon && _icon != IntPtr.Zero)
        {
            NativeMethods.DestroyIcon(_icon);
            _icon = IntPtr.Zero;
        }

        _source.RemoveHook(WndProc);
        _source.Dispose();
    }

    private IntPtr LoadIcon(out bool owned)
    {
        // Icone de l'executable d'abord, icone generique de Windows ensuite. Une
        // icone manquante ne doit jamais empecher Peek de demarrer.
        var fromExecutable = NativeMethods.LoadImageW(
            NativeMethods.GetModuleHandleW(null),
            "#1",
            NativeMethods.ImageIcon,
            0,
            0,
            NativeMethods.LrDefaultSize);

        if (fromExecutable != IntPtr.Zero)
        {
            owned = true;
            return fromExecutable;
        }

        owned = false;
        return NativeMethods.LoadIconW(IntPtr.Zero, new IntPtr(NativeMethods.IdiApplication));
    }

    private NativeMethods.NotifyIconData NewData(uint flags) => new()
    {
        Size = (uint)System.Runtime.InteropServices.Marshal.SizeOf<NativeMethods.NotifyIconData>(),
        Window = _source.Handle,
        Id = IconId,
        Flags = flags,
        CallbackMessage = NativeMethods.WmTrayCallback,
        Icon = _icon,
        Tip = Tooltip(),
        Info = string.Empty,
        InfoTitle = string.Empty,
        VersionOrTimeout = NativeMethods.NotifyIconVersion4,
    };

    private string Tooltip() => _suspended ? "Peek — suspendu" : "Peek";

    private void Add()
    {
        var data = NewData(NativeMethods.NifMessage | NativeMethods.NifIcon | NativeMethods.NifTip | NativeMethods.NifShowTip);

        if (!NativeMethods.Shell_NotifyIconW(NativeMethods.NimAdd, ref data))
        {
            _logger.LogError("L'icone de notification n'a pas pu etre ajoutee.");
            return;
        }

        _added = true;

        var version = NewData(0);
        NativeMethods.Shell_NotifyIconW(NativeMethods.NimSetVersion, ref version);
    }

    private void Update()
    {
        if (!_added)
        {
            return;
        }

        var data = NewData(NativeMethods.NifTip | NativeMethods.NifShowTip);
        NativeMethods.Shell_NotifyIconW(NativeMethods.NimModify, ref data);
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if ((uint)msg == _taskbarCreated)
        {
            _added = false;
            Add();
            handled = true;
            return IntPtr.Zero;
        }

        if (msg != NativeMethods.WmTrayCallback)
        {
            return IntPtr.Zero;
        }

        handled = true;

        // Version 4 du protocole : l'evenement est dans le mot bas de lParam,
        // le point d'ancrage du menu dans wParam.
        var notification = NativeMethods.LowWord(lParam);

        switch (notification)
        {
            case NativeMethods.WmContextMenu:
                ShowMenu(NativeMethods.LowWord(wParam), NativeMethods.HighWord(wParam));
                break;

            case NativeMethods.NinSelect:
            case NativeMethods.NinKeySelect:
                OpenRequested?.Invoke();
                break;

            default:
                break;
        }

        return IntPtr.Zero;
    }

    private void ShowMenu(int x, int y)
    {
        var menu = NativeMethods.CreatePopupMenu();

        if (menu == IntPtr.Zero)
        {
            return;
        }

        try
        {
            // Trois actions et une bascule. Section 6 : ce qui n'apporte rien a
            // cet instant ne s'affiche pas.
            NativeMethods.AppendMenuW(menu, NativeMethods.MfString, new UIntPtr(MenuOpen), "Ouvrir Peek");
            NativeMethods.AppendMenuW(menu, NativeMethods.MfSeparator, UIntPtr.Zero, null);

            var suspendFlags = NativeMethods.MfString | (_suspended ? 0 : NativeMethods.MfChecked);
            NativeMethods.AppendMenuW(menu, suspendFlags, new UIntPtr(MenuToggleSuspend), "Peek est actif");

            NativeMethods.AppendMenuW(menu, NativeMethods.MfString, new UIntPtr(MenuOpenLogs), "Ouvrir le dossier du journal");
            NativeMethods.AppendMenuW(menu, NativeMethods.MfSeparator, UIntPtr.Zero, null);
            NativeMethods.AppendMenuW(menu, NativeMethods.MfString, new UIntPtr(MenuQuit), "Quitter");

            // Sans ce passage au premier plan, le menu reste ouvert quand on
            // clique ailleurs. C'est le contournement documente par Microsoft.
            NativeMethods.SetForegroundWindow(_source.Handle);

            var command = NativeMethods.TrackPopupMenuEx(
                menu,
                NativeMethods.TpmRightButton | NativeMethods.TpmLeftAlign | NativeMethods.TpmBottomAlign
                    | NativeMethods.TpmReturnCmd | NativeMethods.TpmNoNotify,
                x,
                y,
                _source.Handle,
                IntPtr.Zero);

            NativeMethods.PostMessageW(_source.Handle, NativeMethods.WmNull, IntPtr.Zero, IntPtr.Zero);

            switch (command)
            {
                case MenuOpen:
                    OpenRequested?.Invoke();
                    break;

                case MenuToggleSuspend:
                    SuspendToggled?.Invoke();
                    break;

                case MenuOpenLogs:
                    OpenLogsRequested?.Invoke();
                    break;

                case MenuQuit:
                    QuitRequested?.Invoke();
                    break;

                default:
                    break;
            }
        }
        finally
        {
            NativeMethods.DestroyMenu(menu);
        }
    }
}
