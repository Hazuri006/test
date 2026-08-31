namespace Babel.Core.Subtitles;

/// <summary>
/// Destination finale d'un sous-titre. Implemente par l'overlay.
///
/// L'implementation ne doit jamais bloquer l'appelant : elle est invoquee depuis
/// un etage du pipeline, pas depuis le thread d'interface.
/// </summary>
public interface ISubtitleSink
{
    void Publish(SubtitleMessage message);

    /// <summary>Efface l'affichage, par exemple a la mise en pause.</summary>
    void Clear();
}
