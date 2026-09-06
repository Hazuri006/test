using System.Text.Json.Serialization;

namespace Peek.Core.Configuration;

/// <summary>
/// Comportement d'un raccourci une fois qu'il reste affiche. Section 3 de la
/// specification : ce sont les deux modes, et ils ne se simplifient pas l'un
/// dans l'autre.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<PeekMode>))]
public enum PeekMode
{
    /// <summary>
    /// Coup d'oeil. La fenetre s'affiche par-dessus, Peek ne prend jamais le
    /// focus, le jeu garde le clavier et la souris. Mode par defaut.
    /// </summary>
    Glance,

    /// <summary>
    /// Utilisation. La fenetre prend le focus pour defiler ou saisir. Le
    /// basculement passe par la neutralisation des touches maintenues (I2).
    /// </summary>
    Use,
}
