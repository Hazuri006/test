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
>
> Les modèles Dragon Ball qui circulent sur Sketchfab ou DeviantArt sont presque
> toujours des extractions des jeux officiels, rediffusées sans licence : les
> intégrer ici serait de la contrefaçon. Si tu veux remplacer les modèles
> procéduraux, voir **Modèles externes** plus bas.

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
| **Clic gauche** ou `J` | Attaque enchaînée — martelez pour le combo 5 coups |
| **Clic droit** ou `L` | Boule de ki |
| **Clic molette** ou `K` | Coup lourd (`↑` = uppercut lanceur, `↓` = écrasement au sol) |
| **`M`** | **Caméra à la souris** — capture le pointeur et masque le curseur |
| `Espace` | Garde |
| `Maj` *pendant un dégât* | Téléportation — contre (coûte du ki) |
| `C` | Charge de ki |
| `C` + `Espace` | **SPARKING !** — transformation (ki plein) |
| `U` | Blast 1 — compétence signature |
| `I` | Blast 2 — super |
| `O` | **ULTIME** (uniquement en Sparking) |
| `Échap` | Pause / relâche le pointeur |

### Caméra à la souris

`M` capture le pointeur (le curseur disparaît) et la souris fait **orbiter la
caméra** autour de ton personnage : horizontalement pour tourner, verticalement
pour prendre de la hauteur ou plonger. Le verrouillage sur l'adversaire reste
actif, donc les deux combattants restent cadrés — tu changes l'angle, pas la
cible. Un bandeau en bas de l'écran rappelle que le mode est actif.

`M` à nouveau (ou `Échap`) relâche le pointeur, et la caméra revient en douceur
à son cadrage par défaut. Le curseur est masqué pendant tout le combat, même
sans capture du pointeur.

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

**3 modes** : Combat Simple (contre le CPU), Versus Local (écran partagé),
Survie (adversaires en vagues).

**5 niveaux de difficulté**, réglables sur l'écran de sélection d'arène :

| Niveau | Comportement |
| --- | --- |
| **TRÈS FACILE** | Hésite très souvent, ne contre jamais, dégâts × 0,45 |
| **FACILE** | Adversaire prudent, frappe peu, dégâts × 0,7 |
| **NORMAL** | Combat équilibré, dégâts × 1 |
| **DIFFICILE** | Enchaîne, garde et contre, dégâts × 1,15 |
| **LÉGENDE** | Sans pitié, contres au réflexe, dégâts × 1,35 |

Au-delà des poids de comportement (réactivité, agressivité, garde, fréquence des
contres et des supers), chaque niveau applique un handicap sur les **dégâts** et
la **génération de ki** du CPU, et une probabilité d'**hésitation** — c'est ce
qui rend le bas de l'échelle réellement abordable et pas seulement plus lent.

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
- **Terrain** : l'arène reste parfaitement plate (le gameplay en dépend) mais un
  tablier extérieur se soulève avec la distance, plus deux anneaux de crêtes
  lointaines qui donnent la perspective aérienne à travers le brouillard. Une
  teinte à grande échelle en couleurs de sommets casse la répétition de la
  texture, et les rochers sont des blocs stratifiés inclinés plutôt que des
  patates déformées
- **Ciels procéduraux** : dégradé, soleil, bancs de nuages animés, étoiles, nébuleuse
- **Auras de ki** : le maillage est un anneau de **pétales séparés**, pas un cône.
  Chaque pétale porte son index en attribut et le vertex shader lui donne sa
  propre hauteur de léchage et son propre balancement, si bien que la silhouette
  ne se répète jamais. Le fragment shader l'effile en pointe et coupe l'alpha
  net, pour des langues de flamme cel-shadées comme dans l'anime — et non un
  nuage de bruit. Trois couches : cœur pâle en faces arrière collé au corps,
  flamme principale en double face, et évasement court aux pieds. À pleine
  puissance la flamme cesse de lécher et monte en colonne, avec des éclairs
  qui claquent autour du corps.
