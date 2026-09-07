namespace Babel.Core.Audio;

/// <summary>
/// Reglages du decoupage en phrases.
///
/// <see cref="HangoverMilliseconds"/> est le compromis central de tout le jalon :
/// c'est la duree de silence exigee avant de declarer une phrase terminee. Trop
/// court, on coupe l'orateur au milieu d'une respiration ; trop long, on ajoute
/// cette duree entiere a la latence percue. La valeur par defaut suit le budget
/// de 200 ms de la section 3 de la specification.
/// </summary>
public sealed class VadOptions
{
    /// <summary>Au-dela, la trame est consideree comme de la parole.</summary>
    public double SpeechThreshold { get; init; } = 0.5;

    /// <summary>Duree de parole continue exigee avant d'ouvrir un segment.</summary>
    public double MinSpeechMilliseconds { get; init; } = 96;

    /// <summary>Duree de silence exigee avant de clore un segment.</summary>
    public double HangoverMilliseconds { get; init; } = 200;

    /// <summary>
    /// Au-dela, le segment est clos de force. Evite qu'un monologue continu ne
    /// produise jamais de sous-titre.
    /// </summary>
    public double MaxSegmentMilliseconds { get; init; } = 3_000;

    /// <summary>En deca, le segment est jete : c'est un bruit, pas une phrase.</summary>
    public double MinSegmentMilliseconds { get; init; } = 200;

    /// <summary>Cadence des hypotheses partielles pendant qu'une phrase est en cours.</summary>
    public double PartialIntervalMilliseconds { get; init; } = 500;
}
