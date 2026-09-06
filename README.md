# Babel

Sous-titres traduits en temps réel, affichés par-dessus n'importe quelle
application Windows, sans aucune intégration côté application cible.

La spécification complète est dans [SPEC.md](SPEC.md). Les choix d'architecture et
leur justification sont dans [DECISIONS.md](DECISIONS.md), les mesures de latence
dans [PERF.md](PERF.md), les licences dans [LICENSES.md](LICENSES.md).

## État

**Jalon M0 — squelette.** Fenêtre de réglages, overlay transparent et
click-through, raccourcis globaux, sauvegarde des réglages, HUD de latence câblé.
Ni audio, ni transcription, ni traduction, ni OCR : ils arrivent aux jalons
suivants.

## Structure

| Dossier | Contenu |
|---|---|
| `src/Babel.Core` | Pipeline, politique de rejet, métriques, réglages. Sans WPF, testable partout. |
| `src/Babel.App` | WPF, interop Win32, overlay, réglages, HUD. Windows uniquement. |
| `tests/Babel.Core.Tests` | Tests du noyau. |

## Construire

```
dotnet build Babel.sln -c Release
dotnet test tests/Babel.Core.Tests/Babel.Core.Tests.csproj
```

La solution complète exige Windows : la compilation du markup WPF n'existe pas
ailleurs. `Babel.Core` et ses tests se compilent sur n'importe quelle plateforme.

## Raccourcis

| Raccourci | Effet |
|---|---|
| `Ctrl+Alt+Espace` | Met la chaîne en pause, ou la relance |
| `Ctrl+Alt+H` | Affiche ou masque les sous-titres |
| `Ctrl+Alt+P` | Rend le bandeau saisissable à la souris |
| `F9` | Affiche le HUD de latence |
| `Ctrl+Alt+S` | Écrit un relevé de latence dans `PERF.md` |

## Limite connue

Les sous-titres ne peuvent pas s'afficher au-dessus d'un jeu en **plein écran
exclusif**. Le mode fenêtré sans bordure est nécessaire. C'est une conséquence
directe du refus de toute injection dans le processus cible, et ce refus n'est pas
négociable : il protège les utilisateurs d'un bannissement par les anticheat.

## Autre projet dans ce dépôt

Le dossier [`peek/`](peek/) contient **Peek**, un logiciel distinct : une fenêtre
par-dessus le jeu le temps d'un appui sur une touche. Il a sa propre
spécification, sa propre solution et sa propre intégration continue, et ne
partage aucun code avec Babel. Il y séjourne en attendant son propre dépôt.
