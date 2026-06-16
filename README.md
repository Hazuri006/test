# ELIX — Raquettes de Padel d'Exception

Site vitrine & boutique pour **ELIX**, une marque de raquettes de padel haut de gamme.
Design moderne **noir & blanc** rehaussé de touches de **bleu électrique**, animations
soignées, et **vraies photos** de raquettes de padel (traitées en N&B, couleur révélée au survol).

![ELIX](assets/favicon.svg)

## ✨ Fonctionnalités

- **Hero animé** — titre à révélation, raquette flottante en SVG, halos lumineux, compteurs animés.
- **Collection filtrable** — 6 raquettes (vraies photos), 3 géométries (Diamant · Larme · Ronde).
- **Photos réelles** — images libres de droits (Unsplash + Wikimedia Commons), traitées en noir & blanc et révélées en couleur au survol. Crédits dans `assets/CREDITS.md`.
- **Système de likes** — bouton cœur par produit, compteur dans la barre de navigation, persistance `localStorage`.
- **Panier complet** — tiroir latéral, ajout/retrait, quantités, total en temps réel, persistance `localStorage`.
- **Animations** — révélations au scroll, effet de lueur sur les cartes, curseur personnalisé, bandeau défilant, anneaux rotatifs, toasts.
- **100 % responsive** — du grand écran au mobile (menu burger inclus).
- **Aucune dépendance / aucun build** — HTML, CSS et JavaScript purs.

## 🚀 Lancer le site

Ouvrez simplement `index.html` dans un navigateur, ou servez le dossier :

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

## 🗂️ Structure

```
index.html          # Structure de la page
css/style.css       # Design, thème (noir/blanc/bleu) & animations
js/main.js          # Génération des raquettes SVG, likes, panier, animations
assets/favicon.svg  # Favicon
```

## 🎨 Palette

| Rôle      | Couleur     |
|-----------|-------------|
| Fond      | `#07070b`   |
| Texte     | `#f5f6fa`   |
| Accent    | `#2f6bff` (bleu électrique) |

---

© 2026 ELIX — Fait avec ❤ pour le padel.
