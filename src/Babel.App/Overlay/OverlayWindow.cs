using System.Diagnostics;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using Babel.App.Interop;
using Babel.Core.Diagnostics;
using Babel.Core.Pipeline;
using Babel.Core.Settings;
using Babel.Core.Subtitles;

namespace Babel.App.Overlay;

/// <summary>
/// L'overlay : une fenetre externe, independante, posee par-dessus le jeu.
///
/// Contrainte 1 : aucune injection, aucun hook graphique, aucune lecture memoire.
/// Limite assumee qui en decoule : cette fenetre ne peut pas s'afficher au-dessus
/// d'un jeu en plein ecran exclusif. Le mode fenetre sans bordure est exige, et
/// c'est ecrit dans les reglages.
/// </summary>
internal sealed class OverlayWindow : Window, ISubtitleSink
{
    private static readonly TimeSpan TopmostInterval = TimeSpan.FromSeconds(1);

    private readonly PipelineMetrics _metrics;
    private readonly SettingsStore _settings;
    private readonly SubtitleVisual _visual;
    private readonly DispatcherTimer _topmostTimer;

    private readonly SubtitleComposer _composer;

    // Chaine de repli : l'application reste correcte avant que les fichiers de
    // police soient deposes. Voir assets/fonts/README.md.
    private readonly FontFamily _fontFamily = new(
        "Noto Sans, Noto Sans JP, Noto Sans KR, Noto Sans SC, Yu Gothic UI, Malgun Gothic, Microsoft YaHei, Segoe UI");

    private double _pixelsPerDip = 1.0;
    private bool _repositioning;
    private Point _dragOrigin;
    private bool _dragging;
    private long _pendingOrigin;
    private long _pendingSubmit;
    private bool _renderHooked;

    internal OverlayWindow(PipelineMetrics metrics, SettingsStore settings)
    {
        _metrics = metrics;
        _settings = settings;

        WindowStyle = WindowStyle.None;
        AllowsTransparency = true;
        Background = Brushes.Transparent;
        Topmost = true;
        ShowInTaskbar = false;
        ResizeMode = ResizeMode.NoResize;
        WindowStartupLocation = WindowStartupLocation.Manual;
        Focusable = false;
        ShowActivated = false;
        Title = "Babel — sous-titres";

        var style = BuildStyle();
        _composer = new SubtitleComposer(style);
        _visual = new SubtitleVisual(style);
        Content = _visual;

        _topmostTimer = new DispatcherTimer(DispatcherPriority.Background)
        {
            Interval = TopmostInterval,
        };

        _topmostTimer.Tick += (_, _) => ClickThroughWindow.ReassertTopmost(this);
    }

    /// <summary>Vrai quand l'overlay est saisissable a la souris pour etre deplace.</summary>
    internal bool IsRepositioning => _repositioning;

