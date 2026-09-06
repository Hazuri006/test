namespace Peek.Core.Input;

/// <summary>
/// Un evenement clavier tel que le callback du hook l'a vu.
///
/// Structure, et non classe : le callback ne doit rien allouer (I7). Elle est
/// copiee telle quelle dans un emplacement deja reserve du tampon circulaire.
/// </summary>
/// <param name="VirtualKey">Code virtuel remis par Windows.</param>
/// <param name="ScanCode">Code de balayage materiel.</param>
/// <param name="Transition">Enfoncement ou relachement.</param>
/// <param name="SystemTimeMs">
/// Horodatage de Windows lui-meme, en millisecondes depuis le demarrage. C'est
/// cette valeur qui sert a mesurer la duree d'un appui, et non l'heure a
/// laquelle le fil de travail a depile l'evenement : un retard de la file ne
/// doit jamais transformer une pression breve en maintien.
/// </param>
/// <param name="CaptureTicks">Horodatage haute resolution a l'entree du callback.</param>
public readonly record struct KeyEvent(
    int VirtualKey,
    int ScanCode,
    KeyTransition Transition,
    uint SystemTimeMs,
    long CaptureTicks);
