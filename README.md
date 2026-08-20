# Abyssal — survival sous-marin sous Godot 4

Un jeu de survie sous-marine inspire de Subnautica, entierement jouable :
ocean rendu physiquement, ciel a diffusion atmospherique reelle, capsule de
survie flottante avec fabricateur, recolte de mineraux sur le fond, artisanat,
oxygene, faim, soif, et un joueur au corps anime en temps reel.

**Moteur : Godot 4.3+ (rendu Forward+ obligatoire).**
Ouvrez le dossier dans Godot puis lancez la scene `scenes/main.tscn` (F5).

---

## Commandes

| Touche | Action |
|---|---|
| `Z Q S D` / `W A S D` | Nager / marcher (relatif au regard) |
| `Espace` | Monter · sauter · grimper a l'echelle |
| `Ctrl` | Descendre |
| `Maj` | Sprint (consomme plus d'oxygene) |
| `Souris` | Regarder |
| `E` | Interagir (recolter, fabricateur, casier, trousse) |
| `Clic gauche` | Utiliser l'outil en main |
| `Molette` / `1`-`5` | Changer d'outil |
| `Tab` | Inventaire et equipement |
| `F` | Lampe torche |
| `Echap` | Pause et reglages |
| `F7` | Cycler le profil de qualite a chaud |

---

## Ce qui est simule

### L'eau

Le rendu de l'ocean ne repose sur aucune texture d'eau. Tout est calcule :

- **Houle de Gerstner** — six trains de vagues croises, chacun avec sa longueur
  d'onde. La vitesse de chaque train suit la vraie relation de dispersion des
  vagues de gravite en eau profonde, `c = sqrt(g/k)` : les grandes vagues vont
  donc plus vite que les petites, exactement comme en mer. Les normales sont
  les derivees analytiques exactes de la deformation, pas une approximation.
- **La meme houle est recalculee sur le CPU** (`scripts/world/ocean.gd`), a
  l'identique, avec une inversion par point fixe du deplacement horizontal.
  C'est elle qui fait flotter la capsule, decide si votre tete est immergee et
  berce le joueur pres de la surface. Le GPU et le CPU partagent une horloge
  commune (`wave_time`), donc les deux ne derivent jamais.
- **Absorption de Beer-Lambert par canal** — le rouge s'eteint en 4 m, le vert
  en 25 m, le bleu porte au-dela de 60 m. Ce n'est pas un simple brouillard
  bleu : c'est la vraie extinction spectrale de l'eau, appliquee sur la
  longueur du trajet reellement parcouru dans l'eau (intersection analytique du
  rayon avec le demi-espace immerge).
- **Refraction en espace ecran** avec correction de contact, pour ne jamais
  aspirer un objet situe devant la surface.
- **Ecume** pilotee par le repliement de la surface (le jacobien de la
  deformation de Gerstner) et par l'epaisseur d'eau au contact du sol.
- **Diffusion sous-surfacique** : les cretes s'allument a contre-jour.
- **Fenetre de Snell** — vu de dessous, le monde exterieur est comprime dans un
  cone de 48,6°, avec aberration chromatique sur son bord ; au-dela, reflexion
  totale interne.

### Le ciel

`shaders/sky.gdshader` integre numeriquement la diffusion atmospherique
(modele de Nishita) : Rayleigh, Mie, et absorption par l'ozone dans la bande de
Chappuis. Les couleurs du lever, du zenith et du crepuscule ne sont donc pas
peintes a la main, elles tombent du calcul. S'y ajoutent une couche de cumulus
ray-marches (bruit fbm, diffusion Henyey-Greenstein double lobe, approximation
de multi-diffusion), un voile de cirrus, un disque solaire avec assombrissement
centre-bord, les etoiles et la lune.

### Le masque de plongee

La vue est entierement a la premiere personne, encadree par la monture du
masque : ouverture en superellipse, bosse du nez, verre qui s'assombrit et se
teinte sur les bords parce qu'on le regarde de biais, frange chromatique le
long de la vitre, lisere lumineux sur l'arete interieure et reflet diffus. La
monture apparait au moment ou la tete passe sous l'eau. L'affichage de survie
est recule dans l'ouverture pour ne jamais passer derriere elle.

### La couleur de l'eau

Une seule rampe (`scripts/world/water_palette.gd`) alimente la surface, le
brouillard, la lumiere ambiante et le post-traitement. Sans ce point unique,
l'eau changerait de teinte selon qu'on la regarde de dessus, de dessous ou en
reflet.

