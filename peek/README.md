# Peek

Une fenêtre par-dessus le jeu, le temps d'un appui sur une touche, sans
alt-tab. On maintient, la fenêtre apparaît par-dessus le jeu assombri. On
relâche, on est de retour dans le jeu, qui n'a jamais perdu le focus.

La spécification complète est dans [SPEC.md](SPEC.md), les choix d'architecture
et ce qu'ils coûtent dans [DECISIONS.md](DECISIONS.md), les résultats de tests
par jeu et par anticheat dans [COMPATIBILITE.md](COMPATIBILITE.md).

## État

**Jalon M0 — socle.** Icône dans la zone de notification, fichier de
configuration, hook clavier bas niveau conforme à I7, journalisation.

**Aucune fenêtre n'est encore manipulée** : c'est la frontière du jalon, et elle
est volontaire. Un appui sur une touche assignée est avalé, mesuré, et part au
journal. Le voile, le déplacement des fenêtres et leur restitution arrivent à M1.

Le code a été écrit et compilé en compilation croisée depuis Linux. Le hook,
l'icône et la fenêtre **n'ont jamais été exécutés sur Windows** : voir
[COMPATIBILITE.md](COMPATIBILITE.md).

## Structure

| Dossier | Contenu |
|---|---|
| `src/Peek.Core` | Configuration, machine à états, file du hook, mesures. Sans WPF ni Win32, testable partout. |
| `src/Peek.App` | WPF, interop Win32, hook clavier, icône de notification. Windows uniquement. |
| `tests/Peek.Core.Tests` | 60 tests du noyau. |

## Construire

```
dotnet build Peek.sln -c Release
dotnet test tests/Peek.Core.Tests/Peek.Core.Tests.csproj
```

`Peek.Core` et ses tests se compilent sur n'importe quelle plateforme. Sur
Linux ou macOS, ajouter `-p:EnableWindowsTargeting=true` pour compiler aussi
`Peek.App` — la passe de markup XAML fonctionne, l'exécutable produit ne se
lance évidemment que sous Windows.

## Configurer

Jusqu'au jalon M2, qui apporte la capture de touche et la sélection de fenêtre,
les raccourcis s'écrivent à la main dans `%APPDATA%\Peek\config.json`.

```json
{
  "schemaVersion": 1,
  "shortcuts": [
    {
      "id": "guide",
      "key": { "virtualKey": 71, "scanCode": 34, "label": "G" },
      "target": { "processName": "chrome", "titlePattern": "" },
      "mode": "Glance",
      "enabled": true
    }
  ],
  "advanced": {
    "holdThresholdMs": 250,
    "veilOpacity": 0.4,
    "audioDuckPercent": 60,
    "startWithWindows": false,
    "diagnosticLogging": false
  }
}
```

`virtualKey` est un code virtuel Windows : 71 pour `G`, 84 pour `T`, 82 pour
`R`. Un fichier illisible est mis de côté en `.corrupt` et les valeurs par
défaut s'appliquent ; une valeur hors bornes est ramenée dans ses bornes.

Le journal est dans `%APPDATA%\Peek\logs`, accessible depuis le menu de l'icône.

## Banc de tests du jalon M0

À exécuter sur Windows. Un test qui échoue bloque le passage à M1.

**Tests automatisés** — `dotnet test`, 60 tests : sérialisation et réparation de
la configuration, instantané des touches surveillées, détection des conflits,
file entre le hook et le fil de travail, machine à états du maintien contre la
bascule, relevés de mesure.

**Tests manuels**, dans cet ordre :

| # | Test | Vérifie |
|---|---|---|
| 1 | Assigner une touche, la presser dans le bloc-notes puis dans un jeu : elle n'arrive nulle part. | I1 |
| 2 | Laisser Peek au repos une heure, relever processeur et mémoire. | I6 |
| 3 | Taper 50 000 caractères d'affilée : aucune touche perdue ni dupliquée, `us` maximum du callback sous le budget dans le journal. | I7 |
| 4 | Redémarrer l'explorateur Windows : l'icône revient. | D6 |
| 5 | Mettre au premier plan une fenêtre élevée : les raccourcis n'y répondent pas, conformément à la limite annoncée. | D9 |
| 6 | Lancer deux fois Peek : la seconde instance le dit et s'arrête. | — |
| 7 | Analyse antivirus du binaire, faux positif recherché activement. | D1 |
| 8 | **Test anticheat**, protocole dans [COMPATIBILITE.md](COMPATIBILITE.md). | D1 |

Le test 8 commande la suite du projet. Voir D1.

## Limites connues

Peek exige le **mode fenêtré sans bordure**. Le plein écran exclusif ne permet
pas d'afficher une fenêtre externe par-dessus, et il n'y a pas de contournement
qui respecte I8.

Peek ne répond pas au-dessus d'un **jeu lancé en administrateur** : un hook non
élevé ne reçoit pas ces frappes. Demander l'élévation serait pire, voir D9.

Une touche assignée à Peek **devient inutilisable dans le jeu**. C'est I1, et
c'est le prix à payer pour que le raccourci fonctionne à coup sûr.
