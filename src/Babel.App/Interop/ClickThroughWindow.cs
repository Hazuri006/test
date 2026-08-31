using System;
using System.Windows;
using System.Windows.Interop;

namespace Babel.App.Interop;

/// <summary>
/// Applique aux fenetres d'overlay les styles etendus qui les rendent inertes :
/// transparentes au clic, absentes de la barre des taches et d'Alt-Tab, et
/// incapables de voler le focus au jeu.
///
/// WS_EX_NOACTIVATE ne figure pas dans la liste de la specification mais lui est
/// indispensable : sans lui, un simple affichage de la fenetre peut faire perdre
/// le focus a l'application ciblee.
/// </summary>
internal static class ClickThroughWindow
{
    internal static IntPtr HandleOf(Window window) =>
        new WindowInteropHelper(window).Handle;

    internal static void Apply(Window window, bool clickThrough)
    {
        var handle = HandleOf(window);

        if (handle == IntPtr.Zero)
        {
            return;
        }

        var style = NativeMethods.GetExtendedStyle(handle);

        style |= NativeMethods.WsExLayered
               | NativeMethods.WsExToolWindow
               | NativeMethods.WsExNoActivate;

        if (clickThrough)
        {
            style |= NativeMethods.WsExTransparent;
        }
        else
        {
            style &= ~(long)NativeMethods.WsExTransparent;
        }

        NativeMethods.SetExtendedStyle(handle, style);
    }

    /// <summary>
    /// Reaffirme la position au premier plan. Un jeu en fenetre sans bordure peut
    /// repasser devant l'overlay ; on se replace, sur notre propre fenetre
    /// uniquement, sans jamais activer quoi que ce soit.
    /// </summary>
    internal static void ReassertTopmost(Window window)
    {
        var handle = HandleOf(window);

        if (handle == IntPtr.Zero)
        {
            return;
        }

        NativeMethods.SetWindowPos(
            handle,
            NativeMethods.HwndTopmost,
            0,
            0,
            0,
            0,
            NativeMethods.SwpNoMove | NativeMethods.SwpNoSize | NativeMethods.SwpNoActivate);
    }
}
