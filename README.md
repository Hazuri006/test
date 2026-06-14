# Stellar Drift

Un prototype **original** d'exploration spatiale en monde ouvert, qui tourne
directement dans le navigateur (WebGL via [Three.js](https://threejs.org/)).

> ⚠️ Ce n'est **pas** No Man's Sky ni une copie de celui-ci. No Man's Sky est un
> jeu commercial protégé par le droit d'auteur (Hello Games). Ce projet est une
> création originale *inspirée* du genre « exploration spatiale » : vol libre,
> planètes générées procéduralement, soleil et champ d'étoiles.

## Lancer le jeu

Comme la page charge Three.js depuis un CDN, ouvre-la via un petit serveur local
(ouvrir le fichier en `file://` peut bloquer le module selon le navigateur) :

```bash
# Python 3
python3 -m http.server 8000
# puis ouvre http://localhost:8000 dans le navigateur
```

Une connexion Internet est nécessaire au premier chargement (pour le CDN).

## Commandes

| Touche      | Action                                   |
|-------------|------------------------------------------|
| Souris      | Orienter le vaisseau (tangage / lacet)   |
| `W` / `S`   | Augmenter / réduire la poussée           |
| `A` / `D`   | Tonneau (roulis)                         |
| `Espace`    | Boost                                    |
| `M`         | Ouvrir / fermer la carte galactique      |
| `X`         | Arrêt complet                            |

Clique sur l'écran d'accueil pour décoller (capture la souris).

Dans la **carte galactique** (`M`) : glisser pour pivoter, molette pour zoomer,
clic pour sélectionner un système, `Entrée` (ou le bouton **Voyager**) pour y
sauter. Chaque système est régénéré à partir de son nom (même nom = même contenu).

## Ce qui est implémenté

- **Rendu cinématique** : tonemapping ACES + bloom HDR, halo atmosphérique
  (Fresnel) sur chaque planète, terrain ombré océans/continents, couleurs
  d'étoiles réalistes par classe spectrale (O/B/A/F/G/K/M)
- Vol 6 degrés de liberté avec inertie et poussée progressive
- Système solaire généré procéduralement : soleil + 5 à 14 planètes (tailles,
  reliefs, anneaux et atmosphères variés)
- **Carte galactique** : spirale de 320 systèmes, sélection et voyage interstellaire
- ~11000 étoiles, nébuleuses, collisions douces, HUD complet

> Note : « réaliste » ici = stylisé/cinématique. Le photoréalisme AAA (ray-tracing,
> textures 4K) n'est pas atteignable dans un prototype web mono-fichier.

## Pistes d'évolution

- Atterrissage et marche à la surface des planètes
- Ressources à récolter, inventaire, vaisseaux améliorables
- Faune/flore procédurale, sons, sauvegarde

C'est une base : dis-moi quelle direction prioriser.
