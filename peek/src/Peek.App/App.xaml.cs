using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Peek.App.Infrastructure;
using Peek.App.Interop;
using Peek.App.Views;
using Peek.Core.Configuration;

namespace Peek.App;

/// <summary>
/// Point d'entree et racine de composition.
///
/// Peek vit dans la zone de notification : la fenetre est une visite, pas le
/// programme. ShutdownMode vaut donc OnExplicitShutdown, et la refermer ne
/// quitte pas.
///
/// I6, zero consommation au repos : rien ici n'installe de minuteur ni de boucle
/// de scrutation. Le fil du hook dort dans GetMessage, le fil de travail dort
/// sur un evenement, le minuteur de sauvegarde ne s'arme qu'a la demande.
/// </summary>
public partial class App : Application
{
    private const string InstanceMutexName = "Peek.SingleInstance.4d81";

    private ServiceProvider? _services;
    private Mutex? _instanceMutex;
    private ConfigStore? _config;
    private RestoreStateStore? _restore;
    private PeekOrchestrator? _orchestrator;
    private HookCoordinator? _hook;
    private TrayIcon? _tray;
    private SettingsWindow? _window;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        _instanceMutex = new Mutex(initiallyOwned: true, InstanceMutexName, out var isFirstInstance);

        if (!isFirstInstance)
        {
            // Deux hooks concurrents avaleraient chaque touche deux fois, et le
            // second Peek ne saurait rien de ce que le premier affiche.
            MessageBox.Show(
                "Peek est déjà lancé. Son icône est dans la zone de notification.",
                "Peek",
                MessageBoxButton.OK,
                MessageBoxImage.Information);

            Shutdown();
            return;
        }

        _config = new ConfigStore(ConfigStore.DefaultPath, NullLoggerFirst());
        var loaded = _config.Load();

        _services = BuildServices(loaded.Advanced.DiagnosticLogging);
        _config.Dispose();

        _config = new ConfigStore(
            ConfigStore.DefaultPath,
            _services.GetRequiredService<ILogger<ConfigStore>>());

        _config.Load();

        // Jusqu'a M2 la configuration s'edite a la main : au premier lancement,
        // le fichier doit donc exister pour qu'il y ait quelque chose a editer.
        // La fermeture, elle, n'ecrit plus rien qu'on ne lui ait demande.
        if (!File.Exists(ConfigStore.DefaultPath))
        {
            _config.SaveNow();
        }

        var logger = _services.GetRequiredService<ILogger<App>>();

        logger.LogInformation("Peek {Version} demarre.", typeof(App).Assembly.GetName().Version);

        _restore = new RestoreStateStore(
            ConfigStore.RestoreStatePath,
            _services.GetRequiredService<ILogger<RestoreStateStore>>());

        _orchestrator = new PeekOrchestrator(
            _config,
            _restore,
            Dispatcher,
            _services.GetRequiredService<ILogger<PeekOrchestrator>>());

        // I4 : avant toute chose. Si la derniere execution a ete tuee en plein
        // coup d'oeil, les fenetres retrouvent leur place maintenant, avant que
        // l'utilisateur ne s'en apercoive.
        _orchestrator.RecoverFromPreviousRun();

        _hook = new HookCoordinator(
            _config,
            _services.GetRequiredService<ILogger<HookCoordinator>>(),
            _services.GetRequiredService<ILogger<KeyboardHookThread>>());

        _hook.IntentProduced += _orchestrator.Handle;
        _hook.Start();

        _orchestrator.Prepare();

        _tray = new TrayIcon(_services.GetRequiredService<ILogger<TrayIcon>>());
        _tray.OpenRequested += ShowWindow;
        _tray.SuspendToggled += ToggleSuspend;
        _tray.OpenLogsRequested += OpenLogFolder;
        _tray.QuitRequested += Shutdown;
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _tray?.Dispose();

        // Le hook d'abord : plus aucune intention n'arrive ensuite. Puis
        // l'orchestrateur, qui referme ce qui serait reste ouvert, pour qu'un
        // arret normal ne laisse jamais de travail a la reprise sur plantage.
        _hook?.Dispose();
        _orchestrator?.Dispose();
        _config?.Dispose();
        _services?.Dispose();
        _instanceMutex?.Dispose();

        base.OnExit(e);
    }

    /// <summary>
    /// Le premier ConfigStore sert a lire le niveau de journalisation avant que
    /// le journal existe. Il n'a donc pas de journal a qui se plaindre, et c'est
    /// le seul endroit du programme dans ce cas.
    /// </summary>
    private static ILogger<ConfigStore> NullLoggerFirst() =>
        Microsoft.Extensions.Logging.Abstractions.NullLogger<ConfigStore>.Instance;

    private static ServiceProvider BuildServices(bool diagnostics)
    {
        var services = new ServiceCollection();

        services.AddLogging(builder =>
        {
            var minimum = diagnostics ? LogLevel.Debug : LogLevel.Information;

            builder.AddProvider(new FileLoggerProvider(ConfigStore.LogDirectory, minimum));
            builder.SetMinimumLevel(minimum);
        });

        return services.BuildServiceProvider();
    }

    private void ShowWindow()
    {
        if (_config is null || _hook is null)
        {
            return;
        }

        if (_window is null)
        {
            // La fenetre n'est construite qu'a la premiere ouverture : au repos,
            // Peek n'a aucun arbre visuel a entretenir.
            _window = new SettingsWindow(_config, _hook);
            _window.Closed += (_, _) => _window = null;
            _window.Show();
            return;
        }

        _window.Refresh();

        if (_window.WindowState == WindowState.Minimized)
        {
            _window.WindowState = WindowState.Normal;
        }

        _window.Activate();
    }

    private void ToggleSuspend()
    {
        if (_hook is null || _tray is null)
        {
            return;
        }

        _hook.Suspended = !_hook.Suspended;
        _tray.Suspended = _hook.Suspended;
    }

    private void OpenLogFolder()
    {
        Directory.CreateDirectory(ConfigStore.LogDirectory);

        // Ouvre l'explorateur sur le dossier, sans rien y ecrire.
        using var process = Process.Start(new ProcessStartInfo(ConfigStore.LogDirectory)
        {
            UseShellExecute = true,
        });
    }
}
