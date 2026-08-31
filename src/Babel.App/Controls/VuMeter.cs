using System.Windows;
using System.Windows.Media;

namespace Babel.App.Controls;

/// <summary>
/// Vumetre horizontal segmente.
///
/// Ce n'est pas une decoration : c'est l'outil de diagnostic de l'ecran Source.
/// Si l'utilisateur ne voit rien bouger, c'est qu'il a choisi le mauvais
/// peripherique. Il reste a zero jusqu'a M1, ou la capture WASAPI l'alimentera.
/// </summary>
internal sealed class VuMeter : FrameworkElement
{
    private const int SegmentCount = 32;
    private const double SegmentGap = 2;

    public static readonly DependencyProperty LevelProperty = DependencyProperty.Register(
        nameof(Level),
        typeof(double),
        typeof(VuMeter),
        new FrameworkPropertyMetadata(0.0, FrameworkPropertyMetadataOptions.AffectsRender));

    private static readonly Brush LitBrush = Frozen(Color.FromRgb(0xE8, 0xA3, 0x3D));
    private static readonly Brush UnlitBrush = Frozen(Color.FromRgb(0x3E, 0x48, 0x44));
    private static readonly Brush ClipBrush = Frozen(Color.FromRgb(0xC4, 0x48, 0x3A));

    internal VuMeter()
    {
        Height = 16;
        HorizontalAlignment = HorizontalAlignment.Left;
        Width = 360;
    }

    /// <summary>Niveau capte, de 0 a 1.</summary>
    public double Level
    {
        get => (double)GetValue(LevelProperty);
        set => SetValue(LevelProperty, value);
    }

    protected override void OnRender(DrawingContext drawingContext)
    {
        var level = Math.Clamp(Level, 0, 1);
        var segmentWidth = (ActualWidth - ((SegmentCount - 1) * SegmentGap)) / SegmentCount;

        if (segmentWidth <= 0)
        {
            return;
        }

        var lit = (int)Math.Round(level * SegmentCount);

        for (var i = 0; i < SegmentCount; i++)
        {
            var brush = i < lit
                ? i >= SegmentCount - 3 ? ClipBrush : LitBrush
                : UnlitBrush;

            var x = i * (segmentWidth + SegmentGap);
            drawingContext.DrawRectangle(brush, null, new Rect(x, 0, segmentWidth, ActualHeight));
        }
    }

    private static Brush Frozen(Color color)
    {
        var brush = new SolidColorBrush(color);
        brush.Freeze();
        return brush;
    }
}
