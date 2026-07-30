# BRICK CITY HERO

Jeu d'action-aventure **en monde ouvert** a la troisieme personne, fait avec
**Godot 4.3+**. Le joueur incarne **Web Hero**, un jeune heros en briques qui
court, saute, grimpe aux murs, se balance de gratte-ciel en gratte-ciel avec ses
toiles, combat des voyous et affronte **Docteur Mecanix** et ses quatre bras
robotiques.

> **100 % original.** Aucun personnage, nom, logo, modele, texture, musique ou
> son provenant d'une oeuvre existante n'est utilise. Tout est genere par le code
> au lancement : la geometrie, les materiaux, les animations, la musique et les
> bruitages. Le projet ne contient **aucun asset binaire importe**.

---

## Demarrer

```bash
godot --path .                                          # menu principal
godot --path . res://scenes/world/game_world.tscn       # directement en jeu
godot --headless --path . res://tests/smoke_test.tscn   # test automatique
```

Scene principale : `res://scenes/ui/main_menu.tscn` (definie dans `project.godot`).

## Commandes

| Action | Touche |
|---|---|
| Se deplacer | `Z Q S D` / `W A S D` / fleches |
| Courir | `Maj` (aussi : raccourcir la toile en plein vol) |
| Sauter / double saut | `Espace` |
| Lancer / relacher une toile | `Clic droit` |
| Toile-tyrolienne (zip) | `Q` |
| Attaque legere (combo x3) | `Clic gauche` |
| Attaque lourde / de zone | `E` |
| Attaque de toile (colle un ennemi ou un vehicule) | `R` |
| Esquive / contre | `Ctrl` ou `C` |
| Pose de victoire | `V` |
| Journal des missions | `M` |
| Pause / menu | `Echap` |
| Sauvegarde / chargement rapide | `F5` / `F9` |

Les murs : foncez vers un mur en l'air en poussant le stick vers lui. Vitesse
laterale elevee -> **course sur le mur**, sinon **escalade**. `Espace` = saut mural.

---

## Contenu

* **Ville ouverte** de 8 x 8 pates de maisons (~630 m de cote) : centre-ville
  (gratte-ciels a redents jusqu'a 185 m), quartier commercial (enseignes neon),
  residentiel, industriel (entrepots, ruelles), deux parcs, front de mer, baie,
  **pont suspendu** de 60 m, et l'**Usine Mecanix**.
* **Trafic** : voitures, taxis, camionnettes et bus qui circulent, freinent, et
  peuvent etre stoppes a la toile.
* **Missions** : tutoriel, braquage de la Banque Centrale (cinematique, otages,
  3 vagues, fourgon en fuite), et la grande mission du boss en 3 phases.
* **Activites secondaires** generees en continu : agressions, sauvetages, objets
  perdus, poursuites de vehicule, sabotage de machines, defis d'anneaux.
* **4 types d'ennemis** : voleur, voleur rapide (esquive), ennemi lourd (marteau,
  onde de choc), tireur (blaster jouet).
* **Boss** : Docteur Mecanix, 4 bras robotiques a cinematique inverse, points
  faibles aux coudes, reacteur dorsal, 3 phases, cinematique finale.
* **Interface** complete : vie, objectif + distance, compteur d'ennemis, combo,
  reticule de toile, mini-carte, barre de boss, dialogues, messages.
* **Sauvegarde** JSON (`FileAccess`) + reglages (`ConfigFile`) + sauvegarde auto.

---

## Architecture des fichiers

Chaque script commence par un bloc de commentaires qui donne **son role**, **les
nodes attendus dans la scene** et **les parametres reglables dans l'inspecteur**.

### `scripts/systems/` — services globaux (autoloads)

