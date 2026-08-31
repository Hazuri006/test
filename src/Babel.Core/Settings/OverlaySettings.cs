namespace Babel.Core.Settings;

/// <summary>
/// Reglages de l'overlay.
///
/// La position est stockee en fraction de la zone de travail du moniteur, pas en
/// pixels : un changement de resolution ou de mise a l'echelle ne doit pas
/// envoyer le sous-titre hors de l'ecran.
/// </summary>
public sealed class OverlaySettings
{
    /// <summary>Nom de peripherique du moniteur cible, vide pour le moniteur principal.</summary>
    public string MonitorDeviceName { get; set; } = string.Empty;

    /// <summary>Position horizontale du centre du bandeau, de 0 a 1.</summary>
    public double AnchorX { get; set; } = 0.5;

    /// <summary>Position verticale du centre du bandeau, de 0 a 1.</summary>
    public double AnchorY { get; set; } = 0.82;

    /// <summary>Largeur du bandeau en fraction de la largeur de la zone de travail.</summary>
    public double WidthFraction { get; set; } = 0.7;

    /// <summary>Taille du texte en pixels independants du peripherique.</summary>
    public double FontSize { get; set; } = 34;

    /// <summary>Opacite du texte.</summary>
    public double TextOpacity { get; set; } = 1.0;

    /// <summary>
    /// Opacite du fond assombri. Fixe en M0 : l'adaptation a la luminance des
    /// pixels situes derriere exige la capture d'ecran, donc M3.
    /// </summary>
    public double BackdropOpacity { get; set; } = 0.55;

    /// <summary>Epaisseur du contour du texte, en pixels.</summary>
    public double OutlineThickness { get; set; } = 2.0;

    public bool Visible { get; set; } = true;
}
