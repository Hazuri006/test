using System;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media.Animation;
using Peek.App.Interop;

namespace Peek.App.Overlay;

/// <summary>
/// Le voile sombre, entre le jeu et la fenetre affichee.
///
/// Il ne peut pas prendre le focus et ne recoit pas les clics :
/// WS_EX_NOACTIVATE le rend inactivable, WS_EX_TRANSPARENT laisse la souris
/// passer au travers jusqu'au jeu. C'est ce qui fait que le coup d'oeil n'est
/// pas un alt-tab.
///
/// L'apparition tient dans le budget de 80 ms de la section 6. La disparition,
/// elle, n'est pas animee du tout : I3 demande le retour au jeu en moins de
/// 100 ms, et une animation de sortie serait un defaut, pas une finition.
/// </summary>
internal sealed partial class VeilWindow : Window
{
    private static readonly Duration AppearIn = new(TimeSpan.FromMilliseconds(70));

    internal VeilWindow()
    {
        InitializeComponent();
    }

    /// <summary>
    /// Affiche le voile sur le moniteur qui porte la fenetre donnee, en general
    /// celle du jeu.
    /// </summary>
    internal void Present(string shortcutLabel, double veilOpacity, IntPtr overWindow)
    {
        // Le nom du raccourci actif, et rien d'autre. Une consigne du genre
        // « maintiens G » serait fausse des que la pression breve l'a laisse
        // affiche.
        ShortcutLabel.Text = shortcutLabel;

        Veil.Opacity = veilOpacity;

        BeginAnimation(OpacityProperty, null);
        Opacity = 0;

        if (!IsVisible)
        {
            Show();
        }

        CoverMonitorOf(overWindow);

        BeginAnimation(OpacityProperty, new DoubleAnimation(0, 1, AppearIn));
    }

    /// <summary>Retire le voile immediatement. Aucune animation : voir I3.</summary>
    internal void Dismiss()
    {
        BeginAnimation(OpacityProperty, null);
        Opacity = 0;
        Hide();
    }

    protected override void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);

        var handle = new WindowInteropHelper(this).Handle;

        if (handle == IntPtr.Zero)
        {
            return;
        }

        var style = NativeMethods.GetExtendedStyle(handle);

        style |= NativeMethods.WsExNoActivate      // ne prend jamais le focus
               | NativeMethods.WsExToolWindowStyle // absente d'Alt-Tab
               | NativeMethods.WsExTransparent;    // la souris passe au travers

        NativeMethods.SetExtendedStyle(handle, style);
    }

    /// <summary>
    /// Positionne le voile en pixels physiques plutot que par Left et Top de
    /// WPF : sur une configuration a deux ecrans dont un seul est mis a
    /// l'echelle, les unites de WPF ne designent pas le rectangle attendu.
    /// </summary>
    private void CoverMonitorOf(IntPtr window)
    {
        var bounds = NativeMethods.MonitorBoundsOf(
            window == IntPtr.Zero ? new WindowInteropHelper(this).Handle : window);

        if (bounds.Width <= 0 || bounds.Height <= 0)
        {
            return;
        }

        NativeMethods.SetWindowPos(
            new WindowInteropHelper(this).Handle,
            NativeMethods.HwndTopmost,
            bounds.Left,
            bounds.Top,
            bounds.Width,
            bounds.Height,
            NativeMethods.SwpNoActivate | NativeMethods.SwpShowWindow);
    }
}
