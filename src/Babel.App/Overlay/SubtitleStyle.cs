using System.Globalization;
using System.Windows;
using System.Windows.Media;
using Babel.Core.Settings;

namespace Babel.App.Overlay;

/// <summary>
/// Instantane immuable du style du sous-titre.
///
/// Toutes les ressources graphiques qu'il contient sont gelees : c'est ce qui
/// autorise leur usage depuis un thread de travail, hors du thread d'interface.
/// </summary>
internal sealed class SubtitleStyle
{
    private SubtitleStyle(
        Typeface typeface,
        double fontSize,
        double maxWidth,
        double pixelsPerDip,
        double outlineThickness,
        Brush finalBrush,
        Brush partialBrush,
        Pen outlinePen,
        Brush backdropBrush)
    {
        Typeface = typeface;
        FontSize = fontSize;
        MaxWidth = maxWidth;
        PixelsPerDip = pixelsPerDip;
        OutlineThickness = outlineThickness;
        FinalBrush = finalBrush;
        PartialBrush = partialBrush;
        OutlinePen = outlinePen;
        BackdropBrush = backdropBrush;
    }

    internal Typeface Typeface { get; }

    internal double FontSize { get; }

    internal double MaxWidth { get; }

    internal double PixelsPerDip { get; }

    internal double OutlineThickness { get; }

    /// <summary>Phrase finale : pleine opacite.</summary>
    internal Brush FinalBrush { get; }

    /// <summary>Hypothese partielle : gris attenue, affiche immediatement.</summary>
    internal Brush PartialBrush { get; }

    internal Pen OutlinePen { get; }

    internal Brush BackdropBrush { get; }

    internal static CultureInfo Culture => CultureInfo.CurrentUICulture;

    internal static SubtitleStyle Create(
        FontFamily fontFamily,
        OverlaySettings settings,
        double maxWidth,
        double pixelsPerDip)
    {
        var typeface = new Typeface(fontFamily, FontStyles.Normal, FontWeights.SemiBold, FontStretches.Normal);

        var text = Color.FromRgb(0xED, 0xE8, 0xDC);

        var finalBrush = new SolidColorBrush(text) { Opacity = Math.Clamp(settings.TextOpacity, 0.1, 1.0) };
        finalBrush.Freeze();

        // Gris attenue : l'utilisateur voit bouger quelque chose en moins de
        // 200 ms, sans confondre une hypothese avec une phrase confirmee.
        var partialBrush = new SolidColorBrush(text) { Opacity = Math.Clamp(settings.TextOpacity * 0.5, 0.1, 1.0) };
        partialBrush.Freeze();

        var outlineBrush = new SolidColorBrush(Color.FromRgb(0x0F, 0x12, 0x11));
        outlineBrush.Freeze();

        var outlinePen = new Pen(outlineBrush, Math.Max(0, settings.OutlineThickness))
        {
            LineJoin = PenLineJoin.Round,
        };
        outlinePen.Freeze();

        var backdrop = new SolidColorBrush(Color.FromRgb(0x0F, 0x12, 0x11))
        {
            Opacity = Math.Clamp(settings.BackdropOpacity, 0, 1),
        };
        backdrop.Freeze();

        return new SubtitleStyle(
            typeface,
            settings.FontSize,
            maxWidth,
            pixelsPerDip,
            settings.OutlineThickness,
            finalBrush,
            partialBrush,
            outlinePen,
            backdrop);
    }
}
