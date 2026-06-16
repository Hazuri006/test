# Architecture — DRIFTWAKE

## Principes

- **Séparation logique / rendu** : la logique de jeu (inventaire, survie, grille de
  construction, IA, recettes) ne dépend pas de Three.js et est testable sans GPU.
- **Composition plutôt qu'héritage** : les systèmes sont de petites classes autonomes
  assemblées par l'orchestrateur `Game`.
- **Événements typés** : un `EventBus<GameEvents>` découple émetteurs et récepteurs.
- **Données centralisées** : `ItemDatabase`, `RecipeDatabase` sont les sources uniques de
  vérité pour les objets et recettes.
- **Object pooling & budgets** : débris flottants recyclés, pas d'allocation par frame.
- **Déterminisme** : `RNG` (mulberry32) seedé pour une génération d'îles reproductible.

## Boucle de jeu

`Game.frame()` (requestAnimationFrame) calcule un `dt` borné (≤ 50 ms) :

1. Touches globales (Échap, Tab) ;
2. Atmosphère **toujours** mise à jour (ciel, océan, météo, brouillard) — ambiance même
   en pause/menu ;
3. Si la simulation est active (`playing` et inventaire fermé) : joueur → survie → outils
   → requin → débris → îles → stations → interaction → HUD → autosave ;
4. Rendu (direct ou via post-processing) ;
5. `input.endFrame()` (réinitialise les deltas).

## Modules clés

### `core/`

| Fichier             | Rôle |
| ------------------- | ---- |
| `Game.ts`           | Orchestrateur : scène, sous-systèmes, UI, états (menu/playing/paused/dead), save/load. |
| `EventBus.ts`       | Pub/sub typé (`GameEvents`). |
| `InputManager.ts`   | Clavier/souris, actions logiques **rebindables**, pointer lock. |
| `AudioManager.ts`   | Web Audio : ambiance (vagues/vent), SFX synthétiques, filtre sous-marin, bus de volume. |
| `SaveManager.ts`    | IndexedDB générique : slots, versioning/migration, export/import JSON. |
| `SettingsManager.ts`| Préréglages graphiques concrets + persistance localStorage. |
| `RNG.ts`            | PRNG déterministe seedable (+ `hashSeed`). |

### `rendering/`

- `Renderer.ts` — `WebGLRenderer`, ACES tone mapping, exposition, ombres PCFSoft, gestion
  de la chaîne de post-traitement.
- `Sky.ts` — dôme de ciel (shader), soleil/lune directionnels, hémisphérique, étoiles.
- `PostProcessing.ts` — EffectComposer : RenderPass → UnrealBloom (modéré) → OutputPass →
  SMAA. Le tone mapping est appliqué à l'écran par `OutputPass` (voir note shaders).
- `Materials.ts` / `TextureFactory.ts` — matériaux PBR partagés + textures procédurales
  (canvas 2D : bois, sable, métal, normal maps, particules).

### `world/`

- `ocean/GerstnerWaves.ts` — **cœur du système** : définit les vagues et fournit
  `sampleHeight` / `sampleNormal` (CPU) + `wavesToUniform` (GPU). Source unique de la
  forme de la mer.
- `ocean/OceanShader.ts` — GLSL (vertex Gerstner analytique, fragment fresnel/écume/fog).
- `ocean/OceanManager.ts` — maillage recentré sur la caméra, uniformes, échantillonnage
  de hauteur pour la flottabilité.
- `DayNightCycle.ts`, `WeatherSystem.ts`, `IslandManager.ts`, `FloatingDebrisManager.ts`.

### `raft/`

- `BuildingGrid.ts` — **logique de grille pure** (occupation, adjacence, validation), sans
  rendu → entièrement testée.
- `RaftManager.ts` — pièces (meshes), flottabilité (suit la hauteur d'océan + tilt),
  dégâts/réparation, sérialisation. Délègue la validité à `BuildingGrid`.
- `BuildingSystem.ts` — aperçu holographique, placement, rotation, démolition, réparation.
- `RaftMeshes.ts` — géométrie procédurale de chaque pièce.

### `entities/` + `ai/`

- `ai/StateMachine.ts` — FSM générique (enter/update/exit, onChange).
- `entities/Shark.ts` — perception, pilotage par FSM, steering doux (taux de virage
  borné, profondeur séparée), évitement radeau/îles, dégâts/mort/réapparition.
- `entities/SharkModel.ts` — modèle low-poly original animable (flexion + mâchoire).

### `inventory/`, `crafting/`, `systems/`

Logique pure (inventaire, recettes, recherche) + systèmes de jeu (crochet, pêche, combat,
stations de transformation, interaction E).

### `ui/`

Composants DOM réutilisables et stylés (thème bois/océan) : menu titre, HUD, écran
inventaire/craft/construction/recherche, paramètres (avec rebind), pause, mort, chargement.
Icônes d'objets générées sur canvas (`IconFactory`).

## Note technique : tone mapping & shaders custom

Three force `NoToneMapping` lors d'un rendu vers une render target. Mes shaders custom
(océan, ciel) incluent `<tonemapping_fragment>` + `<colorspace_fragment>` comme les
matériaux intégrés : en rendu direct, le tone mapping ACES s'applique à l'écran ; en
post-processing, il est différé à `OutputPass`. Aucune double application.

## Choix : physique custom plutôt que Rapier

Le cahier des charges autorise « Rapier.js **ou** une autre bibliothèque WebAssembly
fiable ». Pour une survie maritime, une **flottabilité custom** échantillonnant le champ
de Gerstner est plus contrôlable, plus légère (pas de WASM à charger) et garantit que le
radeau/les objets collent à la surface visible. Le contrôleur joueur et l'IA utilisent une
intégration cinématique simple. Compromis assumé et documenté ici.