| Fichier | Role |
|---|---|
| `event_bus.gd` (**Events**) | Bus de signaux central : sante, missions, combat, boss, camera... |
| `brick_kit.gd` (**BrickKit**) | Fabrique unique des maillages/materiaux + helpers MultiMesh + couches physiques |
| `game_state.gd` (**GameState**) | Joueur/monde courants, score, pause, reglages |
| `save_manager.gd` (**SaveManager**) | Sauvegarde JSON, reglages, sauvegarde auto |
| `audio_manager.gd` (**AudioManager**) | **Synthese** de tous les sons et des 4 musiques a l'execution |
| `object_pool.gd` (**ObjectPool**) | Recyclage generique (ennemis, projectiles, debris, FX) |
| `scene_transition.gd` (**Transition**) | Fondus, changement de scene, bandes cinema |
| `graphics_env.gd` | Construit l'`Environment` : ciel procedural, glow, SSAO, SSR, SDFGI, brouillard volumetrique, tonemapping ACES |
| `day_night_cycle.gd` | Course du soleil, couleurs du ciel, allumage des lampadaires |
| `world_streamer.gd` | Niveau de detail par distance + gel des ennemis lointains |
| `world.gd` | Sequence de demarrage de la partie (generation, heros, missions, sauvegarde) |

### `scripts/player/`

| Fichier | Role |
|---|---|
| `player.gd` | Coordinateur : machine a etats de deplacement, degats, respawn |
| `player_rig.gd` | Construit le heros en briques (design original, combinaison rouge/bleue) |
| `player_animator.gd` | Ecrit **22 animations en code** + `AnimationTree` (machine a etats, transitions croisees) + surcouche procedurale (visee du bras, inclinaison, regard) |
| `third_person_camera.gd` | Camera 3e personne : `SpringArm3D`, FOV lie a la vitesse, roulis, secousses, mode cinematique |
| `web_system.gd` | **Coeur du jeu** : recherche d'ancrage (+ cone d'assistance), pendule, tension, zip, indicateur 3D, fils cosmetiques |
| `player_combat.gd` | Combos, attaques lourdes/aeriennes, attaques de toile, fenetre de contre, hit-stop |
| `speed_fx.gd` | Lignes de vitesse plein ecran + particules de vent |

### `scripts/city/`

| Fichier | Role |
|---|---|
| `city_layout.gd` | Verite unique sur la grille : blocs, rues, carrefours, quartiers |
| `building_builder.gd` | 7 styles de batiments -> donnees de briques (aucun node) |
| `city_props.gd` | Mobilier urbain et toits : lampadaires, feux, bancs, chateaux d'eau, antennes, arbres... |
| `city_block.gd` | Un pate de maisons : 4 MultiMesh, 1 corps de collision, lumieres, LOD |
| `landmarks.gd` | Banque Centrale et Usine Mecanix (arene du boss) |
| `city_generator.gd` | Assemble tout : sol, baie, pont, blocs, navigation, occluders, trafic |
| `navmesh_builder.gd` | `NavigationMesh` construit a partir de la grille de rues |
| `traffic_system.gd` / `vehicle.gd` | Flotte recyclee + vehicules en briques |

### `scripts/enemies/`

`enemy_base.gd` (IA patrouille -> detection -> poursuite -> attaque -> recul ->
retour), `enemy_rig.gd`, `thug.gd`, `runner.gd`, `brute.gd`, `gunner.gd`,
`enemy_projectile.gd`, `health_bar_3d.gd`, `enemy_factory.gd`, `enemy_squad.gd`.

### `scripts/missions/`

`mission.gd` + `mission_objective.gd` (donnees), `mission_manager.gd` (autoload),
`mission_director.gd` (mise en scene), `mission_tutorial.gd`,
`mission_bank_heist.gd`, `mission_boss.gd`, `side_activities.gd`,
`swing_challenge.gd`, `world_marker.gd`, `civilian.gd`.

### `scripts/bosses/`

`mechanix.gd` (3 phases, deplacement, ondes de choc, reacteur),
`robotic_arm.gd` (cinematique inverse a 2 os, slam / balayage / saisie / lancer),
`weak_point.gd`, `debris_chunk.gd`.

### `scripts/ui/`

`hud.gd`, `minimap.gd` (dessinee avec `_draw`), `main_menu.gd`, `pause_menu.gd`,
`settings_panel.gd`.

### `assets/shaders/`

