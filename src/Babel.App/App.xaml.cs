using System;
using System.Buffers;
using System.Globalization;
using System.IO;
using System.Threading;
using System.Windows;
using System.Windows.Threading;
using Babel.App.Audio;
using Babel.App.Hud;
using Babel.App.Infrastructure;
using Babel.App.Interop;
using Babel.App.Overlay;
using Babel.App.Views;
using Babel.Core.Audio;
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

    private WasapiAudioCapture? _capture;
    private SileroSpeechDetector? _detector;
    private WhisperAsrEngine? _asr;
    private StageLink<AudioFrame>? _audioLink;
    private DispatcherTimer? _levelTimer;

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

        var benchSeconds = ParseBenchDuration(e.Args);

        _services = BuildServices();

        _settings = _services.GetRequiredService<SettingsStore>();
        _settings.Load();

        var metrics = _services.GetRequiredService<PipelineMetrics>();
        _pipeline = _services.GetRequiredService<PipelineHost>();

        _overlay = new OverlayWindow(metrics, _settings);
        _hud = new HudWindow(metrics);
        _settingsWindow = new SettingsWindow();

        if (benchSeconds is null)
        {
            BuildAudioPipeline(metrics);
        }
        else
        {
            BuildBenchPipeline(metrics);
        }

        SetUpHotkeys();

        _settingsWindow.Bind(_settings, _hotkeys!, _capture?.ListDevices() ?? []);
        _settingsWindow.DisplaySettingsChanged += () => _overlay.ApplySettings();
        _settingsWindow.PauseToggleRequested += () => _pipeline.TogglePause();
        _settingsWindow.AudioDeviceChanged += StartCapture;
        _settingsWindow.Closed += (_, _) => Shutdown();

        _pipeline.StateChanged += state => Dispatcher.Invoke(() => OnPipelineStateChanged(state));

        _overlay.Show();

        if (_settings.Current.HudVisible)
        {
            _hud.Show();
        }

        MainWindow = _settingsWindow;
        _settingsWindow.Show();

        _pipeline.Start();
        _settingsWindow.SetPipelineState(_pipeline.State);

        ReportEngineStatus();

        if (benchSeconds is { } seconds)
        {
            new BenchRunner(metrics, TimeSpan.FromSeconds(seconds)).Start();
            return;
        }

        StartCapture(_settings.Current.AudioDeviceId);
        StartLevelMeter();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _levelTimer?.Stop();
        _hotkeys?.Dispose();
        _capture?.Dispose();

        if (_pipeline is not null)
        {
            _pipeline.StopAsync().GetAwaiter().GetResult();
        }

        _detector?.Dispose();
        _asr?.Dispose();
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
    /// La chaine reelle : capture, decoupage, transcription, affichage.
    ///
    /// Les capacites des liens ne sont pas uniformes, et c'est deliberé. Jeter un
    /// sous-titre ne coute qu'un affichage manque ; jeter une trame audio troue une
    /// phrase et corrompt sa transcription. Le lien audio a donc de la marge — huit
    /// trames, soit 256 ms — pour absorber une pause du ramasse-miettes sans rien
    /// perdre, tout en restant borne comme l'exige la contrainte 5.
    /// </summary>
    private void BuildAudioPipeline(PipelineMetrics metrics)
    {
        var logger = _services!.GetRequiredService<ILoggerFactory>();

        _capture = new WasapiAudioCapture(logger.CreateLogger<WasapiAudioCapture>());
        _detector = new SileroSpeechDetector(logger.CreateLogger<SileroSpeechDetector>());
        _asr = new WhisperAsrEngine(logger.CreateLogger<WhisperAsrEngine>());

        var audioLink = new StageLink<AudioFrame>(
            "audio",
            capacity: 8,
            recycle: frame => ArrayPool<float>.Shared.Return(frame.Buffer));

        var utteranceLink = new StageLink<Utterance>(
            "phrases",
            capacity: 4,
            recycle: utterance => ArrayPool<float>.Shared.Return(utterance.Buffer));

        var subtitleLink = new StageLink<SubtitleMessage>("sous-titres", capacity: 1);

        _audioLink = audioLink;

        _capture.FrameReady += frame =>
        {
            // En pause, on rend la trame au pool sans la publier : la capture
            // continue pour que le vumetre reste un outil de diagnostic.
            if (_pipeline!.IsFlowing)
            {
                audioLink.Publish(frame);
            }
            else
            {
                ArrayPool<float>.Shared.Return(frame.Buffer);
            }
        };

        _capture.Failed += message => Dispatcher.Invoke(() => _settingsWindow?.ShowSourceProblem(message));

        _pipeline!.Add(new VadStage(
            audioLink,
            utteranceLink,
            _detector,
            metrics,
            frame => ArrayPool<float>.Shared.Return(frame.Buffer)));

        _pipeline.Add(new AsrStage(
            utteranceLink,
            subtitleLink,
            _asr,
            metrics,
            () => _settings!.Current.SourceLanguage,
            logger.CreateLogger<AsrStage>()));

        _pipeline.Add(new SubtitleRenderStage(subtitleLink, _overlay!, metrics));
    }

    /// <summary>
    /// Chaine de mesure : un generateur synthetique remplace la capture, pour
    /// eprouver le chemin d'affichage sans dependre d'un son qui joue.
    /// </summary>
    private void BuildBenchPipeline(PipelineMetrics metrics)
    {
        var link = new StageLink<SubtitleMessage>("sous-titres", capacity: 1);

        _pipeline!.Add(new SyntheticSubtitleStage(link, _pipeline));
        _pipeline.Add(new SubtitleRenderStage(link, _overlay!, metrics));
    }

    private void StartCapture(string deviceId)
    {
        if (_capture is null)
        {
            return;
        }

        _settingsWindow?.ShowSourceProblem(null);
        _capture.Start(deviceId);
    }

    /// <summary>
    /// Le vumetre est rafraichi a 30 Hz depuis l'interface, jamais depuis le thread
    /// de capture : c'est un indicateur, il n'a rien a faire sur le chemin chaud.
    /// </summary>
    private void StartLevelMeter()
    {
        _levelTimer = new DispatcherTimer(DispatcherPriority.Background)
        {
            Interval = TimeSpan.FromMilliseconds(33),
        };

        _levelTimer.Tick += (_, _) =>
        {
            if (_capture is not null && _settingsWindow is { IsVisible: true })
            {
                _settingsWindow.SetAudioLevel(_capture.Level);
            }
        };

        _levelTimer.Start();
    }

    private void ReportEngineStatus()
    {
        if (_settingsWindow is null)
        {
            return;
        }

        if (_asr is null || _detector is null)
        {
            _settingsWindow.SetEngineStatus("Mode mesure : la transcription est désactivée.");
            return;
        }

        _settingsWindow.SetEngineStatus(
            _asr.IsReady
                ? $"whisper.cpp, exécution sur {_asr.Backend}."
                : "En attente du modèle de transcription.");

        var problem = _detector.UnavailableReason ?? _asr.UnavailableReason;

        if (problem is not null)
        {
            _settingsWindow.ShowSourceProblem(problem);
        }
    }

    private void SetUpHotkeys()
    {
        _hotkeys = new GlobalHotkeyService(
            _services!.GetRequiredService<ILogger<GlobalHotkeyService>>());

        _hotkeys.Pressed += OnHotkey;
        _hotkeys.RegisterAll(_settings!.Current.Hotkeys);
    }

    /// <summary>
    /// La pause efface l'affichage. Laisser le dernier sous-titre a l'ecran
    /// donnerait a croire que la chaine tourne encore.
    /// </summary>
    private void OnPipelineStateChanged(PipelineState state)
    {
        _settingsWindow?.SetPipelineState(state);

        if (state != PipelineState.Running)
        {
            _overlay?.Clear();
        }
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
                "{0}, {1} cœurs logiques, transcription sur {2}",
                Environment.OSVersion.VersionString,
                Environment.ProcessorCount,
                _asr?.Backend ?? "aucun"),
            metrics.SnapshotAll());

        _services.GetRequiredService<ILogger<App>>()
                 .LogInformation("Relevé de latence écrit dans {Path}.", path);
    }

    private static double? ParseBenchDuration(string[] args)
    {
        for (var i = 0; i < args.Length; i++)
        {
            if (!string.Equals(args[i], "--bench", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (i + 1 < args.Length
                && double.TryParse(args[i + 1], NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed)
                && parsed > 0)
            {
                return parsed;
            }

            return 60;
        }

        return null;
    }
}
