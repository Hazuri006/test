namespace Babel.Core.Pipeline;

/// <summary>
/// Un etage du pipeline. Chaque etage possede sa propre boucle et n'echange avec
/// ses voisins que par des <see cref="StageLink{T}"/>.
/// </summary>
public interface IPipelineStage
{
    string Name { get; }

    /// <summary>
    /// Boucle de l'etage. Doit rendre la main rapidement quand le jeton est annule.
    /// </summary>
    Task RunAsync(CancellationToken cancellationToken);
}
