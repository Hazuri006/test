namespace Babel.Core.Audio;

/// <summary>
/// Une trame de 32 ms, en 16 kHz mono.
///
/// Le tableau vient d'un <see cref="System.Buffers.ArrayPool{T}"/> et doit etre
/// rendu, y compris quand la politique de rejet jette la trame : c'est le role du
/// rappel de recyclage de <see cref="Pipeline.StageLink{T}"/>. Sans ca, la boucle
/// chaude allouerait 31 tableaux par seconde et ferait travailler le ramasse-miettes
/// en plein milieu du chemin de latence.
/// </summary>
public readonly record struct AudioFrame(float[] Buffer, int Length, long Timestamp)
{
    public ReadOnlySpan<float> Samples => Buffer.AsSpan(0, Length);
}
