namespace Babel.Core.Pipeline;

/// <summary>
/// Etat de la chaine, tel que montre par le voyant unique de l'interface :
/// ambre quand elle tourne, rouge quand elle est en pause.
/// </summary>
public enum PipelineState
{
    Stopped,
    Running,
    Paused,
}
