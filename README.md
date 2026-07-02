# Explorateur Stellaire

Jeu 3D d'exploration spatiale procédurale inspiré de No Man's Sky, réalisé
avec **Godot 4.x** en **GDScript pur** : aucun asset externe, aucune
dépendance, aucun addon. Géométrie, matériaux, couleurs, noms et bruit sont
générés en code à partir d'une seed (PRNG mulberry32 + bruit de valeur 3D
maison).

## Lancer le projet

1. Installer [Godot 4.3+](https://godotengine.org/download) (version standard, pas .NET).
2. Dans le gestionnaire de projets : **Importer** → sélectionner le fichier `project.godot` de ce dépôt.
3. Ouvrir le projet puis appuyer sur **F5** (ou le bouton ▶). La scène principale `res://scenes/Main.tscn` est déjà configurée.

Au premier lancement, un overlay liste les contrôles : cliquer dans la
fenêtre pour capturer la souris et commencer à voler.

## Contrôles

| Entrée | Action |
|---|---|
| Souris | Orienter le vaisseau |
| ZQSD / WASD (touches physiques) | Avancer / reculer / translation latérale |
| Flèches | Alternative au clavier principal |
| Espace / Ctrl | Poussée verticale (monter / descendre) |
| Maj (Shift) | Boost |
| E | Scanner la planète proche |
| N (ou bouton de l'overlay) | Générer un nouveau système |
| Échap | Libérer la souris (ré-affiche l'overlay) |
| Clic | Capturer la souris / commencer |

## Boucle de jeu

- Chaque système contient un soleil lumineux (glow), un champ de 1200 étoiles
  et 6 à 8 planètes en orbite lente, toutes uniques : relief par bruit fractal
  seedé, 6 biomes (Luxuriant, Océan, Désert, Glacial, Volcanique, Toxique),
  océans plats et brillants, anneaux, lunes et halos atmosphériques selon la seed.
- Approchez-vous d'une planète et appuyez sur **E** pour la scanner : une
  fiche descriptive générée s'affiche et le compteur de découvertes progresse.
- Cartographiez toutes les planètes pour compléter le système, puis appuyez
  sur **N** pour en explorer un nouveau.

## Structure du projet

```
project.godot              Configuration (scène principale, fenêtre)
scenes/Main.tscn           Scène racine (monde, système, vaisseau, HUD)
scripts/main.gd            Orchestration : input map, environnement, scan, régénération
scripts/star_system.gd     Génération du système : soleil, étoiles, planètes
scripts/planet.gd          Planète procédurale : mesh, biomes, anneaux, lunes, atmosphère
scripts/ship.gd            Vol première personne (souris + clavier, boost, amortissement)
scripts/hud.gd             HUD complet construit en code (réticule, télémétrie, overlay)
scripts/seeded_rng.gd      PRNG déterministe (mulberry32)
scripts/noise.gd           Bruit de valeur 3D + fBm maison
scripts/name_generator.gd  Noms de planètes par syllabes seedées
```

Aucune sauvegarde disque ni réseau : tout l'état du jeu reste en mémoire.
