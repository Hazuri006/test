using System;
using System.Runtime.InteropServices;

namespace Babel.App.Interop;

/// <summary>
/// Appels Win32 utilises par l'application.
///
/// Tous portent sur nos propres fenetres. Aucune lecture memoire, aucun hook, aucune
/// injection dans un autre processus : contrainte 1 de la specification.
/// </summary>
internal static class NativeMethods
{
    internal const int GwlExStyle = -20;

    internal const int WsExTransparent = 0x0000_0020;
    internal const int WsExToolWindow = 0x0000_0080;
    internal const int WsExLayered = 0x0008_0000;
    internal const int WsExNoActivate = 0x0800_0000;

    internal const uint SwpNoSize = 0x0001;
    internal const uint SwpNoMove = 0x0002;
    internal const uint SwpNoActivate = 0x0010;

    internal const int WmHotkey = 0x0312;

    internal const uint ModAlt = 0x0001;
    internal const uint ModControl = 0x0002;
    internal const uint ModShift = 0x0004;
    internal const uint ModWin = 0x0008;

    /// <summary>Sans ce drapeau, maintenir la touche declenche l'action en rafale.</summary>
    internal const uint ModNoRepeat = 0x4000;

    internal static readonly IntPtr HwndTopmost = new(-1);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongW", SetLastError = true)]
    private static extern int GetWindowLong32(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongW", SetLastError = true)]
    private static extern int SetWindowLong32(IntPtr hWnd, int nIndex, int dwNewLong);

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
    internal static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    /// <summary>Lecture des styles etendus, independamment de l'architecture.</summary>
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
}
