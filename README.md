# ScreenChat

Un logiciel de bureau qui capture ton écran et laisse Claude répondre à tes
questions sur ce qui est affiché.

Tu cliques sur **Afficher l'écran**, la fenêtre se cache le temps de la capture,
tu écris ta question, et la réponse s'affiche au fur et à mesure. Tu peux
enchaîner les questions sur la même capture : la conversation garde le contexte.

> **Comment ça marche.** ScreenChat tourne sur ta machine et envoie la capture à
> l'API Claude d'Anthropic avec ta propre clé. Rien n'est partagé avec qui que ce
> soit d'autre, et aucune image n'est enregistrée sur ton disque.

---

## Ce qu'il te faut

| | |
|---|---|
| **Python 3.10 ou plus** | [python.org/downloads](https://www.python.org/downloads/) — sous Windows, coche *« Add Python to PATH »* pendant l'installation |
| **Une clé API Anthropic** | [console.anthropic.com](https://console.anthropic.com/settings/keys) — elle commence par `sk-ant-` |

L'API est facturée à l'usage : compte quelques centimes par question (une capture
représente environ 1 500 jetons d'entrée). Les questions de suivi sur une même
capture coûtent moins cher, la capture étant mise en cache côté API.

## Installation et lancement

**Windows** — double-clique sur `run.bat`.

**macOS / Linux** — dans un terminal, à la racine du dossier :

```bash
./run.sh
```

Le premier lancement crée un environnement Python isolé et installe les
dépendances ; c'est automatique et ça ne prend qu'une fois. Les lancements
suivants sont immédiats.

<details>
<summary>Installation manuelle (si tu préfères)</summary>

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows : .venv\Scripts\activate
pip install -r requirements.txt
python -m screenchat
```
</details>

### La clé API

Au premier démarrage, ScreenChat te demande ta clé et l'enregistre dans
`~/.screenchat/config.json` (lisible par toi seul).

Tu peux aussi la définir dans une variable d'environnement, qui a la priorité :

```bash
export ANTHROPIC_API_KEY="sk-ant-..."      # Windows : setx ANTHROPIC_API_KEY "sk-ant-..."
```

## Utilisation

| Action | Comment |
|---|---|
| Capturer tout l'écran | Bouton **📷 Afficher l'écran** ou `F9` |
| Capturer une zone précise | Bouton **✂ Choisir une zone** ou `F10`, puis trace un rectangle à la souris |
| Poser une question | Écris en bas, puis `Entrée` (`Maj+Entrée` pour aller à la ligne) |
| Repartir de zéro | **🗑 Nouvelle conversation** ou `Ctrl+N` |
| Changer les réglages | **⚙ Réglages** |

Quelques exemples de questions qui marchent bien :

- « Qu'est-ce que cette erreur veut dire et comment je la corrige ? »
- « Résume ce tableau. »
- « Ce formulaire est-il correctement rempli ? »
- « Traduis ce qui est affiché. »
- « Où est le bouton pour exporter ? »

### Choisir plusieurs écrans

Si tu as plusieurs moniteurs, la liste déroulante **Écran** te laisse choisir
lequel capturer, ou les prendre tous d'un coup.

### Niveau d'analyse

La liste **Analyse** règle le temps que Claude passe à réfléchir avant de
répondre :

- **Rapide** — questions simples (« que dit ce message ? »)
- **Normal** — bon compromis au quotidien
- **Approfondi** *(par défaut)* — diagnostics, code, tableaux denses
- **Maximum** — quand la justesse prime sur la vitesse

## Réglages

Accessibles via **⚙ Réglages**, conservés dans `~/.screenchat/config.json` :

| Réglage | Par défaut | À quoi ça sert |
|---|---|---|
| Clé API | — | Ta clé Anthropic |
| Modèle | `claude-opus-5` | Le modèle interrogé |
| Délai avant capture | `0,4 s` | Temps laissé à la fenêtre pour disparaître avant la capture |
| Taille max envoyée | `1568 px` | Côté long de l'image envoyée : plus petit = moins cher, plus grand = petit texte plus lisible |
| Résumé du raisonnement | activé | Affiche en gris ce que Claude examine avant de répondre |

## Vie privée

- La capture part chez l'API Anthropic pour être analysée, et nulle part ailleurs.
- Aucune image n'est écrite sur le disque : tout reste en mémoire.
- Seul le fichier de configuration est stocké, et il ne contient que tes réglages
  et ta clé.
- Pense à ce qui est visible à l'écran avant de capturer : mots de passe,
  messages privés, documents confidentiels partent avec l'image. Le bouton
  **Choisir une zone** sert justement à n'envoyer que la partie utile.

## En cas de problème

**« tkinter est introuvable » (Linux)**
```bash
sudo apt install python3-tk        # Debian, Ubuntu
sudo dnf install python3-tkinter   # Fedora
```

**Écran noir dans la capture (macOS)** — donne l'autorisation dans *Réglages
Système › Confidentialité et sécurité › Enregistrement de l'écran*, puis relance
l'application.

**« Clé API refusée »** — vérifie la clé dans **⚙ Réglages**. Si
`ANTHROPIC_API_KEY` est définie dans ton environnement, c'est elle qui est
utilisée, pas celle des réglages.

**La fenêtre apparaît dans la capture** — augmente le *délai avant capture* dans
les réglages (0,8 s par exemple).

## Structure du projet

```
screenchat/
  app.py             fenêtre principale, conversation, réglages
  capture.py         énumération des écrans, capture, redimensionnement, encodage
  claude_client.py   appels à l'API Claude, streaming, historique, cache
  geometry.py        calculs de coordonnées de la sélection de zone
  region.py          sélection d'une zone à la souris
  config.py          préférences et clé API
tests/               tests unitaires (aucun appel réseau)
```

### Lancer les tests

```bash
.venv/bin/python -m unittest discover     # Windows : .venv\Scripts\python -m unittest discover
```

Les tests couvrent l'encodage des images, la conversation, la gestion du
contexte et les calculs de sélection ; ils n'appellent jamais l'API.
