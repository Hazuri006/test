using System.Globalization;
using System.Windows;
using Babel.App.Hud;
using Babel.App.Infrastructure;
using Babel.App.Interop;
using Babel.App.Overlay;
using Babel.App.Views;
using Babel.Core.Diagnostics;
using Babel.Core.Pipeline;
using Babel.Core.Settings;
using Babel.Core.Subtitles;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Babel.App;

/// <summary>
/// Point d'entree et racine de composition.
///
/// Pas d'hote generique : on veut garder la main sur le demarrage et l'arret des
/// etages, et un ServiceCollection suffit pour un graphe de cette taille.
/// </summary>
public partial class App : Application
{
    private const string InstanceMutexName = "Babel.SingleInstance.9f2c";

    private ServiceProvider? _services;
    private Mutex? _instanceMutex;
    private GlobalHotkeyService? _hotkeys;
    private PipelineHost? _pipeline;
    private SettingsStore? _settings;
    private OverlayWindow? _overlay;
    private HudWindow? _hud;
    private SettingsWindow? _settingsWindow;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        _instanceMutex = new Mutex(initiallyOwned: true, InstanceMutexName, out var isFirstInstance);

        if (!isFirstInstance)
        {
            // Deux overlays superposes seraient illisibles et impossibles a diagnostiquer.
            MessageBox.Show(
                "Babel est déjà lancé.",
                "Babel",
                MessageBoxButton.OK,
                MessageBoxImage.Information);

            Shutdown();
            return;
        }

        _services = BuildServices();

        _settings = _services.GetRequiredService<SettingsStore>();
        _settings.Load();

        var metrics = _services.GetRequiredService<PipelineMetrics>();
        _pipeline = _services.GetRequiredService<PipelineHost>();

        _overlay = new OverlayWindow(metrics, _settings);
        _hud = new HudWindow(metrics);
        _settingsWindow = new SettingsWindow();

        BuildPipeline(metrics);
        SetUpHotkeys();

        _settingsWindow.Bind(_settings, _hotkeys!);
        _settingsWindow.DisplaySettingsChanged += () => _overlay.ApplySettings();
        _settingsWindow.Closed += (_, _) => Shutdown();

        _pipeline.StateChanged += state => Dispatcher.Invoke(() => _settingsWindow.SetPipelineState(state));

        _overlay.Show();

        if (_settings.Current.HudVisible)
        {
            _hud.Show();
        }

        MainWindow = _settingsWindow;
        _settingsWindow.Show();

        _pipeline.Start();
        _settingsWindow.SetPipelineState(_pipeline.State);

        StartBenchIfRequested(e.Args, metrics);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _hotkeys?.Dispose();

        if (_pipeline is not null)
        {
            _pipeline.StopAsync().GetAwaiter().GetResult();
        }

        _settings?.Dispose();
        _services?.Dispose();

        _instanceMutex?.Dispose();

        base.OnExit(e);
    }

    private static ServiceProvider BuildServices()
    {
        var services = new ServiceCollection();

        services.AddLogging(builder =>
        {
            // Journal local uniquement : aucune remontee, aucune telemetrie.
            builder.AddProvider(new FileLoggerProvider(Path.Combine(RepositoryPaths.LocalDirectory(), "logs")));
            builder.SetMinimumLevel(LogLevel.Information);
        });

        services.AddSingleton(provider => new SettingsStore(
            SettingsStore.DefaultPath,
            provider.GetRequiredService<ILogger<SettingsStore>>()));

        services.AddSingleton<PipelineMetrics>();
        services.AddSingleton<PipelineHost>();

        return services.BuildServiceProvider();
    }

    /// <summary>
    /// M0 ne comporte qu'une source synthetique et l'etage de rendu. Les liens et
    /// la politique de rejet sont deja ceux de la version finale : c'est ce qui
    /// rend le budget mesurable des maintenant.
    /// </summary>
    private void BuildPipeline(PipelineMetrics metrics)
    {
        var link = new StageLink<SubtitleMessage>("sous-titres", capacity: 1);

        _pipeline!.Add(new SyntheticSubtitleStage(link, _pipeline));
        _pipeline.Add(new SubtitleRenderStage(link, _overlay!, metrics));
    }

    private void SetUpHotkeys()
    {
        _hotkeys = new GlobalHotkeyService(
            _services!.GetRequiredService<ILogger<GlobalHotkeyService>>());

        _hotkeys.Pressed += OnHotkey;
        _hotkeys.RegisterAll(_settings!.Current.Hotkeys);
    }

    private void OnHotkey(HotkeyAction action)
    {
        switch (action)
        {
            case HotkeyAction.TogglePause:
                _pipeline?.TogglePause();
                break;

            case HotkeyAction.ToggleOverlay:
                _overlay?.ToggleVisibility();
                break;

            case HotkeyAction.ToggleHud:
                _hud?.Toggle();

                if (_settings is not null && _hud is not null)
                {
                    _settings.Current.HudVisible = _hud.IsVisible;
                    _settings.RequestSave();
                }

                break;

            case HotkeyAction.ToggleRepositionMode:
                _overlay?.ToggleRepositioning();
                break;

            case HotkeyAction.WritePerfReport:
                WritePerfReport();
                break;

            default:
                break;
        }
    }

    private void WritePerfReport()
    {
        if (_services is null)
        {
            return;
        }

        var metrics = _services.GetRequiredService<PipelineMetrics>();

        var path = PerfReportWriter.Append(
            RepositoryPaths.PerfFile(),
            "Relevé manuel",
            string.Format(
                CultureInfo.InvariantCulture,
                "{0}, {1} cœurs logiques",
                Environment.OSVersion.VersionString,
                Environment.ProcessorCount),
            metrics.SnapshotAll());

        _services.GetRequiredService<ILogger<App>>()
                 .LogInformation("Relevé de latence écrit dans {Path}.", path);
    }

    private void StartBenchIfRequested(string[] args, PipelineMetrics metrics)
    {
        for (var i = 0; i < args.Length; i++)
        {
            if (!string.Equals(args[i], "--bench", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var seconds = 60.0;

            if (i + 1 < args.Length
                && double.TryParse(args[i + 1], NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed)
                && parsed > 0)
            {
                seconds = parsed;
            }

            new BenchRunner(metrics, TimeSpan.FromSeconds(seconds)).Start();
            return;
        }
    }
}
