using System.Globalization;
using System.Windows;
using Peek.App.Infrastructure;
using Peek.Core.Configuration;

namespace Peek.App.Views;

/// <summary>
/// L'unique fenetre de Peek.
///
/// Au jalon M0 elle ne fait qu'exister : la capture de touche et la liste des
/// raccourcis arrivent a M2. Elle est ecrite maintenant pour que la palette, la
/// mise a l'echelle par ecran et le cycle de vie de la fenetre soient eprouves
/// tot, et non decouverts au jalon ou ils comptent.
/// </summary>
internal sealed partial class SettingsWindow : Window
{
    private readonly ConfigStore _config;
    private readonly HookCoordinator _hook;

    internal SettingsWindow(ConfigStore config, HookCoordinator hook)
    {
        _config = config;
        _hook = hook;

        InitializeComponent();
        Refresh();
    }

    /// <summary>Met a jour ce que la fenetre affiche a l'ouverture.</summary>
    internal void Refresh()
    {
        var advanced = _config.Current.Advanced;

        StatusLine.Text = _hook.IsInstalled
            ? string.Format(
                CultureInfo.CurrentCulture,
                "Hook clavier actif, {0} touche(s) surveillée(s).",
                _hook.WatchedKeyCount)
            : "Le hook clavier n'a pas pu être installé. Les raccourcis ne répondront pas.";

        AdvancedValues.Text = string.Format(
            CultureInfo.CurrentCulture,
            "Seuil de maintien {0} ms · opacité du voile {1:P0} · baisse du son {2} %",
            advanced.HoldThresholdMs,
            advanced.VeilOpacity,
            advanced.AudioDuckPercent);

        ConfigPathLabel.Text = string.Format(
            CultureInfo.CurrentCulture,
            "Ces valeurs et les raccourcis s'écrivent à la main dans {0} jusqu'au jalon M2.",
            ConfigStore.DefaultPath);
    }

    private void OnAdvancedToggled(object sender, RoutedEventArgs e) =>
        AdvancedPanel.Visibility = AdvancedToggle.IsChecked == true
            ? Visibility.Visible
            : Visibility.Collapsed;
}
