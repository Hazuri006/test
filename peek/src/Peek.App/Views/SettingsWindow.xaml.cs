using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using Peek.App.Infrastructure;
using Peek.App.Interop;
using Peek.App.Windows;
using Peek.Core.Configuration;
using Peek.Core.Input;
using Peek.Core.Windows;

namespace Peek.App.Views;

/// <summary>
/// L'unique ecran de Peek : une liste de raccourcis, un bouton pour en ajouter.
///
/// L'ajout se fait en deux gestes, comme le demande la section 6 : on appuie
/// sur la touche voulue, on choisit la fenetre. Pas de champ de saisie, pas de
/// liste deroulante de touches.
/// </summary>
internal sealed partial class SettingsWindow : Window
{
    private readonly ConfigStore _config;
    private readonly HookCoordinator _hook;
    private readonly Action _configurationChanged;

    private readonly ObservableCollection<ShortcutRow> _rows = [];
    private readonly ObservableCollection<WindowChoice> _choices = [];

    private KeyBinding? _pendingKey;

    internal SettingsWindow(ConfigStore config, HookCoordinator hook, Action configurationChanged)
    {
        _config = config;
        _hook = hook;
        _configurationChanged = configurationChanged;

        InitializeComponent();

        ShortcutList.ItemsSource = _rows;
        WindowList.ItemsSource = _choices;

        _hook.KeyCaptured += OnKeyCapturedOffThread;

        Refresh();
    }

    /// <summary>Reconstruit ce que la fenetre affiche.</summary>
    internal void Refresh()
    {
        var config = _config.Current;
        var conflicts = ShortcutConflicts.Find(config.Shortcuts);

        _rows.Clear();

        foreach (var shortcut in config.Shortcuts)
        {
            var row = new ShortcutRow
            {
                Id = shortcut.Id,
                KeyLabel = Describe(shortcut.Key),
                TargetLabel = Describe(shortcut.Target),
                ModeLabel = shortcut.Mode == PeekMode.Use ? "Utilisation" : "Coup d'œil",
            };

            var conflict = conflicts.FirstOrDefault(c => c.ShortcutId == shortcut.Id);

            if (conflict is not null)
            {
                row.Conflict = conflict.Message;
            }

            _rows.Add(row);
        }

        var hasShortcuts = _rows.Count > 0;

        EmptyState.Visibility = hasShortcuts ? Visibility.Collapsed : Visibility.Visible;
        ListState.Visibility = hasShortcuts ? Visibility.Visible : Visibility.Collapsed;
        AddState.Visibility = Visibility.Collapsed;

        RefreshAdvanced(config);
    }

    protected override void OnClosed(EventArgs e)
    {
        _hook.KeyCaptured -= OnKeyCapturedOffThread;
        _hook.CancelKeyCapture();

        base.OnClosed(e);
    }

