namespace Babel.Core.Audio;

/// <summary>
/// Donne la probabilite qu'une trame contienne de la parole. Implemente par
/// Silero VAD via ONNX Runtime, dans Babel.App.
/// </summary>
public interface ISpeechDetector : IDisposable
{
    bool IsReady { get; }

    /// <summary>Message affichable quand le detecteur n'est pas utilisable.</summary>
    string? UnavailableReason { get; }

    /// <param name="frame">Exactement <see cref="AudioFormat.FrameSamples"/> echantillons.</param>
    double Probability(ReadOnlySpan<float> frame);

    /// <summary>Remet l'etat interne a zero entre deux phrases.</summary>
    void Reset();
}
