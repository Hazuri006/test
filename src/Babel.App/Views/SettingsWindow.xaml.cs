using System.Windows;
using System.Windows.Controls;
using Babel.App.Interop;
using Babel.Core.Pipeline;
using Babel.Core.Settings;

namespace Babel.App.Views;

/// <summary>
/// La fenetre de reglages : un panneau vertical unique, rail a gauche, contenu
/// aligne a gauche. Quatre entrees, pas une de plus.
///
/// Fermer cette fenetre quitte Babel. Il n'y a pas encore d'icone de zone de
/// notification ; elle viendra avec la finition.
/// </summary>
internal sealed partial class SettingsWindow : Window
{
    private readonly SourceView _source = new();
    private readonly LanguagesView _languages = new();
    private readonly DisplayView _display = new();
    private readonly ProfilesView _profiles = new();

    internal SettingsWindow()
    {
        InitializeComponent();
        PageHost.Content = _source;
    }

    /// <summary>Leve quand un reglage d'affichage change, pour replacer l'overlay.</summary>
    internal event Action? DisplaySettingsChanged;

    internal void Bind(SettingsStore store, GlobalHotkeyService hotkeys)
    {
        _languages.Bind(store);
        _display.Bind(store, store.Current.Hotkeys);
        _display.Changed += () => DisplaySettingsChanged?.Invoke();

        ShowHotkeyFailures(hotkeys);
    }

    internal void SetPipelineState(PipelineState state)
    {
        Lamp.State = state;

        StateLabel.Text = state switch
        {
            PipelineState.Running => "Chaîne en marche",
            PipelineState.Paused => "Chaîne en pause",
            _ => "Chaîne arrêtée",
        };
    }

    internal void SetAudioLevel(double level) => _source.SetLevel(level);

    private void ShowHotkeyFailures(GlobalHotkeyService hotkeys)
    {
        if (hotkeys.Failures.Count == 0)
        {
            return;
        }

        var gestures = string.Join(", ", hotkeys.Failures.Select(failure => failure.Gesture));

        // Message qui explique ce qui s'est passe et quoi faire, sans s'excuser
        // et sans vocabulaire technique.
        HotkeyWarning.Text = hotkeys.Failures.Count == 1
            ? $"Le raccourci {gestures} est déjà utilisé par une autre application. Ferme-la, ou modifie le raccourci dans le fichier de réglages."
            : $"Ces raccourcis sont déjà utilisés par d'autres applications : {gestures}. Ferme-les, ou modifie les raccourcis dans le fichier de réglages.";

        HotkeyWarning.Visibility = Visibility.Visible;
    }

    private void OnNavChecked(object sender, RoutedEventArgs e)
    {
        if (PageHost is null)
        {
            return;
        }

        UserControl page = _source;

        if (ReferenceEquals(sender, NavLanguages))
        {
            page = _languages;
        }
        else if (ReferenceEquals(sender, NavDisplay))
        {
            page = _display;
        }
        else if (ReferenceEquals(sender, NavProfiles))
        {
            page = _profiles;
        }

        PageHost.Content = page;
    }
}
