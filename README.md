# SPIDER-VERSE — jeu de balancement dans New York

Un jeu de super-héros arachnéen jouable directement dans le navigateur : on se
balance de gratte-ciel en gratte-ciel au-dessus d'un Manhattan généré
procéduralement, on court sur les toits, on grimpe aux façades et on enchaîne
les figures pour marquer des points de style.

**Tout tient dans un seul fichier : `index.html`.**
Aucune bibliothèque, aucun CDN, aucun asset externe — le moteur 3D (WebGL 2),
le personnage, la ville, les animations et les sons sont écrits à la main et
générés à l'exécution.

## Lancer le jeu

Double-clique sur `index.html` (ou glisse-le dans le navigateur). C'est tout :
ça fonctionne hors-ligne, sans serveur, sans installation.

Navigateurs : Chrome, Edge, Firefox ou Safari récents, avec l'accélération
matérielle activée (WebGL 2 requis — si elle manque, le jeu l'annonce
clairement au lieu de planter).

## Commandes

| Action | Touche |
|---|---|
| Se déplacer / courir | `Z Q S D` ou `W A S D` (les deux dispositions marchent) |
| Lancer une toile et se balancer | **Clic gauche maintenu** |
| Sauter / se détacher | `Espace` |
| Piqué (accélérer en chute) | `Maj gauche` |
| Traction rapide vers un point | `Clic droit` ou `E` |
| Grimper un mur | automatique au contact ; `Z/S` pour monter/descendre |
| Regarder autour | souris (capturée au lancement) |
| Éloigner / rapprocher la caméra | molette |
| Changer l'heure (jour / coucher / nuit) | `F` |
| Réapparaître sur un toit | `R` |
| Pause | `Échap` |

**La clé d'un enchaînement fluide :** garde le clic gauche enfoncé. La toile se
détache toute seule en haut de l'arc et se relance aussitôt sur la prise
suivante. Relâcher en bas de l'arc catapulte vers l'avant ; `Z` raccourcit la
corde pour accélérer, `S` l'allonge pour raser la rue.

## Ce que fait le jeu

**Balancement.** Vraie physique de pendule : la corde est une contrainte de
distance résolue à pas fixe (120 Hz), avec pompage tangentiel en bas d'arc,
raccourcissement de corde, dirigeabilité latérale et conservation de l'élan au
lâcher. Les points d'ancrage sont trouvés par lancer de rayons contre les
volumes réels des immeubles (éventail de 52 rayons, portée 145 m) : on
s'accroche à ce qu'on voit, pas à un point invisible.

**Déplacements.** Course et sprint sur les toits, saut, piqué qui gagne de la
vitesse, accroche et escalade des façades, saut mural, traction rapide vers un
point visé, réception amortie. Un frôlement rasant à pleine vitesse fait
glisser le long de la façade au lieu de casser l'enchaînement.

**Personnage.** Modèle construit dans le code : squelette de 19 os, corps en
capsules et ellipsoïdes aux proportions réelles (1,83 m), costume rouge et bleu
avec motif de toile, araignée sur le torse et lentilles blanches — tout est
dessiné par le shader, il n'y a aucune texture. L'animation est entièrement
procédurale : poses d'attente, course, sprint, chute, piqué, balancement,
escalade, réception, traction, mélangées par interpolation sphérique lissée en
continu (aucune transition sèche), plus une cinématique inverse qui pointe
réellement le bras vers l'ancrage de la toile.

**New York.** ~2 600 volumes d'immeubles avec retraits Art déco, flèches,
balises clignotantes, châteaux d'eau, blocs de climatisation, panneaux
lumineux, un parc, et ~190 véhicules qui circulent. Façades, fenêtres allumées,
vitrines, asphalte, trottoirs, passages piétons et marquages sont générés
procéduralement dans les shaders. Rendu HDR : soleil directionnel avec carte
d'ombres filtrée, ciel et nuages procéduraux, brume atmosphérique, bloom,
tonemapping ACES, vignettage et flou radial de vitesse.

**Fluidité.** La résolution interne s'ajuste automatiquement pour tenir la
cadence, sans jamais toucher à la simulation (physique à pas fixe). Trois
niveaux de qualité au menu, et le rendu est instancié (une seule commande de
dessin pour toute la ville).

**Son.** Sifflement du vent piloté par la vitesse, « thwip » des toiles, impacts
— tous synthétisés à la volée en Web Audio, aucun fichier son.

## Détail technique

Le fichier contient, dans l'ordre : la bibliothèque mathématique (matrices,
quaternions), les utilitaires WebGL et les géométries, les shaders GLSL ES 3.0,
la génération de la ville et sa grille spatiale, le squelette et les poses du
personnage, la physique du joueur et la caméra, puis le rendu et la boucle
principale.

La physique tourne à pas fixe indépendamment du taux de rafraîchissement, la
grille spatiale rend les requêtes de collision et les lancers de rayons
constants quelle que soit la taille de la ville, et l'ombrage utilise une carte
d'ombres recentrée sur le joueur et alignée sur les texels pour éviter le
scintillement.
