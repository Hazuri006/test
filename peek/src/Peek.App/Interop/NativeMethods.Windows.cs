using System;
using System.Runtime.InteropServices;
using System.Text;

namespace Peek.App.Interop;

/// <summary>
/// Les appels qui portent sur les fenetres.
///
/// I8, encore : tout ce qui suit est de la gestion de fenetres par les API
/// publiques de Windows. Aucun descripteur n'est ouvert sur un autre processus,
/// aucune memoire n'est lue, rien n'est injecte nulle part.
/// </summary>
internal static partial class NativeMethods
{
    internal const int GwlExStyle = -20;

    internal const long WsExTransparent = 0x0000_0020;
    internal const long WsExTopmost = 0x0000_0008;
    internal const long WsExNoActivate = 0x0800_0000;
    internal const long WsExToolWindowStyle = 0x0000_0080;
    internal const long WsExAppWindow = 0x0004_0000;

    internal const uint SwpNoSize = 0x0001;
    internal const uint SwpNoMove = 0x0002;
    internal const uint SwpNoActivate = 0x0010;
    internal const uint SwpShowWindow = 0x0040;
    internal const uint SwpNoOwnerZOrder = 0x0200;

    internal static readonly IntPtr HwndTopmost = new(-1);
    internal static readonly IntPtr HwndNoTopmost = new(-2);
    internal static readonly IntPtr HwndTop = new(0);

    internal const int SwShowMinimized = 2;
    internal const int SwMaximize = 3;
    internal const int SwShowNoActivate = 4;
    internal const int SwRestore = 9;

    internal const uint GwHwndPrev = 3;
    internal const uint GaRootOwner = 3;

    /// <summary>Fenetre presente mais non rendue : les applications du Store en laissent trainer.</summary>
    internal const uint DwmwaCloaked = 14;

    /// <summary>Dimensions reelles, ombre portee exclue. La specification le demande pour I5.</summary>
    internal const uint DwmwaExtendedFrameBounds = 9;

    internal const uint MonitorDefaultToNearest = 2;

    internal delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    internal struct Rect
    {
        internal int Left;
        internal int Top;
        internal int Right;
        internal int Bottom;

        internal int Width => Right - Left;

        internal int Height => Bottom - Top;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct WindowPlacement
    {
        internal uint Length;
        internal uint Flags;
        internal uint ShowCommand;
        internal Point MinPosition;
        internal Point MaxPosition;
        internal Rect NormalPosition;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    internal struct MonitorInfo
    {
        internal uint Size;
        internal Rect Monitor;
        internal Rect Work;
        internal uint Flags;
    }

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    internal static extern int GetWindowTextW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    internal static extern int GetWindowTextLengthW(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    internal static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll", SetLastError = true)]
    internal static extern IntPtr GetAncestor(IntPtr hWnd, uint gaFlags);

    [DllImport("user32.dll", SetLastError = true)]
    internal static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);

    [DllImport("user32.dll")]
    internal static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool GetWindowPlacement(IntPtr hWnd, ref WindowPlacement lpwndpl);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool SetWindowPlacement(IntPtr hWnd, ref WindowPlacement lpwndpl);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool SetWindowPos(
        IntPtr hWnd,
        IntPtr hWndInsertAfter,
        int x,
        int y,
        int cx,
        int cy,
        uint uFlags);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll", SetLastError = true)]
    internal static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint dwFlags);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool GetMonitorInfoW(IntPtr hMonitor, ref MonitorInfo lpmi);

    [DllImport("dwmapi.dll")]
    internal static extern int DwmGetWindowAttribute(IntPtr hWnd, uint attribute, out int value, int size);

    [DllImport("dwmapi.dll")]
    internal static extern int DwmGetWindowAttribute(IntPtr hWnd, uint attribute, out Rect value, int size);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongW", SetLastError = true)]
    private static extern int GetWindowLong32(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongW", SetLastError = true)]
    private static extern int SetWindowLong32(IntPtr hWnd, int nIndex, int dwNewLong);

    internal static long GetExtendedStyle(IntPtr handle) =>
        IntPtr.Size == 8
            ? GetWindowLongPtr64(handle, GwlExStyle).ToInt64()
            : GetWindowLong32(handle, GwlExStyle);

    internal static void SetExtendedStyle(IntPtr handle, long style)
    {
        if (IntPtr.Size == 8)
        {
            SetWindowLongPtr64(handle, GwlExStyle, new IntPtr(style));
        }
        else
        {
            SetWindowLong32(handle, GwlExStyle, (int)style);
        }
    }

    /// <summary>Rectangle physique du moniteur qui porte cette fenetre.</summary>
    internal static Rect MonitorBoundsOf(IntPtr window)
    {
        var monitor = MonitorFromWindow(window, MonitorDefaultToNearest);
        var info = new MonitorInfo { Size = (uint)Marshal.SizeOf<MonitorInfo>() };

        return GetMonitorInfoW(monitor, ref info) ? info.Monitor : default;
    }
}
