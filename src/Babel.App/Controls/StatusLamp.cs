using System.Windows;
using System.Windows.Media;
using Babel.Core.Pipeline;

namespace Babel.App.Controls;

/// <summary>
/// Le voyant d'etat unique : ambre quand la chaine tourne, rouge quand elle est
/// en pause ou arretee. Dessine plutot que style, parce que c'est un temoin
/// d'instrument, pas un bouton.
/// </summary>
internal sealed class StatusLamp : FrameworkElement
{
    public static readonly DependencyProperty StateProperty = DependencyProperty.Register(
        nameof(State),
        typeof(PipelineState),
        typeof(StatusLamp),
        new FrameworkPropertyMetadata(PipelineState.Stopped, FrameworkPropertyMetadataOptions.AffectsRender));

    private static readonly Brush SignalBrush = Frozen(Color.FromRgb(0xE8, 0xA3, 0x3D));
    private static readonly Brush PausedBrush = Frozen(Color.FromRgb(0xC4, 0x48, 0x3A));
    private static readonly Pen RingPen = FrozenPen(Color.FromRgb(0x3E, 0x48, 0x44));

    internal StatusLamp()
    {
        Width = 14;
        Height = 14;
    }

    public PipelineState State
    {
        get => (PipelineState)GetValue(StateProperty);
        set => SetValue(StateProperty, value);
    }

    protected override void OnRender(DrawingContext drawingContext)
    {
        var centre = new Point(Width / 2, Height / 2);
        var radius = (Math.Min(Width, Height) / 2) - 1;

        var fill = State == PipelineState.Running ? SignalBrush : PausedBrush;

        drawingContext.DrawEllipse(fill, RingPen, centre, radius, radius);
    }

    private static Brush Frozen(Color color)
    {
        var brush = new SolidColorBrush(color);
        brush.Freeze();
        return brush;
    }

    private static Pen FrozenPen(Color color)
    {
        var pen = new Pen(Frozen(color), 1);
        pen.Freeze();
        return pen;
    }
}
