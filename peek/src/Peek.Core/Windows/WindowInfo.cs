namespace Peek.Core.Windows;

/// <summary>
/// Ce que Peek sait d'une fenetre : son identifiant, le nom de son processus,
/// son titre. Rien de plus.
///
/// I8 : on ne lit la memoire de personne. Le nom du processus vient de la liste
/// des processus du systeme, la meme que celle du gestionnaire des taches, et
/// aucun descripteur n'est ouvert sur le processus vise.
/// </summary>
/// <param name="Handle">HWND, transporte en entier long pour rester testable hors Windows.</param>
/// <param name="ProcessName">Nom du processus, sans extension.</param>
/// <param name="Title">Titre de la fenetre.</param>
public readonly record struct WindowInfo(long Handle, string ProcessName, string Title);
