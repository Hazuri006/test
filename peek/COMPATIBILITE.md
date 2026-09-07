# Compatibilité

Résultats des tests par jeu et par anticheat, honnêtement, y compris les échecs.
C'est la consigne de la section 7 de [SPEC.md](SPEC.md) et elle est prise au
mot : une case vide veut dire « pas testé », jamais « probablement bon ».

---

## État actuel : aucun test exécuté

**Rien de ce tableau n'a encore été rempli.** Le code du jalon M0 a été écrit,
compilé et testé sur une machine Linux, en compilation croisée. Les parties qui
touchent Windows — le hook clavier, l'icône de notification, la fenêtre — n'ont
jamais été exécutées.

Ce qui est vérifié à ce jour :

| Vérification | État |
|---|---|
| `Peek.Core` compile et ses 82 tests passent | fait, sur Linux |
| `Peek.App` compile, passe de markup XAML comprise | fait, en compilation croisée |
| Aucun avertissement, `TreatWarningsAsErrors` actif | fait |
| Le hook s'installe et avale une touche | **à faire, sur Windows** |
| Le voile apparaît et la fenêtre passe devant sans vol de focus | **à faire, sur Windows** |
| La fenêtre est restituée à l'identique, y compris après un plantage | **à faire, sur Windows** |
| La capture de touche et la sélection de fenêtre fonctionnent | **à faire, sur Windows** |
| Tout le reste du tableau ci-dessous | **à faire, sur Windows** |

---

## Le test qui commande tout le reste

La section 7 place le test anticheat en huitième position et demande qu'il soit
fait tôt. La décision D1 le remonte à la fin du jalon M0, avant d'écrire quoi
que ce soit d'autre.

La raison est simple : le binaire de M0 ne fait qu'installer un hook clavier
bas niveau. Il ne touche aucune fenêtre, ne baisse aucun volume, ne lit la
mémoire de personne. C'est la sonde minimale. Si un anticheat majeur réagit à ce
binaire, il réagit au hook lui-même, et il n'existe aucun contournement
compatible avec I8 — il faut le savoir avant d'écrire M1 à M5, pas après.

### Protocole

Pour chaque jeu, dans cet ordre :

1. Lancer Peek, vérifier que l'icône apparaît et que le journal dit
   « Hook clavier installé ».
2. Lancer le jeu en fenêtré sans bordure, jouer dix minutes, quitter.
3. Relever : le jeu démarre-t-il, l'anticheat émet-il un avertissement, le
   compte est-il sanctionné dans les 48 heures.
4. Recommencer avec Peek lancé **après** le jeu, puis **avant**.
5. Consigner le résultat ci-dessous, même quand il est bon, surtout quand il ne
   l'est pas.

> Faire ces essais sur un compte dont la perte est acceptable. Un anticheat qui
> réagit mal sanctionne le compte, pas le logiciel.

### Résultats

| Anticheat | Jeu testé | Version de Peek | Peek lancé avant / après | Résultat | Date |
|---|---|---|---|---|---|
| Easy Anti-Cheat | | | | | |
| BattlEye | | | | | |
| Vanguard | | | | | |
| Ricochet | | | | | |
| VAC | | | | | |
| FACEIT | | | | | |

---

## Modes d'affichage

Test 9 de la section 7. Le plein écran exclusif est attendu en échec : c'est une
limite annoncée, pas un défaut à corriger.

| Mode | Jeu testé | Résultat attendu | Résultat observé | Date |
|---|---|---|---|---|
| Fenêtré sans bordure | | fonctionne | | |
| Fenêtré classique | | fonctionne | | |
| Plein écran exclusif | | message d'erreur clair | | |

---

## Antivirus

Un hook clavier global déclenche des faux positifs. Le savoir tôt évite de le
découvrir par un acheteur.

| Moteur | Version de Peek | Binaire signé | Résultat | Date |
|---|---|---|---|---|
| Microsoft Defender | | non | | |
| | | | | |

---

## Limites connues, annoncées et non contournées

Ces trois points ne sont pas des bogues en attente de correction. Ils découlent
de choix documentés dans [DECISIONS.md](DECISIONS.md) et ils se disent
franchement, dans l'application comme sur la page de vente.

| Limite | Origine | Décision |
|---|---|---|
| Aucun affichage par-dessus un jeu en plein écran exclusif | Windows ne le permet pas à une fenêtre externe | section 5 de la spécification |
| Aucune réponse au-dessus d'un jeu lancé en administrateur | UIPI : un hook non élevé ne voit pas ces frappes | D9 |
| La touche assignée devient inutilisable dans le jeu | c'est I1, et c'est voulu | I1 |
