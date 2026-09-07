namespace Babel.Core.Audio;

/// <summary>Un peripherique de sortie, tel que montre dans l'ecran Source.</summary>
public readonly record struct AudioDevice(string Id, string Name, bool IsDefault);

/// <summary>
/// Capture du son systeme. L'implementation est propre a Windows et vit dans
/// Babel.App ; le noyau ne connait que cette interface.
/// </summary>
public interface IAudioCapture : IDisposable
{
    /// <summary>Leve pour chaque trame de 32 ms, depuis le thread de capture.</summary>
    event Action<AudioFrame>? FrameReady;

    /// <summary>Leve quand la capture s'arrete sur une erreur, avec un message affichable.</summary>
    event Action<string>? Failed;

    /// <summary>Niveau efficace lisse, de 0 a 1, pour le vumetre.</summary>
    double Level { get; }

    bool IsCapturing { get; }

    IReadOnlyList<AudioDevice> ListDevices();

    /// <param name="deviceId">Identifiant du peripherique, vide pour celui par defaut.</param>
    void Start(string deviceId);

    void Stop();
}
