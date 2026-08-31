# Babel — spécification de développement

> Fichier à placer à la racine du dépôt. Démarrer Claude Code avec :
> `lis SPEC.md en entier, puis propose-moi un plan détaillé pour le jalon M0 uniquement. N'écris aucun code avant que je valide le plan.`

---

## 1. Ce que tu construis

**Babel** est un logiciel Windows de bureau qui affiche des sous-titres traduits en temps réel, par-dessus n'importe quelle application, sans aucune intégration côté application cible.

Cas d'usage principaux :
- un jeu japonais / coréen / chinois jamais traduit,
- un stream ou une vidéo en langue étrangère,
- un vocal Discord avec des joueurs étrangers.

Deux sources d'entrée fonctionnent en parallèle et se renforcent :
1. **Audio** — capture du son système, transcription puis traduction.
2. **Texte à l'écran** — OCR sur une zone délimitée une seule fois par l'utilisateur (boîte de dialogue, sous-titres incrustés, interface).

Le produit sera vendu sur Steam en achat unique. Il doit donc être fini, autonome, hors ligne, sans compte utilisateur et sans télémétrie.

---

## 2. Contraintes non négociables

Ces règles priment sur toute autre considération. Si une décision technique les remet en cause, arrête-toi et demande-moi.

1. **Aucune injection dans le processus cible.** Pas de DLL injection, pas de hook DirectX, pas de lecture mémoire d'un autre processus. L'overlay est une fenêtre externe indépendante. Un seul manquement à cette règle fait bannir des utilisateurs par les anticheat et tue le produit.
2. **100% hors ligne à l'exécution.** Aucune requête réseau pendant l'utilisation. Le seul accès réseau autorisé est le téléchargement explicite de modèles, déclenché par l'utilisateur, dans un écran dédié.
3. **Aucune donnée ne quitte la machine.** Pas de télémétrie, pas de crash reporting automatique, pas d'analytics.
4. **Licences commerciales uniquement.** Chaque modèle et chaque dépendance doit être compatible avec une vente commerciale. Avant d'intégrer un modèle, vérifie sa licence et note-la dans `LICENSES.md`. **NLLB est en CC-BY-NC, donc interdit ici.** Les licences acceptées : MIT, Apache-2.0, BSD, CC-BY-4.0. En cas de doute, tu me demandes.
5. **La latence prime sur la complétude.** Si un étage du pipeline prend du retard, on jette les données en trop, on ne les met jamais en file d'attente. Un sous-titre juste mais en retard de 2 secondes est un échec produit.

---

## 3. Budget de latence

« Zéro latence » n'existe pas physiquement, donc voici la cible chiffrée qui en tient lieu. Ces chiffres sont des exigences, pas des souhaits.

### Chaîne audio, mesurée entre la fin d'une phrase parlée et l'affichage du sous-titre

| Étage | Budget p95 |
|---|---|
| Capture WASAPI → buffer | 20 ms |
| Détection de fin de phrase (VAD) | 200 ms |
| Transcription ASR (segment 1–3 s, GPU) | 250 ms |
| Traduction | 60 ms |
| Rendu overlay | 16 ms |
| **Total** | **< 550 ms, jamais au delà de 900 ms** |

### Chaîne OCR, mesurée entre le changement de pixels et l'affichage

Budget total : **< 250 ms p95.**

### Techniques imposées pour tenir ces budgets

- **Affichage progressif.** Dès que l'ASR produit une hypothèse partielle, affiche-la immédiatement en gris atténué, puis remplace-la par la traduction finale en pleine opacité. L'utilisateur voit quelque chose bouger en moins de 200 ms, ce qui supprime la sensation d'attente même quand la traduction finale arrive à 500 ms.
- **Pipeline à étages découplés.** Chaque étage tourne sur sa propre tâche, relié par des `System.Threading.Channels` bornés en `BoundedChannelFullMode.DropOldest`. Aucune file ne grossit jamais.
- **Aucune allocation dans les boucles chaudes.** Buffers réutilisés, `ArrayPool<T>`, `Span<T>`. Zéro allocation par frame audio.
- **Aucune animation sur le chemin du sous-titre.** Un fondu de 150 ms sur un sous-titre, c'est 150 ms de latence perçue offerte gratuitement à la concurrence.
- **Sauter le travail inutile.** Sur la chaîne OCR, calcule un hash rapide de la zone capturée et ne lance l'OCR que si le contenu a réellement changé.