| Profondeur | Teinte |
|---|---|
| 0 m | turquoise de lagon |
| 13 m | cyan |
| 40 m | bleu franc |
| 95 m | bleu nuit |
| 230 m | noir bleute |

Ce sont des **luminances diffusees**, pas des couleurs d'affichage : elles
s'ajoutent a ce que renvoie le fond. La diffusion est evaluee a la profondeur
moyenne du trajet reellement parcouru dans l'eau, pas a celle de la camera :
un recif clair reste donc turquoise meme observe depuis plus bas, et l'eau se
fonce vraiment quand on descend.

### Le recif

Huit especes, toutes issues de deux primitives seulement — une sphere deformee
par du bruit et un tube balaye le long d'une courbe : dalles rocheuses a
sommet plat, massifs coralliens, blocs erodes, coraux en eventail et en table,
coraux tubulaires ramifies et tapis d'anemones. Le shader de corail melange
deux teintes par plaques de colonisation, creuse les pores, laisse la lumiere
traverser la chair et allume les extremites.

Leur repartition est deterministe, comme celle des gisements : la composition
de chaque cellule se deduit de ses coordonnees. Le decor est donc infini,
identique d'une session a l'autre, et rien n'est stocke.

### Sous l'eau

Un quad plein ecran (`shaders/underwater_post.gdshader`) reconstruit la
position monde depuis le tampon de profondeur puis applique : absorption et
diffusion, flou croissant avec la distance (turbidite), caustiques projetees en
espace monde avec dispersion chromatique (cellules de Worley animees), rayons
crepusculaires en flou radial vers le soleil, ondulation de l'image, aberration
chromatique et vignettage.

La **ligne de flottaison** est traitee a part : quand la tete traverse la
surface, la frontiere entre air et eau est l'horizon du plan d'eau, ondule par
une houle propre, avec un bourrelet lumineux — la vue mi-immergee du jeu
d'origine.

### Le joueur

Le corps est **genere par le code** : squelette de 19 os, maillage de peau
construit os par os avec des poids qui fondent aux articulations, puis anime
par des oscillateurs plutot que par des clips.

Concretement, il n'y a aucune animation enregistree : la frequence du battement
de palmes suit la vitesse reelle, l'onde se propage de la hanche au pied avec
un dephasage, les bras se plaquent le long du corps en croisiere et passent au
crawl en sprint, le buste accompagne le regard (20 % colonne, 30 % torse, 50 %
cou). Il n'existe donc ni transition brusque, ni glissement de pied, ni pose
figee, et le mouvement reste fluide a n'importe quelle vitesse.

> **A propos du modele.** Aucun modele de Subnautica n'a ete telecharge : les
> ressources du jeu original sont protegees et leur reutilisation serait une
> contrefacon. Le corps, la capsule, les rochers, les algues et les poissons
> sont donc tous construits par programme. Avantage collateral : le depot ne
> contient aucun fichier binaire, tout reste modifiable dans le code.

### Le monde

- Fond marin procedural streame par chunks, generes dans des threads, avec
  quatre niveaux de detail et collisions sur les chunks proches.
- Cinq biomes en anneaux autour d'un cratere : bas-fonds, foret d'algues,
  plateau herbeux, grand recif, fosse abyssale — plus un ilot rocheux emerge a
  environ 640 m, qui sert de repere a l'horizon.
- Gisements repartis de facon deterministe : la position de chaque affleurement
  se deduit des coordonnees de sa cellule. Le monde est donc infini et stable
  d'une session a l'autre sans rien stocker.
- Forets d'algues geantes en MultiMesh, ondulant dans le shader.
- Bancs de poissons en boids (separation, alignement, cohesion) qui evitent le
  fond et la surface.
- Cycle jour/nuit complet (20 min par defaut) et etat de la mer qui respire sur
  plusieurs minutes : la houle, l'ecume et le bercement de la capsule varient.

### La capsule de survie

Coque batie par revolution, avec bandeau vitre a hauteur d'yeux et ecoutille au
sommet. Elle **flotte reellement** : quatre sondes echantillonnent la houle a
chaque pas physique, un ressort amorti en deduit sa hauteur et son assiette.
Le joueur qui marche a l'interieur est porte par elle.

A l'interieur : le fabricateur (hors service au reveil), un casier ou l'on
range et reprend ses objets, un distributeur de trousses de secours, une
echelle jusqu'a l'ecoutille, l'eclairage et le feu de detresse.

### Le son

Aucun fichier audio : les 14 sons sont synthetises au demarrage
(`autoload/sound_bank.gd`) — bruit filtre pour les ambiances, modulation lente
pour le ressac, sinus a frequence glissante pour les bulles et les bips.

