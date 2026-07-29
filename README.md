# SPARKING ARENA — Ultimate Budokai

Un jeu de combat 3D d'arène façon *Budokai Tenkaichi / Sparking! Zero* : caméra
verrouillée par-dessus l'épaule, vol libre, chaînes de corps-à-corps, vagues de
ki, contres par téléportation, transformations et duels de rayons.

Tourne dans le navigateur, en WebGL. **Zéro asset externe** : personnages,
décors, textures, effets et musique sont tous générés par le code au lancement.

> **À propos de la licence** — le jeu reproduit le *gameplay*, la mise en scène et
> le langage visuel du genre (cel-shading, auras, kamehamehas, HUD, caméra), mais
> avec un roster et des décors **originaux**. Aucun personnage, nom, musique ou
> asset appartenant à Bandai Namco / Toei / Bird Studio n'est utilisé.

## Lancer le jeu

```bash
npm install
npm run dev        # serveur de développement -> http://localhost:5173
```

Pour une version optimisée :

```bash
npm run build
npm run preview    # -> http://localhost:4173
```

## Commandes

| Touche | Action |
| --- | --- |
| `W A S D` | Déplacement (verrouillé sur l'adversaire) |
| `E` / `Q` | Monter / descendre — vol libre |
| `Maj` | Boost — *Dragon Dash* |
| `J` | Attaque enchaînée — martelez pour le combo 5 coups |
| `K` | Coup lourd (`↑` = uppercut lanceur, `↓` = écrasement au sol) |
| `L` | Boule de ki |
| `Espace` | Garde |
| `Maj` *pendant un dégât* | Téléportation — contre (coûte du ki) |
| `C` | Charge de ki |
| `C` + `Espace` | **SPARKING !** — transformation (ki plein) |
| `U` | Blast 1 — compétence signature |
| `I` | Blast 2 — super |
| `O` | **ULTIME** (uniquement en Sparking) |
| `Échap` | Pause |

**Joueur 2** (écran partagé) : flèches directionnelles + pavé numérique
`1`/`2`/`3` (rush / lourd / ki), `4`/`5`/`6` (blasts), `0` (garde), `.` (boost),
`+` (charge), `7`/`9` (descendre / monter).

**Manettes** : deux manettes sont détectées automatiquement (disposition
PlayStation : rond = rush, carré = ki, triangle = garde, croix = vol,
R1 = boost, R2 = lourd, L1 = charge, L2 = super).

## Contenu

**10 combattants**, chacun avec ses statistiques, sa silhouette, son aura, ses
trois attaques nommées et son éveil :

| Combattant | Archétype | Éveil |
| --- | --- | --- |
| **Kaidō** | Polyvalent, poings rapides | Éclat Doré |
| **Vaeron** | Prince orgueilleux, gros dégâts | Orgueil Absolu |
| **Torrin** | Sage résistant, régénération | Éveil Ancestral |
| **Zaira** | Vitesse extrême, rush super | Mode Prédateur |
| **Gordran** | Colosse, super armure | Colère Titanesque |
| **Cyrix** | Cyborg, drain de ki | Surcharge Noyau |
| **Malphas** | Empereur, cape, comètes | Forme Ultime |
| **Nyx** | Mystique, pluie d'énergie | Éclosion |
| **Kel'ver** | Bio-monstre, absorption | Forme Parfaite |
| **Sable** | Miroir sombre, glass cannon | Pleine Éclipse |

**6 arènes** : Terres Brisées (crépuscule), Cité en Ruines (nuit néon),
Sanctuaire Céleste (îles flottantes), Arène du Tournoi (foule, gradins),
Cratère Ardent (lave, braises), Faille Temporelle (nébuleuse, barrière).

**3 modes** : Combat Simple (contre le CPU, 4 niveaux de difficulté),
Versus Local (écran partagé), Survie (adversaires en vagues).

## Systèmes de combat

- **Chaîne de rush** en 5 coups avec fenêtre d'enchaînement, dernier coup projetant
- **Coups lourds** : lanceur vers le haut, écrasement vers le bas, projection
- **Dash d'approche** automatique quand la cible est loin
- **Garde** (réduction des dégâts, chip damage, gain de ki)
- **Contre par téléportation** : `Maj` au moment d'être touché, réapparition dans le dos
- **Économie de ki** : charge, coût des boosts, régénération passive, jauge de compétence
- **Sparking !** : transformation temporaire (aura, cheveux, palette, statistiques)
- **Blast 1 / Blast 2 / Ultime** : rayons, sphères, rushs, pluies d'énergie
- **Duel de rayons** : deux rayons frontaux déclenchent un choc où il faut marteler
- **Hitstop**, ralentis, tremblements de caméra, cinématiques d'ultime

## Rendu

Tout est écrit à la main, sans bibliothèque de post-traitement :

- **Cel shader** maison : rampe 3 tons à bords nets, ombres décalées vers le froid,
  spéculaire dur, rim light, teinte d'énergie, visage peint dans le matériau
- **Contours** par coque inversée, épaisseur constante à l'écran
- **Pipeline HDR** custom : bright pass, bloom gaussien 3 niveaux, flou radial
  (lignes de vitesse), distorsion d'onde de choc, aberration chromatique,
  tone mapping filmique, étalonnage, vignette, grain — compatible écran partagé
- **Ciels procéduraux** : dégradé, soleil, bancs de nuages animés, étoiles, nébuleuse
- **Auras** : shader de flamme bruitée, rendue en faces arrière pour envelopper
  la silhouette sans laver le personnage
- **VFX** : impacts étoilés, anneaux de choc, explosions, débris, poussière,
  images rémanentes, traînées de coups, colonnes de transformation
- **Personnages** procéduraux : squelette d'`Object3D`, corps en primitives,
  visages dessinés sur canvas, 7 coiffures, 5 tenues, capes et queues animées

## Audio

100 % synthétisé via Web Audio :

- impacts (bruit filtré + thump), gardes, swishs, tirs de ki, explosions avec
  réverbération à réponse impulsionnelle générée
- boucles de charge et de rayon
- **cris de combat** par synthèse à formants
- **bande-son procédurale** : séquenceur en doubles-croches, une ambiance par
  arène (tempo, gamme, instrumentation), intensité pilotée par l'état du combat

## Tests

```bash
npm run build
npm run preview          # dans un terminal
npm run smoke            # dans un autre
```

Le test lance le jeu dans Chromium, démarre un combat et vérifie le
corps-à-corps, la charge de ki, la transformation, les rayons, l'ultime, les
projectiles, le contre et l'écran partagé, en capturant une image à chaque étape
dans `tests/shots/`. Variables : `URL`, `OUT`, `STAGE`, `CHROME`.

## Structure

```
src/
  core/       utilitaires mathématiques, entrées clavier/manette
  graphics/   cel shader, contours, matériaux d'énergie, ciel, textures, post-FX
  vfx/        particules, effets, rayons, images rémanentes, traînées
  characters/ rig procédural, poses, animateur, roster
  stages/     les six arènes
  game/       combattant, IA, caméra, projectiles, orchestration du match
  ui/         HUD, menus, feuille de style
  main.js     boucle de jeu, écrans, rendu
```
