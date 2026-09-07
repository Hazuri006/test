namespace Babel.Core.Audio;

/// <summary>
/// Transcription d'un segment audio. Implemente par whisper.cpp via Whisper.net,
/// dans Babel.App.
/// </summary>
public interface IAsrEngine : IDisposable
{
    bool IsReady { get; }

    /// <summary>Message affichable quand le moteur n'est pas utilisable.</summary>
    string? UnavailableReason { get; }

    /// <summary>Nom du chemin d'execution reellement retenu : CUDA, Vulkan ou processeur.</summary>
    string Backend { get; }

    /// <param name="samples">16 kHz mono.</param>
    /// <param name="language">Code de langue, ou vide pour la detection automatique.</param>
    Task<string> TranscribeAsync(ReadOnlyMemory<float> samples, string language, CancellationToken cancellationToken);
}