---

## Boucle de jeu

Vous vous reveillez dans la capsule, l'impact a rompu l'alimentation du
fabricateur — il crache des etincelles et refuse de demarrer. L'outil de
reparation est reste dans le casier : ouvrez-le (`E`), prenez l'outil, visez le
fabricateur et faites un clic gauche. Le circuit se ressoude, la partie
commence vraiment.

L'oxygene est limite (45 s au depart) : chaque plongee est un aller-retour. Sur le fond, les affleurements calcaires
donnent du **titane** et du **cuivre**, le quartz donne du **verre**, les
lianes des forets d'algues donnent de la **fibre** et du **silicone**.

Le fabricateur transforme tout cela en equipement : **palmes** (+40 % de
vitesse), **bouteille d'oxygene** (+30 s, puis +75 s), **recycleur d'air** (plus
de surconsommation en profondeur), **combinaison renforcee**, **lampe torche**,
**couteau**, **scanner**. Chaque palier d'equipement ouvre un anneau de
profondeur supplementaire — jusqu'a la fosse, ou le froid commence a mordre.

Il faut aussi boire et manger : le sel et le corail donnent de la javel, la
javel donne de l'eau potable ; les poissons se cuisent ou se salent.

---

## Reglages et performances

Trois profils (`Echap` → *Qualite graphique*, ou `F7`) qui pilotent la
resolution de l'ocean, le nombre de pas du ray-marching des nuages, la distance
d'affichage, le brouillard volumetrique, SSAO/SSR/TAA et la densite de vie.

| Profil | Pour |
|---|---|
| **Performance** | GPU d'entree de gamme / portable |
| **Equilibre** (defaut) | GPU milieu de gamme recent |
| **Ultra** | Cartes hautes performances |

Le ciel est la passe la plus couteuse : si le nombre d'images par seconde
plafonne, baissez le profil, c'est lui qui chute en premier.

---

## Structure

```
project.godot            # Forward+, actions d'entree, qualite par defaut
scenes/main.tscn         # scene de lancement (tout le reste est instancie par code)
scripts/
  main.gd                # assemblage du monde, de la capsule, du joueur, de l'UI
  world/                 # ocean, terrain, biomes, flore, ambiance, geometrie
  player/                # controleur, statistiques, corps procedural, animation
  lifepod/               # capsule, fabricateur, casier
  items/                 # objets, gisements, interactions
  systems/               # inventaire, recettes
  ui/                    # HUD, inventaire, fabricateur, pause
  creatures/             # bancs de poissons
shaders/                 # ocean, ciel, post-traitement sous-marin, terrain, ...
autoload/                # reglages, base d'objets, etat global, banque sonore
tests/                   # test de fumee et capture d'images
```

## Tests

```bash
godot --headless --path . res://tests/smoke_test.tscn   # code de sortie 0 = OK
```

Le test verifie la coherence de la houle CPU, le profil du relief, la
generation des chunks, la solidite du fond sous le joueur, la repartition des
gisements, l'integrite de toutes les recettes, le craft de bout en bout, le
squelette et les poids de peau du joueur, la banque sonore et le chargement de
tous les shaders.

Il controle aussi le **sens d'enroulement** de tous les maillages generes.
Godot tient pour face avant celle dont la normale calculee par la regle de la
main droite s'ecarte de l'observateur — l'inverse de la convention OpenGL. Un
maillage enroule "naturellement" est donc integralement elimine par le culling
et devient invisible, sans le moindre message d'erreur. L'invariant verifie est
que la normale geometrique soit toujours opposee a la normale d'ombrage.

Pour produire des images de controle :

```bash
godot --path . --rendering-driver vulkan --resolution 960x540 res://tests/capture.tscn
```

## Limites connues

- Le rendu exige **Forward+**. En mode Compatibility, `DEPTH_TEXTURE` n'existe
  pas : l'eau et le post-traitement sous-marin ne fonctionneront pas.
- Pas de vehicules (Seamoth, Cyclops), pas de construction de bases, pas de
  faune hostile ni de scenario : le jeu couvre la boucle exploration → recolte
  → artisanat → progression en profondeur.
- Le jeu est exclusivement a la premiere personne ; il n'y a pas de vue
  exterieure.
- Les gisements deja recoltes sont oublies au redemarrage si vous ne
  sauvegardez pas (`Echap` → *Sauvegarder*).
- Le scanner enregistre les analyses mais n'ouvre pas encore de fiches
  detaillees.
