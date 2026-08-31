using System;
using System.Collections.Generic;
using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using Babel.App.Interop;
using Babel.Core.Diagnostics;

namespace Babel.App.Hud;

/// <summary>
/// HUD de latence, active par F9.
///
/// Les chiffres sont en monospace parce que ce sont des releves d'instrument : ils
/// ne doivent pas gigoter d'un rafraichissement a l'autre. C'est le seul endroit de
/// l'application ou une monospace est justifiee.
///
/// Rafraichi a 4 Hz, jamais sur le chemin du sous-titre.
/// </summary>
internal sealed class HudWindow : Window
{
    private static readonly TimeSpan RefreshInterval = TimeSpan.FromMilliseconds(250);

    private static readonly Brush TextBrush = Frozen(Color.FromRgb(0xED, 0xE8, 0xDC));
    private static readonly Brush MutedBrush = Frozen(Color.FromRgb(0x3E, 0x48, 0x44));
    private static readonly Brush OverBudgetBrush = Frozen(Color.FromRgb(0xC4, 0x48, 0x3A));
    private static readonly Brush SignalBrush = Frozen(Color.FromRgb(0xE8, 0xA3, 0x3D));

    private readonly PipelineMetrics _metrics;
    private readonly DispatcherTimer _timer;
    private readonly StackPanel _rows;
    private readonly List<TextBlock> _rowBlocks = new();
    private readonly FontFamily _mono = new("JetBrains Mono, Cascadia Mono, Consolas");

    internal HudWindow(PipelineMetrics metrics)
    {
        _metrics = metrics;

        WindowStyle = WindowStyle.None;
        AllowsTransparency = true;
        Background = Brushes.Transparent;
        Topmost = true;
        ShowInTaskbar = false;
        ShowActivated = false;
        Focusable = false;
        ResizeMode = ResizeMode.NoResize;
        SizeToContent = SizeToContent.WidthAndHeight;
        WindowStartupLocation = WindowStartupLocation.Manual;
        Title = "Babel — latence";

        var panel = new SolidColorBrush(Color.FromRgb(0x1E, 0x24, 0x22)) { Opacity = 0.88 };
        panel.Freeze();

        _rows = new StackPanel();

        Content = new Border
        {
            Background = panel,
            BorderBrush = MutedBrush,
            BorderThickness = new Thickness(1),
            Padding = new Thickness(14, 10, 14, 10),
            Child = _rows,
        };

        _rows.Children.Add(CreateBlock("BABEL — LATENCE", SignalBrush));
        _rows.Children.Add(CreateBlock(Header(), MutedBrush));

        _timer = new DispatcherTimer(DispatcherPriority.Background) { Interval = RefreshInterval };
        _timer.Tick += (_, _) => Refresh();
    }

    protected override void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);

        ClickThroughWindow.Apply(this, clickThrough: true);

        Left = SystemParameters.WorkArea.X + 24;
        Top = SystemParameters.WorkArea.Y + 24;

        Refresh();
        _timer.Start();
    }

    protected override void OnClosed(EventArgs e)
    {
        _timer.Stop();
        base.OnClosed(e);
    }

    internal void Toggle()
    {
        if (IsVisible)
        {
            Hide();
            _timer.Stop();
        }
        else
        {
            Show();
            _timer.Start();
        }
    }

    private void Refresh()
    {
        var snapshots = _metrics.SnapshotAll();

        while (_rowBlocks.Count < snapshots.Length)
        {
            var block = CreateBlock(string.Empty, TextBrush);
            _rowBlocks.Add(block);
            _rows.Children.Add(block);
        }

        for (var i = 0; i < snapshots.Length; i++)
        {
            var snapshot = snapshots[i];

            _rowBlocks[i].Text = Row(snapshot);
            _rowBlocks[i].Foreground = snapshot.OverBudget ? OverBudgetBrush : TextBrush;
        }
    }

    private static string Header() =>
        "étage".PadRight(14)
        + "budget".PadLeft(9)
        + "dernier".PadLeft(10)
        + "p50".PadLeft(10)
        + "p95".PadLeft(10)
        + "jetés".PadLeft(8);

    private static string Row(LatencySnapshot snapshot) =>
        Truncate(snapshot.Name, 13).PadRight(14)
        + Value(snapshot.BudgetMs).PadLeft(9)
        + Measure(snapshot.LastMs, snapshot.SampleCount).PadLeft(10)
        + Measure(snapshot.P50Ms, snapshot.SampleCount).PadLeft(10)
        + Measure(snapshot.P95Ms, snapshot.SampleCount).PadLeft(10)
        + snapshot.Dropped.ToString(CultureInfo.InvariantCulture).PadLeft(8);

    private static string Value(double milliseconds) =>
        double.IsPositiveInfinity(milliseconds)
            ? "—"
            : milliseconds.ToString("0.0", CultureInfo.InvariantCulture);

    private static string Measure(double milliseconds, int sampleCount) =>
        sampleCount == 0 ? "—" : milliseconds.ToString("0.00", CultureInfo.InvariantCulture);

    private static string Truncate(string text, int length) =>
        text.Length <= length ? text : text[..length];

    private TextBlock CreateBlock(string text, Brush foreground) => new()
    {
        Text = text,
        FontFamily = _mono,
        FontSize = 13,
        Foreground = foreground,
        TextWrapping = TextWrapping.NoWrap,
        Margin = new Thickness(0, 0, 0, 2),
    };

    private static Brush Frozen(Color color)
    {
        var brush = new SolidColorBrush(color);
        brush.Freeze();
        return brush;
    }
}
