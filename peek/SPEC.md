# Peek — spécification de développement

> Fichier à placer à la racine du dépôt sous le nom `SPEC.md`. Démarrer Claude Code avec :
> `lis SPEC.md en entier, puis propose-moi un plan détaillé pour le jalon M0 uniquement. N'écris aucun code avant que je valide le plan.`

---

## 1. Ce que tu construis

**Peek** est un logiciel Windows qui fait apparaître une fenêtre par-dessus un jeu en cours, le temps d'un appui sur une touche, sans passer par alt-tab.

L'utilisateur assigne une touche à une fenêtre. Il maintient la touche, la fenêtre apparaît par-dessus le jeu assombri. Il relâche, il est de retour dans le jeu. Le jeu n'a jamais perdu le focus ni sauté une frame.

Exemple type : `G` pour une vidéo, `T` pour le chat vocal, `R` pour un guide.

Le logiciel sera vendu en achat unique. Il doit être fini, autonome, hors ligne, sans compte et sans télémétrie.

---

## 2. Ce qui rend un logiciel « sans défaut »

Ce n'est pas une consigne de qualité, c'est une méthode, et elle tient en trois points que tu appliques tout au long du projet.

1. **Un périmètre étroit.** Tout ce qui est listé en section 8 comme hors périmètre reste dehors, même si c'est facile à ajouter. Un logiciel qui fait une chose parfaitement se vend mieux qu'un logiciel qui en fait cinq à moitié.
2. **Des invariants explicites.** La section 4 liste des propriétés qui doivent être vraies en permanence. Elles ne sont pas négociables et elles priment sur toute fonctionnalité.
3. **Un banc de tests manuel écrit à l'avance.** La section 7. Peek touche à des choses que Windows ne garantit pas bien, donc la seule preuve que ça marche, c'est de l'avoir essayé sur de vrais jeux.

---

## 3. Les deux modes

C'est le cœur du produit, ne le simplifie pas.

**Mode coup d'œil.** La fenêtre s'affiche par-dessus, mais Peek **ne prend pas le focus**. Le jeu garde le clavier et la souris. C'est le mode par défaut, celui du maintien de touche. Techniquement : `SetWindowPos` avec `HWND_TOPMOST` et surtout `SWP_NOACTIVATE`, et la fenêtre de voile porte `WS_EX_NOACTIVATE` pour ne jamais pouvoir être activée.

**Mode utilisation.** Un clic dans la fenêtre, ou une seconde pression sur la touche, lui donne le focus pour scroller ou taper. Avant de basculer, tu neutralises proprement les touches maintenues, voir l'invariant I2.

Le raccourci fonctionne en maintien **et** en bascule : maintenir pour un coup d'œil court, appuyer brièvement pour rester. La distinction se fait sur un seuil de durée, réglable, 250 ms par défaut.

---

## 4. Invariants

Ces propriétés doivent être vraies en permanence. Si une fonctionnalité les met en danger, tu abandonnes la fonctionnalité, pas l'invariant. Chacune est testée en section 7.

- **I1 — Le jeu ne reçoit jamais une touche assignée à Peek.** Le hook avale la touche. En contrepartie, l'utilisateur est prévenu que cette touche devient inutilisable dans le jeu.
- **I2 — Aucune touche ne reste bloquée.** Si l'utilisateur maintenait une touche de déplacement au moment du basculement de focus, le jeu doit recevoir un relâchement propre. Un personnage qui continue de courir tout seul est un bug bloquant.
- **I3 — Le retour au jeu est immédiat et fiable.** Au relâchement, le focus revient au jeu et le curseur lui est rendu, en moins de 100 ms, à chaque fois, sans exception.
- **I4 — Un plantage de Peek ne laisse jamais le système cassé.** Avant toute modification, l'état d'origine des fenêtres touchées est écrit sur le disque en JSON. Au démarrage, si ce fichier existe, Peek restaure tout et le supprime. Si le processus est tué en plein coup d'œil, rien ne doit rester topmost ni déplacé.
- **I5 — Restitution exacte.** Position, taille, état maximisé, ordre d'affichage et drapeau topmost sont restitués à l'identique. Utilise `GetWindowPlacement` et `SetWindowPlacement`, et `DWMWA_EXTENDED_FRAME_BOUNDS` pour les dimensions réelles.
- **I6 — Zéro consommation au repos.** Aucune boucle de scrutation. Tout est événementiel. Moins de 0,5 % de processeur et moins de 80 Mo de mémoire quand aucun coup d'œil n'est en cours.
- **I7 — Le callback du hook clavier ne fait rien.** Il empile un événement et retourne, point. Windows ignore purement et simplement un hook trop lent, ce qui produirait des touches perdues, impossibles à reproduire et impossibles à déboguer. Tout le travail se fait sur un autre fil.
- **I8 — Aucune injection.** Pas de DLL injectée, pas de hook DirectX, pas de lecture mémoire d'un autre processus. Peek ne manipule que des fenêtres et du volume audio, par des API publiques. Cette règle protège les acheteurs d'un bannissement par un anticheat.

