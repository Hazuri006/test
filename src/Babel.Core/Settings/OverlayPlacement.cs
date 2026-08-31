namespace Babel.Core.Settings;

/// <summary>Rectangle independant de WPF, pour garder le noyau testable hors Windows.</summary>
public readonly record struct PlacementRect(double X, double Y, double Width, double Height)
{
    public double Right => X + Width;

    public double Bottom => Y + Height;
}

/// <summary>Zone de travail d'un moniteur, en pixels independants du peripherique.</summary>
public readonly record struct WorkArea(double X, double Y, double Width, double Height);

/// <summary>
/// Traduit une position normalisee en rectangle concret.
///
/// L'overlay est toujours ramene entierement dans la zone de travail : un
/// sous-titre a moitie hors ecran est un bug visible immediatement, et il ne doit
/// pas pouvoir survivre a un changement de resolution.
/// </summary>
public static class OverlayPlacement
{
    public const double MinimumWidth = 160;

    public static PlacementRect Resolve(WorkArea area, OverlaySettings settings, double height)
    {
        ArgumentNullException.ThrowIfNull(settings);

        var width = Math.Max(MinimumWidth, area.Width * Math.Clamp(settings.WidthFraction, 0.1, 1.0));
        width = Math.Min(width, area.Width);

        var clampedHeight = Math.Min(Math.Max(height, 0), area.Height);

        var centreX = area.X + (area.Width * Math.Clamp(settings.AnchorX, 0, 1));
        var centreY = area.Y + (area.Height * Math.Clamp(settings.AnchorY, 0, 1));

        var x = centreX - (width / 2);
        var y = centreY - (clampedHeight / 2);

        x = Math.Clamp(x, area.X, area.X + area.Width - width);
        y = Math.Clamp(y, area.Y, area.Y + area.Height - clampedHeight);

        return new PlacementRect(x, y, width, clampedHeight);
    }

    /// <summary>
    /// Operation inverse, utilisee quand l'utilisateur deplace l'overlay a la souris
    /// en mode repositionnement.
    /// </summary>
    public static (double AnchorX, double AnchorY) ToAnchors(WorkArea area, PlacementRect rect)
    {
        if (area.Width <= 0 || area.Height <= 0)
        {
            return (0.5, 0.82);
        }

        var anchorX = (rect.X + (rect.Width / 2) - area.X) / area.Width;
        var anchorY = (rect.Y + (rect.Height / 2) - area.Y) / area.Height;

        return (Math.Clamp(anchorX, 0, 1), Math.Clamp(anchorY, 0, 1));
    }
}
