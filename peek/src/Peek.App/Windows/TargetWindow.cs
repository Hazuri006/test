using System;
using System.Runtime.InteropServices;
using Peek.App.Interop;
using Peek.Core.Configuration;

namespace Peek.App.Windows;

/// <summary>
/// Ce que Peek fait a une fenetre, et comment il le defait.
///
/// I5 impose une restitution a l'identique : position, taille, etat maximise,
/// ordre d'affichage et drapeau topmost. Chaque methode qui modifie a donc son
/// exacte contrepartie, et l'etat capture avant modification est ce qui part
/// sur le disque pour I4.
///
/// I3 impose le retour au jeu en moins de 100 ms : aucune de ces operations
/// n'attend quoi que ce soit, aucune ne prend de verrou.
/// </summary>
internal static class TargetWindow
{
    /// <summary>
    /// Photographie de l'etat d'origine, prise avant la moindre modification.
    /// </summary>
    internal static WindowRestorePoint? Capture(IntPtr handle, string processName)
    {
        if (!NativeMethods.IsWindow(handle))
        {
            return null;
        }

        var placement = new WindowPlacementBuffer();

        if (!NativeMethods.GetWindowPlacement(handle, ref placement.Value))
        {
            return null;
        }

        var style = NativeMethods.GetExtendedStyle(handle);

        return new WindowRestorePoint
        {
            WindowHandle = handle.ToInt64(),
            ProcessName = processName,
            ShowCommand = (int)placement.Value.ShowCommand,
            NormalLeft = placement.Value.NormalPosition.Left,
            NormalTop = placement.Value.NormalPosition.Top,
            NormalRight = placement.Value.NormalPosition.Right,
            NormalBottom = placement.Value.NormalPosition.Bottom,
            WasTopmost = (style & NativeMethods.WsExTopmost) != 0,

            // La fenetre situee juste devant celle-ci. C'est ce qui permet de
            // rendre l'ordre d'affichage a l'identique et pas seulement
            // « quelque part au fond ».
            InsertAfterHandle = NativeMethods.GetWindow(handle, NativeMethods.GwHwndPrev).ToInt64(),
        };
    }

    /// <summary>
    /// Amene la fenetre devant, sans lui donner le focus.
    ///
    /// SWP_NOACTIVATE est ce qui distingue le coup d'oeil d'un alt-tab : le jeu
    /// garde le clavier et la souris, et il n'a pas saute une frame.
    /// </summary>
    internal static bool BringToFront(IntPtr handle)
    {
        if (!NativeMethods.IsWindow(handle))
        {
            return false;
        }

        // Une fenetre reduite doit reapparaitre sans etre activee. SW_RESTORE
        // donnerait le focus ; SW_SHOWNOACTIVATE la rend a sa taille sans rien
        // prendre au jeu.
        if (NativeMethods.IsIconic(handle))
        {
            NativeMethods.ShowWindow(handle, NativeMethods.SwShowNoActivate);
        }

        return NativeMethods.SetWindowPos(
            handle,
            NativeMethods.HwndTopmost,
            0,
            0,
            0,
            0,
            NativeMethods.SwpNoMove | NativeMethods.SwpNoSize | NativeMethods.SwpNoActivate
                | NativeMethods.SwpShowWindow | NativeMethods.SwpNoOwnerZOrder);
    }

    /// <summary>
    /// Remet la fenetre exactement comme elle etait. Appelee au relachement, et
    /// au demarrage suivant si Peek a ete tue en plein coup d'oeil.
    /// </summary>
    internal static void Restore(WindowRestorePoint point)
    {
        ArgumentNullException.ThrowIfNull(point);

        var handle = new IntPtr(point.WindowHandle);

        // La fenetre a pu etre fermee entre-temps, y compris pendant le coup
        // d'oeil. Ce n'est pas une erreur, c'est le test 6 de la section 7.
        if (!NativeMethods.IsWindow(handle))
        {
            return;
        }

        // Windows reattribue les descripteurs de fenetre. Apres un plantage, le
        // HWND enregistre peut appartenir a une toute autre fenetre, et la
        // « restituer » reviendrait a deplacer celle d'un innocent. Le nom du
        // processus est enregistre pour cette seule raison.
        if (!string.IsNullOrEmpty(point.ProcessName) && !BelongsTo(handle, point.ProcessName))
        {
            return;
        }

        // Le drapeau topmost d'abord : il decide de la bande dans laquelle la
        // fenetre vit, et l'ordre a l'interieur de la bande se regle ensuite.
        NativeMethods.SetWindowPos(
            handle,
            point.WasTopmost ? NativeMethods.HwndTopmost : NativeMethods.HwndNoTopmost,
            0,
            0,
            0,
            0,
            NativeMethods.SwpNoMove | NativeMethods.SwpNoSize | NativeMethods.SwpNoActivate
                | NativeMethods.SwpNoOwnerZOrder);

        var insertAfter = new IntPtr(point.InsertAfterHandle);

        if (point.InsertAfterHandle != 0 && NativeMethods.IsWindow(insertAfter))
        {
            NativeMethods.SetWindowPos(
                handle,
                insertAfter,
                0,
                0,
                0,
                0,
                NativeMethods.SwpNoMove | NativeMethods.SwpNoSize | NativeMethods.SwpNoActivate
                    | NativeMethods.SwpNoOwnerZOrder);
        }

        // La position et l'etat ne sont reecrits que si Peek les a reellement
        // changes, c'est-a-dire si la fenetre etait reduite. Rejouer un
        // SetWindowPlacement sans raison ferait clignoter une fenetre maximisee.
        if (point.ShowCommand == NativeMethods.SwShowMinimized)
        {
            var placement = new WindowPlacementBuffer();
            placement.Value.ShowCommand = (uint)point.ShowCommand;
            placement.Value.NormalPosition = new NativeMethods.Rect
            {
                Left = point.NormalLeft,
                Top = point.NormalTop,
                Right = point.NormalRight,
                Bottom = point.NormalBottom,
            };

            NativeMethods.SetWindowPlacement(handle, ref placement.Value);
        }
    }

    /// <summary>Le descripteur designe-t-il toujours une fenetre de ce processus ?</summary>
    internal static bool BelongsTo(IntPtr handle, string processName)
    {
        NativeMethods.GetWindowThreadProcessId(handle, out var processId);

        if (processId == 0)
        {
            return false;
        }

        try
        {
            using var process = System.Diagnostics.Process.GetProcessById((int)processId);

            return string.Equals(process.ProcessName, processName, StringComparison.OrdinalIgnoreCase);
        }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
        {
            // Processus disparu : on ne touche a rien.
            return false;
        }
    }

    /// <summary>
    /// WINDOWPLACEMENT veut connaitre sa propre taille avant d'etre rempli, et
    /// l'oublier donne un echec silencieux.
    /// </summary>
    private struct WindowPlacementBuffer
    {
        internal NativeMethods.WindowPlacement Value = new()
        {
            Length = (uint)Marshal.SizeOf<NativeMethods.WindowPlacement>(),
        };

        public WindowPlacementBuffer()
        {
        }
    }
}
