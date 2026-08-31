using System.Windows;
using System.Windows.Media;

namespace Babel.App.Overlay;

/// <summary>Une ligne prete a dessiner : geometrie gelee, boite d'encre, hauteur de mise en page.</summary>
internal sealed record SubtitleLineVisual(Geometry Geometry, Rect Ink, double Height);

/// <summary>
/// Ce qu'il reste a dessiner.
///
/// Tout le travail couteux — mise en forme du texte, construction du contour — a
/// deja eu lieu sur un thread de travail. Le thread d'interface ne fait plus que
/// deux DrawGeometry.
/// </summary>
internal sealed record SubtitleFrame(
    SubtitleLineVisual? Previous,
    SubtitleLineVisual Current,
    bool IsPartial,
    long OriginTimestamp,
    long SubmitTimestamp,
    long Sequence);