### Instrumentation obligatoire

Un HUD de debug, activable par `F9`, affichant en temps réel pour chaque étage : la dernière valeur, p50, p95, et le nombre d'éléments jetés. Ces chiffres sont écrits dans `PERF.md` à chaque session de mesure.

**Règle de travail : tu ne passes pas au jalon suivant tant que le budget de latence du jalon courant n'est pas mesuré et tenu.** Si un budget est intenable, tu me le dis avec les chiffres mesurés au lieu de continuer.

---

## 4. Pile technique

- **.NET 8, C#.**
- **UI et overlay : WPF.** Fenêtre `WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW`, topmost, transparence par pixel, click-through total.
- **Capture audio : NAudio**, `WasapiLoopbackCapture`, rééchantillonné en 16 kHz mono.
- **VAD : Silero VAD** via ONNX Runtime.
- **ASR : whisper.cpp** via `Whisper.net`, avec accélération CUDA et repli Vulkan puis CPU. Modèles `small` ou distillés, quantifiés.
- **Traduction, MVP : opus-mt (Helsinki-NLP)** exécuté par **CTranslate2**. Modèles minuscules, spécialisés par paire de langues, quelques dizaines de millisecondes par phrase. C'est le choix qui rend le budget de 60 ms atteignable.
- **Traduction, évolution : un LLM local Apache-2.0** (famille Qwen ou équivalent) pour le mode contextuel, avec les 5 dernières lignes et le glossaire injectés dans le prompt. Ce mode est optionnel et clairement présenté comme plus lent.
- **OCR : `Windows.Media.Ocr`** en premier choix, aucune dépendance, hors ligne, prend en charge le japonais, le chinois et le coréen si le pack de langue est installé. Repli PaddleOCR en ONNX si la qualité est insuffisante.
- **Capture écran : `Windows.Graphics.Capture`** (WinRT), capture de la fenêtre ciblée uniquement, pas de l'écran entier.
- **Stockage : SQLite** pour les profils et glossaires.

### Limite connue à documenter, pas à contourner

Un overlay externe ne s'affiche pas au-dessus d'un jeu en plein écran exclusif. Le produit exige le mode fenêtré sans bordure. Cette limite doit être écrite dans l'écran d'accueil, dans les réglages et sur la future page Steam. Ne tente aucune astuce d'injection pour la contourner, voir la contrainte 1.

---

## 5. Direction artistique

Le brief visuel est précis et tu le suis. Ne pars pas sur un fond noir avec un accent vert acide, ni sur des cartes arrondies avec ombre douce : ce sont des réflexes, pas des choix.

**Univers de référence : le matériel d'interprétation simultanée et de régie radio.** Cabines d'interprètes, voyants ambrés, vumètres, panneaux sérigraphiés. C'est cohérent avec le produit, qui est littéralement un interprète simultané, et ça donne des éléments d'interface qui portent de l'information réelle plutôt que de la décoration.

### Palette

| Rôle | Hex |
|---|---|
| Panneau | `#1E2422` |
| Surface | `#2A312E` |
| Filets | `#3E4844` |
| Texte | `#EDE8DC` |
| Signal actif (voyant) | `#E8A33D` |
| État en pause / pas de signal | `#C4483A` |

### Typographie

- Interface : une humaniste à fort x-height, un seul niveau de graisse pour le corps, un seul pour les titres.
- Chiffres du HUD de latence : une monospace, justifiée ici parce que ce sont des relevés d'instrument qui ne doivent pas gigoter entre deux rafraîchissements. Nulle part ailleurs.
- Sous-titres : lisibilité maximale, aucune personnalité. Famille Noto Sans pour la couverture CJK complète. Le sous-titre n'est pas un endroit où exprimer un style.