---

## 5. Pile technique

- **.NET 8, C#**, application unique avec icône dans la zone de notification.
- **WPF** pour la fenêtre de configuration et pour le voile.
- **Interop Win32** pour tout le reste : `SetWindowPos`, `GetWindowPlacement`, `SetWindowLong`, `SetWinEventHook` pour suivre l'apparition et la disparition des fenêtres.
- **Hook clavier bas niveau** `WH_KEYBOARD_LL`, sur un fil dédié avec sa propre boucle de messages. `RegisterHotKey` ne convient pas, elle ne signale pas le relâchement des touches.
- **Volume par application** via `IAudioSessionManager2` et `ISimpleAudioVolume`, pour baisser le son du jeu pendant le coup d'œil.
- **Curseur** : libération de `ClipCursor` à l'ouverture, restitution à la fermeture.
- **Stockage** : un simple fichier JSON dans `%APPDATA%`, pas de base de données.

### Pièges connus à traiter dès le départ

- `SetForegroundWindow` échoue silencieusement quand le processus appelant ne possède pas la fenêtre de premier plan. Prévois le contournement par `AttachThreadInput` et vérifie que le focus est réellement revenu au lieu de le supposer.
- Une fenêtre de navigateur totalement masquée peut voir son rendu ralenti par le navigateur lui-même. Ne masque jamais la fenêtre à 100 %, laisse-la dépasser d'un pixel.
- Le plein écran exclusif ne permet pas d'afficher une fenêtre externe par-dessus. Peek exige le mode fenêtré sans bordure. Écris-le franchement dans l'application et sur la page de vente, ne cherche pas à le contourner.
- Mise à l'échelle DPI et configurations multi-écrans : les coordonnées sauvegardées doivent rester valides si l'utilisateur change de résolution.

---

## 6. Design

L'utilisateur a demandé simple et propre. Ça veut dire peu d'éléments, pas peu de soin.

**Principe directeur : Peek est presque invisible.** Le produit, ce sont les fenêtres de l'utilisateur. Tout ce que Peek ajoute à l'écran doit se justifier. Si un élément d'interface n'apporte pas une information dont l'utilisateur a besoin à cet instant, il ne s'affiche pas.

### En jeu

- Un voile sombre entre le jeu et les fenêtres, opacité réglable, 40 % par défaut.
- Une barre fine en bas, avec seulement : le nom du raccourci actif, et l'indication que le son du jeu est baissé. Rien d'autre.
- Aucun logo, aucun filigrane, aucune notification.

### Fenêtre de configuration

- **Un seul écran.** Pas d'onglets, pas de rail de navigation. Une liste de raccourcis, un bouton pour en ajouter un.
- Une ligne de raccourci contient quatre choses : la touche, la fenêtre visée, le mode, et un bouton de suppression. C'est tout.
- L'ajout se fait par capture directe : l'utilisateur clique sur « Ajouter », appuie sur la touche voulue, choisit la fenêtre dans la liste des fenêtres ouvertes. Deux gestes.
- Les réglages avancés, seuil de maintien, opacité du voile, niveau de baisse du son, sont repliés en bas derrière un lien discret.

### Palette

| Rôle | Hex |
|---|---|
| Fond | `#141516` |
| Surface | `#1E2021` |
| Filets | `#2E3133` |
| Texte | `#E8E6E3` |
| Texte secondaire | `#9A9894` |
| Accent, un seul usage | `#5B8FD6` |

L'accent sert uniquement à signaler le raccourci actif et l'élément sélectionné. Nulle part ailleurs.

### Typographie et mise en page

- Une seule famille, deux graisses, régulier et médium. Jamais de gras lourd.
- Casse de phrase partout, jamais de majuscules d'affichage.
- Pas d'ombres portées, pas de dégradés, pas de cartes flottantes. La hiérarchie se fait par les filets et l'espacement.
- Marge intérieure généreuse : la fenêtre doit paraître vide plutôt que remplie.

