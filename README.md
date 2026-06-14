# THE BACKROOMS — Survie 🟡

Jeu d'horreur **3D** jouable directement dans le navigateur (HTML + [Three.js](https://threejs.org/), un seul fichier `index.html`, aucune installation).

## 🎮 Lancer le jeu
Ouvre simplement **`index.html`** dans un navigateur moderne (Chrome, Edge, Firefox).
Une connexion internet est requise au premier chargement (Three.js est récupéré via CDN).

## 🧩 But du jeu
Tu es piégé dans les **Backrooms** (Niveau 0, le labyrinthe jaune des néons bourdonnants). Une **entité** te traque sans relâche.

1. 🟡 **Récupère des pièces** éparpillées dans le labyrinthe (il en faut **5**).
2. 🔫 **Achète le pistolet** à la **borne** bleue (touche **E** à proximité).
3. ✋ **Équipe l'arme** avec la touche **E**.
4. 💀 **Abats le monstre** au pistolet (clic gauche).
5. 🟢 **Échappe-toi** par la **porte de SORTIE** qui s'ouvre une fois l'entité éliminée.

…le tout en évitant que la créature ne t'attrape !

## 🎛️ Commandes
| Touche | Action |
|---|---|
| `Z Q S D` / `W A S D` / Flèches | Se déplacer |
| Souris | Regarder autour |
| `Shift` | Courir |
| `E` | Acheter / Équiper l'arme |
| Clic gauche | Tirer |
| `M` | Afficher/masquer la carte |
| `Échap` | Pause |

## ✨ Fonctionnalités
- Environnement 3D « backrooms » généré procéduralement (labyrinthe, salles ouvertes, néons).
- Textures procédurales (papier peint jaune taché, moquette, dalles de plafond) + brouillard d'ambiance.
- IA du monstre avec **poursuite par pathfinding** (BFS) et accélération quand il te voit.
- Système d'économie : pièces → achat → équipement de l'arme.
- Tir hitscan, effets (flash de bouche, recul, tremblement d'écran, voile de dégâts).
- Mini-carte, HUD (santé, pièces, objectif), sons générés en **WebAudio** (bourdonnement, grognements, tirs).
- Écrans de victoire / défaite et rejouabilité (labyrinthe différent à chaque partie).

Bonne survie. 🎧
