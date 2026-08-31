using System.Windows;
using System.Windows.Media;
using Babel.Core.Subtitles;

namespace Babel.App.Overlay;

/// <summary>
/// Construit la geometrie du sous-titre hors du thread d'interface.
///
/// WPF n'a pas de contour de texte natif. On passe donc par la geometrie du
/// texte, tracee ensuite avec un stylo : c'est la seule solution nette, et elle a
/// l'avantage de pouvoir etre preparee sur le thread appelant puis gelee, ce qui
/// laisse au thread d'interface un travail negligeable.
/// </summary>
internal sealed class SubtitleComposer
{
    private readonly object _gate = new();

    private SubtitleStyle _style;
    private SubtitleLineVisual? _lastFinalLine;

    internal SubtitleComposer(SubtitleStyle style) => _style = style;

    internal SubtitleStyle Style
    {
        get
        {
            lock (_gate)
            {
                return _style;
            }
        }
    }

    /// <summary>
    /// Change de style. Les geometries deja construites sont abandonnees : elles
    /// portaient l'ancienne taille de police.
    /// </summary>
    internal void UpdateStyle(SubtitleStyle style)
    {
        lock (_gate)
        {
            _style = style;
            _lastFinalLine = null;
        }
    }

    internal void Reset()
    {
        lock (_gate)
        {
            _lastFinalLine = null;
        }
    }

    /// <summary>Hauteur reservee a l'affichage : deux lignes, quelle que soit la phrase.</summary>
    internal double ReservedHeight(SubtitleStyle style) =>
        (style.FontSize * 1.35 * 2) + 24;

    internal SubtitleFrame Compose(SubtitleMessage message, long submitTimestamp)
    {
        SubtitleStyle style;
        SubtitleLineVisual? previous;

        lock (_gate)
        {
            style = _style;
            previous = _lastFinalLine;
        }

        var (line, lineCount) = Build(message.Text, style);

        // Deux lignes au maximum a l'ecran. Quand la phrase courante en occupe
        // deja deux, l'ancienne sort du champ : on ne recompose jamais la mise en
        // page pour faire tenir trois lignes.
        if (lineCount >= 2)
        {
            previous = null;
        }

        if (message.IsFinal)
        {
            lock (_gate)
            {
                // Le style peut avoir change pendant la construction ; dans ce cas
                // on ne memorise pas une geometrie deja perimee.
                if (ReferenceEquals(style, _style))
                {
                    _lastFinalLine = line;
                }
            }
        }

        return new SubtitleFrame(
            previous,
            line,
            message.IsPartial,
            message.OriginTimestamp,
            submitTimestamp,
            message.Sequence);
    }

    private static (SubtitleLineVisual Line, int LineCount) Build(string text, SubtitleStyle style)
    {
        var formatted = new FormattedText(
            text,
            SubtitleStyle.Culture,
            FlowDirection.LeftToRight,
            style.Typeface,
            style.FontSize,
            style.FinalBrush,
            style.PixelsPerDip)
        {
            MaxTextWidth = Math.Max(1, style.MaxWidth),
            MaxLineCount = 2,
            TextAlignment = TextAlignment.Center,
            Trimming = TextTrimming.CharacterEllipsis,
        };

        var geometry = formatted.BuildGeometry(new Point(0, 0));
        geometry.Freeze();

        var lineHeight = formatted.LineHeight > 0 ? formatted.LineHeight : style.FontSize * 1.35;
        var lineCount = Math.Max(1, (int)Math.Round(formatted.Height / lineHeight));

        var ink = geometry.Bounds;

        if (ink.IsEmpty)
        {
            ink = new Rect(0, 0, 0, formatted.Height);
        }

        return (new SubtitleLineVisual(geometry, ink, formatted.Height), lineCount);
    }
}