### Mouvement

- Apparition du voile : 80 ms maximum. En mode maintien, l'utilisateur doit percevoir une réaction immédiate, donc une animation d'entrée longue est un défaut, pas une finition.
- Aucune animation ailleurs, sauf retour visuel direct à un clic.

### État vide et messages

- Au premier lancement : une phrase, « Ajoute ton premier raccourci », et le bouton. Pas de tutoriel, pas d'écran d'accueil en plusieurs étapes.
- Les messages disent ce qui s'est passé et quoi faire : « Cette touche est déjà utilisée par le raccourci G. Choisis-en une autre. » Jamais d'excuse, jamais de jargon technique.

---

## 7. Banc de tests

Écrit avant le code, exécuté à chaque fin de jalon. Un test qui échoue bloque le passage au jalon suivant.

**Tests d'invariants, manuels, sur un vrai jeu :**

1. Maintenir une touche de déplacement, déclencher un coup d'œil, relâcher. Le personnage doit s'arrêter. Vérifie I2.
2. Déclencher un coup d'œil, tuer Peek depuis le gestionnaire des tâches, relancer. Toutes les fenêtres doivent retrouver leur place. Vérifie I4.
3. Enchaîner cinquante ouvertures et fermetures rapides. Aucune fenêtre ne doit rester topmost, aucune fuite mémoire. Vérifie I3 et I5.
4. Laisser Peek au repos une heure. Consommation processeur et mémoire relevées. Vérifie I6.
5. Assigner une touche utilisée par le jeu, vérifier que le jeu ne la reçoit plus. Vérifie I1.
6. Fermer la fenêtre visée pendant qu'elle est affichée, puis relâcher la touche. Aucun plantage.
7. Changer de résolution et débrancher un écran pendant que Peek tourne. Les raccourcis restent valides.

**Tests de compatibilité, à faire tôt :**

8. Tester contre les anticheat les plus stricts du marché avant d'écrire le reste du logiciel. C'est le risque numéro un du projet. Si un anticheat majeur pose problème, il faut le savoir en semaine deux. Le résultat de chaque test est consigné dans `COMPATIBILITE.md`, honnêtement, y compris les échecs.
9. Tester avec un jeu en fenêtré sans bordure, un jeu en fenêtré classique, et un jeu en plein écran exclusif pour confirmer le message d'erreur.

---

## 8. Jalons et périmètre

Un jalon à la fois. À la fin de chacun, l'application se lance, la fonctionnalité marche, le banc de tests passe, et tu t'arrêtes pour validation.

- **M0 — Socle.** Icône dans la zone de notification, fichier de configuration, hook clavier bas niveau conforme à I7, journalisation. Aucune fenêtre manipulée encore.
- **M1 — Coup d'œil.** Une touche, une fenêtre, voile, affichage sans vol de focus, restitution exacte. Invariants I1 à I5 testés.
- **M2 — Plusieurs raccourcis.** Liste de raccourcis, capture de touche, sélection de fenêtre, détection des conflits.
- **M3 — Mode utilisation.** Bascule vers le focus, neutralisation des touches maintenues, retour propre.
- **M4 — Confort.** Baisse automatique du son du jeu, gestion du curseur, réglages avancés, lancement au démarrage.
- **M5 — Finition.** État vide, messages d'erreur, page de compatibilité, installateur.

**Hors périmètre pour la version 1, ne le propose pas :** dispositions à plusieurs fenêtres simultanées, profils automatiques par jeu, capture ou rendu des fenêtres, partage de configurations en ligne, thèmes personnalisables, prise en charge du plein écran exclusif.

---

## 9. Méthode de travail

- Avant d'écrire du code pour un jalon, propose un plan et attends validation.
- Tiens à jour `DECISIONS.md` pour les choix d'architecture, `COMPATIBILITE.md` pour les résultats de tests par jeu et anticheat.
- Écris des tests automatisés sur ce qui est testable sans interface : sérialisation de l'état des fenêtres, détection de conflit de touches, logique maintien contre bascule, machine à états des modes.
- Si un invariant de la section 4 devient gênant à respecter, tu me le signales. Tu ne le contournes pas.
- Ne propose aucune fonctionnalité listée hors périmètre, même si elle semble triviale à ajouter.
