using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using Babel.Core.Audio;
using Babel.Core.Settings;

namespace Babel.App.Views;

internal sealed partial class SourceView : UserControl
{
    private readonly List<AudioDevice> _devices = new();

    private SettingsStore? _store;
    private bool _loading;

    internal SourceView() => InitializeComponent();

    /// <summary>Leve quand l'utilisateur choisit un autre peripherique.</summary>
    internal event Action<string>? DeviceChanged;

    internal void Bind(SettingsStore store, IReadOnlyList<AudioDevice> devices)
    {
        _store = store;
        _loading = true;

        _devices.Clear();
        DeviceSelector.Items.Clear();

        foreach (var device in devices)
        {
            _devices.Add(device);
            DeviceSelector.Items.Add(device.IsDefault ? $"{device.Name} (par défaut)" : device.Name);
        }

        var selected = _devices.FindIndex(d => d.Id == store.Current.AudioDeviceId);

        if (selected < 0)
        {
            selected = _devices.FindIndex(d => d.IsDefault);
        }

        DeviceSelector.SelectedIndex = _devices.Count == 0 ? -1 : Math.Max(0, selected);
        DeviceSelector.IsEnabled = _devices.Count > 0;

        if (_devices.Count == 0)
        {
            ShowProblem("Aucun périphérique de sortie actif. Vérifie que le son fonctionne dans Windows, puis relance Babel.");
        }

        _loading = false;
    }

    /// <summary>Alimente le vumetre depuis le niveau reellement capte.</summary>
    internal void SetLevel(double level) => Meter.Level = level;

    internal void SetEngineStatus(string text) => EngineStatus.Text = text;

    internal void ShowProblem(string? message)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            Problem.Visibility = Visibility.Collapsed;
            return;
        }

        Problem.Text = message;
        Problem.Visibility = Visibility.Visible;
    }

    private void OnDeviceChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_loading || _store is null || DeviceSelector.SelectedIndex < 0)
        {
            return;
        }

        var device = _devices[DeviceSelector.SelectedIndex];

        _store.Current.AudioDeviceId = device.Id;
        _store.RequestSave();

        DeviceChanged?.Invoke(device.Id);
    }
}
