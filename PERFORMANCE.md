# Performance — DRIFTWAKE

## Objectifs

- **60 FPS** sur une machine moyenne en qualité **Moyenne**.
- **≥ 30 FPS** sur une machine modeste (qualité **Faible**).
- Pas de fuite mémoire, pas d'accumulation illimitée d'objets.

## Techniques employées

| Technique                         | Où                                                        |
| --------------------------------- | --------------------------------------------------------- |
| Vagues sur GPU (vertex shader)    | `OceanShader` — déplacement de Gerstner, normales analytiques |
| Grille d'océan recentrée caméra   | `OceanManager` — mer « infinie » sans géométrie infinie   |
| Object pooling                    | `FloatingDebrisManager` — débris recyclés par type, budget borné |
| InstancedMesh                     | `IslandManager` — buissons d'îles                         |
| Distance culling                  | `IslandManager` — îles masquées au-delà de la distance d'affichage |
| Matériaux & géométries partagés   | `Materials` (cache), géométries réutilisées               |
| Textures procédurales mises en cache | `TextureFactory`, `IconFactory`                        |
| IA à coût borné                   | `Shark` — un seul agent, steering simple, pas de raycast lourd |
| `dt` borné                        | `Game.frame` — empêche les explosions de simulation après un gel |
| Tone mapping / post léger         | bloom **modéré** + SMAA, désactivés en qualité Faible     |

## Préréglages graphiques (effets réels)

Définis dans `core/SettingsManager.ts` (`GRAPHICS_PRESETS`). Chaque préréglage modifie
**réellement** :

| Paramètre              | Faible | Moyen | Élevé | Ultra |
| ---------------------- | ------ | ----- | ----- | ----- |
| Échelle de rendu       | 0.75   | 1.0   | 1.0   | 1.0   |
| Ombres                 | off    | 1024  | 2048  | 4096  |
| Distance d'affichage   | 600    | 900   | 1300  | 1800  |
| Subdivisions océan     | 96     | 144   | 200   | 256   |
| Budget de débris       | 28     | 48    | 64    | 90    |
| Densité de particules  | 0.4    | 0.7   | 1.0   | 1.4   |
| Post-traitement        | off    | on    | on    | on    |
| Bloom                  | off    | off   | on    | on    |
| Anti-aliasing          | off    | on    | on    | on    |
| Densité de feuillage   | 0.4    | 0.7   | 1.0   | 1.3   |

L'échelle de rendu est appliquée via `renderer.setPixelRatio` (capé à 2× le DPR). Le
préréglage est sauvegardé et **pleinement** appliqué au (re)lancement d'une partie ; FOV,
exposition, sensibilité et volumes s'appliquent en direct.

## Budget mémoire / nettoyage

- Chaque manager expose `dispose()` (géométries, matériaux, textures, écouteurs).
- Les matériaux proviennent d'un cache partagé : ils ne sont **pas** libérés par pièce
  (libération globale via `Materials.disposeAll`).
- Les débris hors de portée sont recyclés (mesh masqué et remis au pool), jamais détruits
  puis recréés.

## Idées d'optimisation futures

- **LOD** explicite pour les palmiers/rochers d'île selon la distance.
- **Clipmap / quadtree** d'océan pour concentrer les sommets près de la caméra.
- Mise à jour de l'IA et des animations à **fréquence réduite** selon la distance.
- Textures **compressées** (KTX2/Basis) si des assets importés sont ajoutés.
- Lumières dynamiques limitées (actuellement soleil + lune + hémisphérique seulement).

## Mesurer

Utilisez le panneau *Performance* des outils navigateur, ou `renderer.info` (exposé via
`Renderer.info()` : draw calls, triangles, géométries, textures) pour brancher un futur
overlay de debug (FPS, entités, seed, position, état de l'IA).
