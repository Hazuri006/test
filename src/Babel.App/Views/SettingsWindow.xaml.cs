using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using Babel.App.Interop;
using Babel.Core.Audio;
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

    /// <summary>Leve quand l'utilisateur demande la marche ou la pause.</summary>
    internal event Action? PauseToggleRequested;

    /// <summary>Leve quand l'utilisateur choisit un autre peripherique de sortie.</summary>
    internal event Action<string>? AudioDeviceChanged;

    internal void Bind(
        SettingsStore store,
        GlobalHotkeyService hotkeys,
        IReadOnlyList<AudioDevice> devices)
    {
        _source.Bind(store, devices);
        _source.DeviceChanged += id => AudioDeviceChanged?.Invoke(id);
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

        PauseButton.Content = state == PipelineState.Running ? "Mettre en pause" : "Reprendre";
    }

    private void OnPauseClicked(object sender, RoutedEventArgs e) => PauseToggleRequested?.Invoke();

    internal void SetAudioLevel(double level) => _source.SetLevel(level);

    internal void SetEngineStatus(string text) => _source.SetEngineStatus(text);

    internal void ShowSourceProblem(string? message) => _source.ShowProblem(message);

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
