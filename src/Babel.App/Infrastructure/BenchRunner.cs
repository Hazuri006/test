using System;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;
using Babel.Core.Diagnostics;

namespace Babel.App.Infrastructure;

/// <summary>
/// Mode mesure : « Babel.exe --bench 60 ».
///
/// Fait tourner la chaine pendant la duree demandee, puis ecrit une entree datee
/// dans PERF.md et quitte. Une seule commande a lancer pour produire les chiffres
/// exiges par la section 3, sans avoir a relever le HUD a la main.
/// </summary>
internal sealed class BenchRunner
{
    private readonly PipelineMetrics _metrics;
    private readonly TimeSpan _duration;
    private readonly DispatcherTimer _timer;

    private long _lastFrameTimestamp;
    private long _frameCount;
    private double _frameIntervalTotalMs;

    internal BenchRunner(PipelineMetrics metrics, TimeSpan duration)
    {
        _metrics = metrics;
        _duration = duration;
        _timer = new DispatcherTimer(DispatcherPriority.Background) { Interval = duration };
        _timer.Tick += OnFinished;
    }

    internal void Start()
    {
        // Un abonnement permanent fait battre l'evenement a chaque trame : on en
        // deduit la cadence reelle de composition, dont depend la lecture du
        // budget de 16 ms.
        CompositionTarget.Rendering += OnRendering;
        _timer.Start();
    }

    private void OnRendering(object? sender, EventArgs e)
    {
        var now = Stopwatch.GetTimestamp();

        if (_lastFrameTimestamp != 0)
        {
            _frameIntervalTotalMs += (now - _lastFrameTimestamp) * 1000.0 / Stopwatch.Frequency;
            _frameCount++;
        }

        _lastFrameTimestamp = now;
    }

    private void OnFinished(object? sender, EventArgs e)
    {
        _timer.Stop();
        CompositionTarget.Rendering -= OnRendering;

        var path = RepositoryPaths.PerfFile();

        PerfReportWriter.Append(
            path,
            $"Mesure automatique ({_duration.TotalSeconds:0} s), générateur de test",
            DescribeEnvironment(),
            _metrics.SnapshotAll());

        Application.Current.Shutdown();
    }

    private string DescribeEnvironment()
    {
        var interval = _frameCount > 0 ? _frameIntervalTotalMs / _frameCount : 0;
        var hertz = interval > 0 ? 1000.0 / interval : 0;

        return string.Format(
            CultureInfo.InvariantCulture,
            "{0}, {1} cœurs logiques, composition observée à {2:0.0} Hz ({3:0.00} ms par trame)",
            RuntimeInformation.OSDescription,
            Environment.ProcessorCount,
            hertz,
            interval);
    }
}
