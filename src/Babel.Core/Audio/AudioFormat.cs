namespace Babel.Core.Audio;

/// <summary>
/// Le format interne du pipeline audio, fixe une fois pour toutes.
///
/// 16 kHz mono : c'est ce qu'attendent Silero VAD et whisper.cpp. Tout ce qui
/// entre est rééchantillonné une seule fois, a la capture.
/// </summary>
public static class AudioFormat
{
    public const int SampleRate = 16_000;

    public const int Channels = 1;

    /// <summary>
    /// Taille de trame imposee par Silero VAD en 16 kHz : 512 echantillons,
    /// soit 32 ms. C'est aussi la granularite de tout le decoupage.
    /// </summary>
    public const int FrameSamples = 512;

    public const double FrameMilliseconds = FrameSamples * 1000.0 / SampleRate;

    public static int MillisecondsToFrames(double milliseconds) =>
        (int)Math.Ceiling(milliseconds / FrameMilliseconds);

    public static int MillisecondsToSamples(double milliseconds) =>
        (int)(milliseconds * SampleRate / 1000.0);
}
