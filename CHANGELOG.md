# Changelog — DRIFTWAKE

Le format suit l'esprit de [Keep a Changelog](https://keepachangelog.com/fr/).

## [0.1.0] — Vertical slice jouable

Première version jouable, couvrant les phases 1 (fondation technique) et 2 (vertical
slice), avec de nombreux éléments des phases 3–6.

### Ajouté

**Moteur & technique**

- Projet Vite + TypeScript **strict** + Three.js 0.171, ESLint 9 (flat config) + Prettier.
- Boucle de jeu à `dt` borné, `EventBus` typé, `InputManager` rebindable, `SettingsManager`
  avec 4 préréglages graphiques réels, `AudioManager` (Web Audio synthétique), `SaveManager`
  IndexedDB (slots, migration, export/import), `RNG` déterministe.

**Rendu & monde**

- Océan Gerstner (GPU) avec écume, fresnel, réflexion de ciel, normal maps, brouillard ; la
  même formule pilote la flottabilité CPU.
- Ciel procédural (dôme shader), soleil/lune, étoiles, cycle jour/nuit.
- Système météo (clair/nuageux/pluie/tempête) : pluie en particules, vent, éclairs, mer
  agitée, brouillard variable.
- Post-traitement optionnel : bloom modéré + SMAA, tone mapping ACES.
- Îles procédurales déterministes (plage, palmiers/rochers récoltables, buissons instanciés,
  coffre à butin), avec collision de sol et culling de distance.
- Débris flottants poolés (planches, bouteilles, tonneaux, fibre, ferraille, noix de coco,
  argile) flottant sur les vagues.

**Gameplay**

- Contrôleur FPS : marche, sprint, saut, accroupissement, **nage/plongée**, escalade sur le
  radeau, head-bob.
- Survie : santé, faim, soif, endurance, oxygène, température ; pénalités, mort, réapparition.
- Crochet de récupération (charge, lancer balistique, corde, rembobinage, durabilité).
- Inventaire en grille (empilement, glisser-déposer, division, infobulles, hotbar, tri,
  durabilité) + écran de fabrication / construction / **recherche**.
- Radeau modulaire sur grille : fondations, murs, piliers, plancher, coffre, grill,
  purificateur, jardinière, filet, table de recherche ; aperçu holographique, rotation,
  démolition, réparation, flottabilité.
- Requin réaliste piloté par FSM (Patrol → CircleRaft → Chase → Bite/AttackRaft → Flee →
  Stunned → Dead), attaque télégraphiée, dégâts au radeau, mort & réapparition.
- Pêche (mini-jeu de morsure), cuisine (grill : cru → grillé → brûlé), purification d'eau,
  agriculture (jardinières), combat à la lance/hache, interactions contextuelles (E).
- Interface complète : menu titre, nouvelle partie / continuer / charger, paramètres (avec
  reconfiguration des touches), HUD, pause, écran de mort, notifications, écran de chargement.
- Sauvegarde/chargement complets (joueur, stats, inventaire, recettes, radeau, îles, requin,
  heure, météo, stations) — rechargement à l'identique.

### Qualité

- **39 tests unitaires** Vitest (inventaire, recettes, survie, grille de construction,
  transitions du requin, déterminisme du seed, machine à états) — tous au vert.
- `tsc --noEmit`, ESLint (0 warning) et `vite build` au vert.
- Test de fumée navigateur headless (Playwright + Chromium/SwiftShader) : démarrage sans
  erreur console, WebGL actif, HUD et entrées fonctionnels, captures d'écran.

### Notes

- Le radeau est ancré (bob + tilt) ; la navigation active (voile/moteur) est prévue.
- Modèles 3D = placeholders procéduraux propres (voir `ASSETS.md` pour le remplacement).
- Audio synthétique temporaire ; musique libre de droits à intégrer.
