using System.Windows;
using System.Windows.Media;

namespace Babel.App.Overlay;

/// <summary>
/// La surface de dessin du sous-titre.
///
/// Ancree en bas : une phrase d'une seule ligne ne saute pas quand la suivante en
/// occupe deux. La hauteur est reservee une fois pour toutes, il n'y a donc jamais
/// de recomposition de la mise en page.
///
/// Aucune animation, jamais. Un fondu de 150 ms serait 150 ms de latence percue
/// offertes a la concurrence.
/// </summary>
internal sealed class SubtitleVisual : FrameworkElement
{
    private const double LineGap = 4;
    private const double BackdropPaddingX = 12;
    private const double BackdropPaddingY = 4;

    private static readonly Pen RepositionPen = CreateRepositionPen();

    private SubtitleFrame? _frame;
    private SubtitleStyle _style;
    private bool _repositioning;

    internal SubtitleVisual(SubtitleStyle style)
    {
        _style = style;
        IsHitTestVisible = false;
    }

    internal void SetStyle(SubtitleStyle style)
    {
        _style = style;
        InvalidateVisual();
    }

    internal void SetFrame(SubtitleFrame? frame)
    {
        _frame = frame;
        InvalidateVisual();
    }

    /// <summary>
    /// En mode deplacement, le bandeau devient visible et saisissable : sans ce
    /// reperage, l'utilisateur deplacerait une zone invisible.
    /// </summary>
    internal void SetRepositioning(bool repositioning)
    {
        _repositioning = repositioning;
        InvalidateVisual();
    }

    protected override void OnRender(DrawingContext drawingContext)
    {
        if (_repositioning)
        {
            drawingContext.DrawRectangle(
                Brushes.Transparent,
                RepositionPen,
                new Rect(0.5, 0.5, Math.Max(0, ActualWidth - 1), Math.Max(0, ActualHeight - 1)));
        }

        var frame = _frame;

        if (frame is null)
        {
            return;
        }

        var style = _style;
        var currentBrush = frame.IsPartial ? style.PartialBrush : style.FinalBrush;

        var currentTop = ActualHeight - frame.Current.Height;
        DrawLine(drawingContext, frame.Current, currentTop, currentBrush, style);

        if (frame.Previous is { } previous)
        {
            DrawLine(
                drawingContext,
                previous,
                currentTop - previous.Height - LineGap,
                style.FinalBrush,
                style);
        }
    }

    private static Pen CreateRepositionPen()
    {
        var brush = new SolidColorBrush(Color.FromRgb(0xE8, 0xA3, 0x3D));
        brush.Freeze();

        var pen = new Pen(brush, 1);
        pen.Freeze();
        return pen;
    }

    private static void DrawLine(
        DrawingContext drawingContext,
        SubtitleLineVisual line,
        double top,
        Brush fill,
        SubtitleStyle style)
    {
        drawingContext.PushTransform(new TranslateTransform(0, top));

        try
        {
            // Fond assombri ajuste a l'encre du texte, pas a la largeur du bandeau :
            // un bandeau pleine largeur masquerait l'image pour rien.
            var backdrop = Rect.Inflate(line.Ink, BackdropPaddingX, BackdropPaddingY);

            if (backdrop.Width > 0 && backdrop.Height > 0)
            {
                drawingContext.DrawRectangle(style.BackdropBrush, null, backdrop);
            }

            drawingContext.DrawGeometry(fill, style.OutlinePen, line.Geometry);
        }
        finally
        {
            drawingContext.Pop();
        }
    }
}