    private void RefreshAdvanced(PeekConfig config)
    {
        var advanced = config.Advanced;

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
            "Ces valeurs se modifient dans {0}. Elles deviendront réglables ici au jalon M4.",
            ConfigStore.DefaultPath);
    }

    private void OnAdvancedToggled(object sender, RoutedEventArgs e) =>
        AdvancedPanel.Visibility = AdvancedToggle.IsChecked == true
            ? Visibility.Visible
            : Visibility.Collapsed;

    private void OnAddClicked(object sender, RoutedEventArgs e) => AskForKey(string.Empty);

    /// <summary>Premier geste : la touche.</summary>
    private void AskForKey(string problem)
    {
        _pendingKey = null;

        EmptyState.Visibility = Visibility.Collapsed;
        ListState.Visibility = Visibility.Collapsed;
        AddState.Visibility = Visibility.Visible;
        WindowChoiceScroller.Visibility = Visibility.Collapsed;

        AddPrompt.Text = string.IsNullOrEmpty(problem)
            ? "Appuie sur la touche que tu veux utiliser."
            : problem;

        AddHint.Text = "Échap pour annuler.";

        _hook.ArmKeyCapture();
    }

    /// <summary>La touche saisie arrive du fil de travail du hook.</summary>
    private void OnKeyCapturedOffThread(KeyEvent captured) =>
        Dispatcher.BeginInvoke(() => OnKeyCaptured(captured));

    private void OnKeyCaptured(KeyEvent captured)
    {
        if (AddState.Visibility != Visibility.Visible)
        {
            return;
        }

        if (captured.VirtualKey == VirtualKeys.Escape)
        {
            Refresh();
            return;
        }

        var conflict = ShortcutConflicts.Check(_config.Current.Shortcuts, captured.VirtualKey);

        if (conflict is not null)
        {
            // Le message dit ce qui s'est passe et quoi faire, et on reste en
            // attente : l'utilisateur n'a pas a recommencer depuis le debut.
            AskForKey(conflict.Message);
            return;
        }

        _pendingKey = new KeyBinding
        {
            VirtualKey = captured.VirtualKey,
            ScanCode = captured.ScanCode,
            Label = KeyNames.Describe(captured.VirtualKey, captured.ScanCode),
        };

        AskForWindow();
    }

    /// <summary>Second geste : la fenetre.</summary>
    private void AskForWindow()
    {
        _choices.Clear();

        var own = Process.GetCurrentProcess().ProcessName;

        foreach (var window in WindowFinder.TopLevelWindows())
        {
            // Se viser soi-meme n'aurait aucun sens.
            if (string.Equals(window.ProcessName, own, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            _choices.Add(new WindowChoice
            {
                Handle = window.Handle,
                ProcessName = window.ProcessName,
                Title = window.Title,
            });
        }

        AddPrompt.Text = string.Format(
            CultureInfo.CurrentCulture,
            "Choisis la fenêtre que {0} doit afficher.",
            _pendingKey!.Label);

        AddHint.Text = _choices.Count > 0
            ? "Cette touche ne fonctionnera plus dans le jeu."
            : "Aucune fenêtre ouverte. Ouvre celle que tu veux viser, puis recommence.";

        WindowChoiceScroller.Visibility = Visibility.Visible;
    }

    private void OnWindowChosen(object sender, RoutedEventArgs e)
    {
        if (_pendingKey is null || ((FrameworkElement)sender).DataContext is not WindowChoice choice)
        {
            return;
        }

        _config.Current.Shortcuts.Add(new Shortcut
        {
            Key = _pendingKey,
            Target = WindowTargetBuilder.For(Info(choice), [.. _choices.Select(Info)]),
            Mode = PeekMode.Glance,
        });

        _pendingKey = null;
        Commit();
    }

    private void OnModeClicked(object sender, RoutedEventArgs e)
    {
        var shortcut = ShortcutOf(sender);

        if (shortcut is null)
        {
            return;
        }

        shortcut.Mode = shortcut.Mode == PeekMode.Glance ? PeekMode.Use : PeekMode.Glance;
        Commit();
    }

    private void OnDeleteClicked(object sender, RoutedEventArgs e)
    {
        var shortcut = ShortcutOf(sender);

        if (shortcut is null)
        {
            return;
        }

        _config.Current.Shortcuts.Remove(shortcut);
        Commit();
    }

    /// <summary>
    /// Enregistre, applique, et reaffiche. Le hook et la machine a etats
    /// prennent la nouvelle liste sans qu'il faille relancer Peek.
    /// </summary>
    private void Commit()
    {
        _config.RequestSave();
        _configurationChanged();
        Refresh();
    }

    private Shortcut? ShortcutOf(object sender)
    {
        if (((FrameworkElement)sender).DataContext is not ShortcutRow row)
        {
            return null;
        }

        return _config.Current.Shortcuts.FirstOrDefault(s => s.Id == row.Id);
    }

    private static WindowInfo Info(WindowChoice choice) =>
        new(choice.Handle, choice.ProcessName, choice.Title);

    private static string Describe(KeyBinding key) =>
        string.IsNullOrWhiteSpace(key.Label)
            ? string.Format(CultureInfo.CurrentCulture, "Touche {0}", key.VirtualKey)
            : key.Label;

    private static string Describe(WindowTarget target) =>
        string.IsNullOrWhiteSpace(target.TitlePattern)
            ? target.ProcessName
            : $"{target.ProcessName} — {target.TitlePattern}";
}