    protected override void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);

        _pixelsPerDip = VisualTreeHelper.GetDpi(this).PixelsPerDip;

        ClickThroughWindow.Apply(this, clickThrough: !_repositioning);
        ApplySettings();

        _topmostTimer.Start();
    }

    protected override void OnDpiChanged(DpiScale oldDpi, DpiScale newDpi)
    {
        base.OnDpiChanged(oldDpi, newDpi);

        _pixelsPerDip = newDpi.PixelsPerDip;
        ApplySettings();
    }

    /// <summary>
    /// Recalcule style et position depuis les reglages. Appele au demarrage, a
    /// chaque modification dans l'ecran Affichage et a chaque changement de DPI.
    /// </summary>
    internal void ApplySettings()
    {
        var overlay = _settings.Current.Overlay;
        var area = new WorkArea(
            SystemParameters.WorkArea.X,
            SystemParameters.WorkArea.Y,
            SystemParameters.WorkArea.Width,
            SystemParameters.WorkArea.Height);

        var style = BuildStyle();
        var height = _composer.ReservedHeight(style);
        var rect = OverlayPlacement.Resolve(area, overlay, height);

        Left = rect.X;
        Top = rect.Y;
        Width = rect.Width;
        Height = rect.Height;

        _composer.UpdateStyle(style);
        _visual.SetStyle(style);

        Visibility = overlay.Visible ? Visibility.Visible : Visibility.Hidden;
    }

    internal void ToggleVisibility()
    {
        var overlay = _settings.Current.Overlay;
        overlay.Visible = !overlay.Visible;
        _settings.RequestSave();

        Visibility = overlay.Visible ? Visibility.Visible : Visibility.Hidden;
    }

    /// <summary>
    /// Bascule le mode deplacement : le click-through est leve le temps que
    /// l'utilisateur pose le bandeau ou il veut.
    /// </summary>
    internal void ToggleRepositioning()
    {
        _repositioning = !_repositioning;

        ClickThroughWindow.Apply(this, clickThrough: !_repositioning);
        _visual.SetRepositioning(_repositioning);

        if (!_repositioning)
        {
            _dragging = false;
            SaveCurrentPosition();
        }
    }

    // Deplacement a la main plutot que DragMove : la fenetre porte WS_EX_NOACTIVATE
    // et ne peut pas etre activee, ce sur quoi DragMove s'appuie.
    protected override void OnMouseLeftButtonDown(MouseButtonEventArgs e)
    {
        base.OnMouseLeftButtonDown(e);

        if (!_repositioning)
        {
            return;
        }

        _dragOrigin = e.GetPosition(this);
        _dragging = CaptureMouse();
        e.Handled = true;
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);

        if (!_dragging)
        {
            return;
        }

        var position = e.GetPosition(this);

        Left += position.X - _dragOrigin.X;
        Top += position.Y - _dragOrigin.Y;
    }

    protected override void OnMouseLeftButtonUp(MouseButtonEventArgs e)
    {
        base.OnMouseLeftButtonUp(e);

        if (!_dragging)
        {
            return;
        }

        _dragging = false;
        ReleaseMouseCapture();
        SaveCurrentPosition();
    }

    public void Publish(SubtitleMessage message)
    {
        // Appele depuis un etage du pipeline. La mise en forme et la construction
        // du contour ont lieu ici, hors du thread d'interface ; ce dernier ne
        // recevra qu'une geometrie deja gelee.
        var submit = Stopwatch.GetTimestamp();
        var frame = _composer.Compose(message, submit);

        _ = Dispatcher.InvokeAsync(() => Apply(frame), DispatcherPriority.Render);
    }

    public void Clear()
    {
        _composer.Reset();
        _ = Dispatcher.InvokeAsync(() => _visual.SetFrame(null), DispatcherPriority.Render);
    }

    private void Apply(SubtitleFrame frame)
    {
        _visual.SetFrame(frame);

        _pendingOrigin = frame.OriginTimestamp;
        _pendingSubmit = frame.SubmitTimestamp;

        if (!_renderHooked)
        {
            CompositionTarget.Rendering += OnRendering;
            _renderHooked = true;
        }
    }

    /// <summary>
    /// Mesure au plus pres de la trame : l'evenement est leve juste avant la
    /// composition. La presentation effective suit d'un balayage vertical, ce que
    /// PERF.md precise pour que le chiffre ne soit pas lu comme une latence totale.
    /// </summary>
    private void OnRendering(object? sender, EventArgs e)
    {
        if (_pendingSubmit != 0)
        {
            _metrics[PipelineStage.Render].RecordSince(_pendingSubmit);
            _metrics.EndToEnd.RecordSince(_pendingOrigin);

            _pendingSubmit = 0;
            _pendingOrigin = 0;
        }

        CompositionTarget.Rendering -= OnRendering;
        _renderHooked = false;
    }

    private void SaveCurrentPosition()
    {
        var area = new WorkArea(
            SystemParameters.WorkArea.X,
            SystemParameters.WorkArea.Y,
            SystemParameters.WorkArea.Width,
            SystemParameters.WorkArea.Height);

        var (anchorX, anchorY) = OverlayPlacement.ToAnchors(
            area,
            new PlacementRect(Left, Top, Width, Height));

        var overlay = _settings.Current.Overlay;
        overlay.AnchorX = anchorX;
        overlay.AnchorY = anchorY;

        _settings.RequestSave();
    }

    private SubtitleStyle BuildStyle()
    {
        var overlay = _settings.Current.Overlay;
        var maxWidth = Math.Max(
            OverlayPlacement.MinimumWidth,
            SystemParameters.WorkArea.Width * Math.Clamp(overlay.WidthFraction, 0.1, 1.0));

        return SubtitleStyle.Create(_fontFamily, overlay, maxWidth, _pixelsPerDip);
    }
}
