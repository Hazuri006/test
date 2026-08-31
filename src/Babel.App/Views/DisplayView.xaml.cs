using System.Windows.Controls;
using Babel.Core.Settings;

namespace Babel.App.Views;

internal sealed partial class DisplayView : UserControl
{
    private SettingsStore? _store;
    private bool _loading;

    internal DisplayView() => InitializeComponent();

    /// <summary>Leve quand un reglage change, pour que l'overlay se replace aussitot.</summary>
    internal event Action? Changed;

    internal void Bind(SettingsStore store, HotkeySettings hotkeys)
    {
        _store = store;
        _loading = true;

        var overlay = store.Current.Overlay;

        VisibleToggle.IsChecked = overlay.Visible;
        AnchorXSlider.Value = overlay.AnchorX;
        AnchorYSlider.Value = overlay.AnchorY;
        WidthSlider.Value = overlay.WidthFraction;
        FontSizeSlider.Value = overlay.FontSize;
        BackdropSlider.Value = overlay.BackdropOpacity;
        OutlineSlider.Value = overlay.OutlineThickness;

        HotkeyHint.Text =
            $"Tu peux aussi déplacer le bandeau à la souris : {hotkeys.ToggleRepositionMode} le rend saisissable, "
            + $"{hotkeys.ToggleRepositionMode} à nouveau le repose. {hotkeys.ToggleHud} affiche les temps de réponse.";

        _loading = false;
    }

    private void OnVisibleChanged(object sender, System.Windows.RoutedEventArgs e) => Commit();

    private void OnOverlayValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e) => Commit();

    private void Commit()
    {
        if (_loading || _store is null)
        {
            return;
        }

        var overlay = _store.Current.Overlay;

        overlay.Visible = VisibleToggle.IsChecked ?? true;
        overlay.AnchorX = AnchorXSlider.Value;
        overlay.AnchorY = AnchorYSlider.Value;
        overlay.WidthFraction = WidthSlider.Value;
        overlay.FontSize = FontSizeSlider.Value;
        overlay.BackdropOpacity = BackdropSlider.Value;
        overlay.OutlineThickness = OutlineSlider.Value;

        _store.RequestSave();
        Changed?.Invoke();
    }
}
