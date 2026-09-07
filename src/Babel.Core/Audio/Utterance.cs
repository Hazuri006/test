namespace Babel.Core.Audio;

/// <summary>
/// Un segment de parole prêt a transcrire.
///
/// Le tableau vient du pool et doit etre rendu, y compris quand la politique de
/// rejet jette le segment.
/// </summary>
public readonly record struct Utterance(
    float[] Buffer,
    int Length,
    long OriginTimestamp,
    bool IsFinal,
    long Sequence)
{
    public ReadOnlyMemory<float> Samples => Buffer.AsMemory(0, Length);

    public double DurationMilliseconds => Length * 1000.0 / AudioFormat.SampleRate;
}
