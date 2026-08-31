namespace Babel.Core.Subtitles;

/// <summary>
/// Un sous-titre en transit.
///
/// <see cref="OriginTimestamp"/> est pose une seule fois, a l'entree du pipeline,
/// et voyage avec le message : c'est lui qui rend la latence bout en bout
/// mesurable sans horloge partagee entre etages.
///
/// Type valeur : l'enveloppe ne coute aucune allocation.
/// </summary>
public readonly record struct SubtitleMessage(
    long Sequence,
    long OriginTimestamp,
    string Text,
    bool IsPartial)
{
    /// <summary>
    /// Une hypothese partielle est affichee en gris attenue, une phrase finale en
    /// pleine opacite. C'est le mecanisme d'affichage progressif de la section 3.
    /// </summary>
    public bool IsFinal => !IsPartial;
}