- **VFX** : impacts étoilés, anneaux de choc, explosions, débris, poussière,
  images rémanentes, traînées de coups, colonnes de transformation
- **Personnages** procéduraux : squelette d'`Object3D`, membres en profils
  tournés (fuselés du haut vers le bas, pas des saucisses uniformes), boules
  d'articulation aux coudes et aux genoux pour qu'aucun trou n'apparaisse à la
  flexion, poings fermés avec pouce, col et nœud de ceinture du gi,
  7 coiffures, 5 tenues, capes et queues animées
- **Expressions faciales** : trois visages dessinés sur canvas par personnage
  (neutre, cri, douleur), échangés dans le matériau de la tête selon l'état —
  bouche ouverte à l'effort, yeux serrés quand il encaisse

## Audio

100 % synthétisé via Web Audio :

- **impacts en trois couches** — transitoire clair de 20 ms (l'oreille sait
  exactement quand le coup touche), corps en sinus balayé (le poids), queue de
  bruit médium envoyée dans la réverb (la pièce) — avec une variation aléatoire
  pour qu'un combo de 5 coups ne mitraille pas le même son
- coups lourds avec chute de sub, gardes métalliques à partiels désaccordés,
  swishs à balayage doppler, tirs de ki résonants descendants, explosions
  (crack, roulement, sub, gravats), choc de rayons, montée en puissance
- réverbération à réponse impulsionnelle générée au lancement
- boucles de charge et de rayon
- **cris de combat** par synthèse à formants
- **bande-son procédurale** : séquenceur en doubles-croches, une ambiance par
  arène (tempo, gamme, instrumentation), intensité pilotée par l'état du combat

## Modèles externes

Les combattants sont générés par le code, sans aucun fichier de modèle. Si tu
veux des personnages plus détaillés, il faut des assets dont l'usage est
**réellement autorisé**. Sources propres :

| Source | Contenu | Licence |
| --- | --- | --- |
| [Mixamo](https://mixamo.com) (Adobe) | Personnages riggés + des milliers d'animations | Gratuit, usage commercial autorisé, compte Adobe requis |
| [Quaternius](https://quaternius.com) | Packs de personnages low-poly riggés | CC0 (domaine public) |
| [Kenney](https://kenney.nl) | Packs de personnages et props | CC0 |
| [Poly Pizza](https://poly.pizza) | Modèles divers, licence indiquée par asset | CC0 / CC-BY selon l'asset |

Sur Sketchfab, filtre sur *Downloadable* + licence **CC0 / CC-BY** et vérifie
que l'auteur est bien le créateur du modèle. Sur DeviantArt, la quasi-totalité
des modèles de jeux sont des rips : à éviter.

Le chargement d'un modèle riggé externe n'est pas encore branché — ça demande un
`GLTFLoader`, un `AnimationMixer` et une table de correspondance entre les états
de combat (`idle`, `rush1`…`rush5`, `smash`, `guard`, `hitLight`, `blowAway`,
`charge`, `beam`…) et les clips du fichier. Dépose un `.glb` que tu as le droit
d'utiliser dans `public/models/` et cette table pourra être écrite pour lui : les
noms des clips dépendent du fichier, donc il faut l'avoir sous la main.

## Tests

```bash
npm run build
npm run preview          # dans un terminal
npm run smoke            # dans un autre
```

Le test lance le jeu dans Chromium, démarre un combat et vérifie le
corps-à-corps, la charge de ki, la transformation, les rayons, l'ultime, les
projectiles, le contre, les **commandes souris** (clic gauche/droit, capture du
pointeur avec `M`, orbite de la caméra), les **handicaps de difficulté** et
l'écran partagé — en capturant une image à chaque étape dans `tests/shots/`.
Variables : `URL`, `OUT`, `STAGE`, `CHROME`.

Note : le jeu borne le pas de temps pour éviter que la physique ne traverse les
collisions. Sur une machine incapable de tenir la cadence (rendu logiciel par
exemple), le temps de jeu avance donc plus lentement que le temps réel — c'est
pourquoi le test ne vérifie jamais un débit par seconde.

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