### Règles de mise en page

- Fenêtre de réglages : un panneau vertical unique, rail de navigation à gauche avec quatre entrées — Source, Langues, Affichage, Profils. Contenu aligné à gauche.
- Pas de cartes, pas d'ombres portées, pas de dégradés. La hiérarchie se fait par les filets et l'espacement.
- Pas d'étiquettes en majuscules espacées au-dessus des titres.
- Un vumètre horizontal réel sur l'écran Source, alimenté par le niveau audio capté. Il sert au diagnostic : si l'utilisateur ne voit rien bouger, c'est qu'il a choisi le mauvais périphérique.
- Un voyant d'état unique, ambré quand la chaîne tourne, rouge quand elle est en pause. Visible depuis n'importe quel écran.

### Mouvement

- Chemin du sous-titre : **aucune animation, jamais.** Apparition immédiate.
- Interface de réglages : uniquement du mouvement en réponse à une action de l'utilisateur, 120 ms maximum, jamais d'animation d'entrée automatique.

### Rendu des sous-titres

- Deux lignes maximum, le texte ancien remonte, jamais de recomposition de la mise en page.
- Fond assombri dont l'opacité s'adapte à la luminance moyenne des pixels situés derrière, plus un contour de 2 px. Le sous-titre doit rester lisible sur une scène de neige comme sur une grotte.
- Position, taille et opacité réglables, sauvegardées par profil de jeu.

### Écriture de l'interface

Voix directe, phrases courtes, pas de jargon technique côté utilisateur. On dit « Aucun son détecté. Vérifie le périphérique de sortie. », pas « WASAPI loopback initialization returned no frames ». Un message d'erreur explique ce qui s'est passé et quoi faire, il ne s'excuse pas.

---

## 6. Jalons

Tu traites un jalon à la fois. À la fin de chacun : l'application se lance, la fonctionnalité marche, les chiffres de latence sont mesurés, et tu t'arrêtes pour que je valide.

- **M0 — Squelette.** Fenêtre de réglages, overlay transparent click-through affichant un texte de test, hotkeys globales, sauvegarde des réglages, HUD de latence vide mais câblé.
- **M1 — Audio et transcription.** Capture WASAPI, sélection du périphérique, vumètre, VAD, whisper.cpp, affichage de la transcription brute avec hypothèses partielles en gris. Budget mesuré.
- **M2 — Traduction.** Intégration CTranslate2 et opus-mt, sélection des langues, affichage progressif gris puis final. Budget total mesuré.
- **M3 — OCR.** Sélection de zone à la souris, capture de fenêtre, détection de changement par hash, OCR, traduction, affichage. Budget mesuré.
- **M4 — Profils et glossaire.** Détection du jeu par nom de processus, sauvegarde de la zone OCR, du glossaire et de la position des sous-titres. Le glossaire est injecté dans la traduction pour que les noms propres et les noms de techniques restent stables.
- **M5 — Finition.** Écran d'accueil et de première utilisation, téléchargement des modèles à la demande, budget VRAM réglable, mode CPU, gestion propre des erreurs.
- **M6 — Steam.** Intégration Steamworks, publication et abonnement aux profils via le Workshop.

---

## 7. Méthode de travail

- Avant d'écrire du code pour un jalon, propose un plan et attends ma validation.
- Tiens à jour trois fichiers : `DECISIONS.md` pour les choix d'architecture et leur justification, `PERF.md` pour les mesures de latence datées, `LICENSES.md` pour chaque dépendance et modèle avec sa licence.
- Écris des tests sur ce qui est testable sans interface : découpage VAD, politique de rejet des files, application du glossaire, cache OCR.
- Quand tu hésites entre deux approches et que l'une est plus rapide mais plus complexe, expose-moi les deux avec les chiffres attendus. Ne tranche pas seul sur l'architecture du pipeline.
- Si une contrainte de la section 2 devient gênante, tu me le signales. Tu ne la contournes pas.
