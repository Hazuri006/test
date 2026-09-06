# Peek

Une fenêtre par-dessus le jeu, le temps d'un appui sur une touche, sans
alt-tab. On maintient, la fenêtre apparaît par-dessus le jeu assombri. On
relâche, on est de retour dans le jeu, qui n'a jamais perdu le focus.

La spécification complète est dans [SPEC.md](SPEC.md), les choix d'architecture
et ce qu'ils coûtent dans [DECISIONS.md](DECISIONS.md), les résultats de tests
par jeu et par anticheat dans [COMPATIBILITE.md](COMPATIBILITE.md).

## État

**Jalon M1 — coup d'œil.** Maintenir la touche affiche la fenêtre visée
par-dessus le jeu assombri, sans que le jeu perde le focus. Relâcher la remet
exactement où elle était. Une pression brève la laisse affichée.

M0 avant lui : icône dans la zone de notification, fichier de configuration,
hook clavier bas niveau conforme à I7, journalisation.

Le mode utilisation, les raccourcis multiples et la capture de touche arrivent
aux jalons suivants.

> **Rien de tout cela n'a jamais été exécuté.** Le code est écrit, compilé en
> compilation croisée depuis Linux, et le noyau est couvert par 78 tests. Le
> hook, le voile, l'icône et la manipulation de fenêtres **n'ont jamais tourné
> sur Windows**, et le banc de tests manuel de M0 n'a jamais été passé. Voir
> [COMPATIBILITE.md](COMPATIBILITE.md).

## Structure

| Dossier | Contenu |
|---|---|
| `src/Peek.Core` | Configuration, machine à états, file du hook, désignation de fenêtre, mesures. Sans WPF ni Win32, testable partout. |
| `src/Peek.App` | WPF, interop Win32, hook clavier, voile, manipulation de fenêtres, icône de notification. Windows uniquement. |
| `tests/Peek.Core.Tests` | 78 tests du noyau. |

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

## Banc de tests

À exécuter sur Windows. Un test qui échoue bloque le passage au jalon suivant.

**Tests automatisés** — `dotnet test`, 78 tests : sérialisation et réparation de
la configuration, instantané des touches surveillées, détection des conflits,
file entre le hook et le fil de travail, machine à états du maintien contre la
bascule, désignation de la fenêtre visée, état de restitution, relevés de mesure.

**Tests manuels de M0**, dans cet ordre :

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

**Tests manuels de M1**, les invariants I1 à I5 de la spécification :

| # | Test | Vérifie |
|---|---|---|
| 9 | Maintenir la touche pendant une partie : la fenêtre apparaît par-dessus le jeu assombri, le jeu garde le clavier et la souris, aucune frame sautée. | I1, I3 |
| 10 | Relâcher : retour au jeu en moins de 100 ms, la fenêtre reprend sa place et son ordre d'affichage. | I3, I5 |
| 11 | Enchaîner cinquante ouvertures et fermetures rapides : aucune fenêtre ne reste topmost, aucune fuite mémoire. | I3, I5 |
| 12 | Déclencher un coup d'œil, tuer Peek depuis le gestionnaire des tâches, relancer : les fenêtres retrouvent leur place. | I4 |
| 13 | Fermer la fenêtre visée pendant qu'elle est affichée, puis relâcher : aucun plantage. | — |
| 14 | Viser une fenêtre maximisée, puis une fenêtre réduite : les deux réapparaissent sans voler le focus, et retrouvent leur état. | I5 |
| 15 | Changer de résolution et débrancher un écran pendant que Peek tourne. | — |
| 16 | **Après plusieurs coups d'œil sur une fenêtre de navigateur, vérifier que la première image n'est pas figée.** Si elle l'est, D15 doit être révisée. | D15 |
| 17 | Relever dans le journal le temps d'apparition : il doit tenir sous 80 ms. | section 6 |

## Limites connues

Peek exige le **mode fenêtré sans bordure**. Le plein écran exclusif ne permet
pas d'afficher une fenêtre externe par-dessus, et il n'y a pas de contournement
qui respecte I8.

Peek ne répond pas au-dessus d'un **jeu lancé en administrateur** : un hook non
élevé ne reçoit pas ces frappes. Demander l'élévation serait pire, voir D9.

Une touche assignée à Peek **devient inutilisable dans le jeu**. C'est I1, et
c'est le prix à payer pour que le raccourci fonctionne à coup sûr.