| Shader | Role |
|---|---|
| `brick.gdshader` | Tenons procedurax, faux chanfreins, variation de couleur par instance, plastique brillant, emission |
| `sky.gdshader` | Ciel degrade + soleil + nuages fbm animes + nuit etoilee |
| `web.gdshader` | Fil de toile tresse, progression du tir, lueur sous tension |
| `speed_lines.gdshader` | Stries radiales additives a haute vitesse |

### `scenes/`

`player/player.tscn`, `world/game_world.tscn`, `ui/{main_menu,hud,pause_menu}.tscn`,
`enemies/*.tscn`, `bosses/mechanix.tscn`, `effects/*.tscn`.
Les scenes restent volontairement minimales : la geometrie est construite par le
code, donc rien n'est fige dans un fichier binaire.

---

## Couches physiques

| # | Nom | Valeur |
|---|---|---|
| 1 | world | 1 |
| 2 | player | 2 |
| 3 | enemy | 4 |
| 4 | web_anchor | 8 |
| 5 | hitbox | 16 |
| 6 | hurtbox | 32 |
| 7 | prop | 64 |
| 8 | vehicle | 128 |
| 9 | trigger | 256 |
| 10 | boss | 512 |

---

## Performance

* Un pate de maisons = **4 MultiMesh** (structure / details / vitres / enseignes)
  et **un seul** `StaticBody3D`. La ville entiere : ~28 000 briques pour ~250
  instances de rendu.
* `visibility_range_end` sur les details et les vitres (LOD materiel, gratuit).
* `custom_aabb` calcule a l'upload : sans lui, des blocs entiers disparaissent
  des que leur centre sort du champ de la camera.
* Occluders boites places **a l'interieur** des plus grosses tours.
* `WorldStreamer` : 3 niveaux de detail par distance, ennemis lointains geles.
* `ObjectPool` pour ennemis, projectiles, debris et effets d'impact.
* Lampadaires : lumieres sans ombres, `distance_fade`, allumees la nuit seulement.
* Le pas de temps de la camera est plafonne (`MAX_STEP`) : un ralentissement ne
  peut plus faire diverger ses ressorts.
* Les calculs lourds sont dans `_physics_process` ; `_process` ne fait que du
  visuel (animation, HUD, effets).

## Tests

`tests/smoke_test.tscn` demarre la vraie scene de jeu et verifie 45 points :
generation de la ville, deplacements, saut, animations, accroche et physique de
toile, zip, combat, IA, missions, boss (3 phases), sauvegarde/chargement, audio,
pooling. Le processus sort avec le code `0` si tout passe.

```
=== RESULT: 45 checks, 0 failure(s) ===
```

Captures via Xvfb : `tests/screenshot.tscn` (menu, ville, rue),
`tests/character_shot.tscn` (les figurines de face / de trois quarts / de dos),
`tests/swing_shot.tscn` (course et balancement en jeu). `tests/probe.tscn` et
`tests/diagnose.tscn` affichent l'etat interne (camera, blocs, AABB) pour le
debogage.

## Conventions a respecter

* **Orientation** : tout ce qui est construit par le code regarde vers **-Z**,
  la direction "avant" de Godot. Un rig monte vers +Z court a reculons et inverse
  tout son cycle de marche.
* **Rotations d'animation** : sur un rig oriente -Z, une rotation X **positive**
  envoie un membre vers l'avant.
* **Mise a l'echelle d'une Basis** : `Basis.scaled()` met a l'echelle les
  *lignes* (les axes du monde). Pour mettre a l'echelle les axes propres d'un
  objet tourne, multiplier les colonnes :
  `Basis(b.x * s.x, b.y * s.y, b.z * s.z)`.
* **SpringArm3D** place ses enfants **directs** chaque frame : tout decalage
  (secousse, recul) doit vivre un niveau plus bas.

## Reglages

Tout ce qui definit le "feeling" est expose dans l'inspecteur (groupes `@export`)
ou en constantes en haut des fichiers : vitesses et hauteurs de saut
(`player.gd`), portee et tension des toiles (`web_system.gd`), cadrage et FOV
(`third_person_camera.gd`), degats et fenetres de combo (`player_combat.gd`),
taille de la ville (`city_layout.gd`), qualite graphique (`graphics_env.gd`),
rythme du boss (`mechanix.gd`).
