"""Configuration locale de ScreenChat (cle API, modele, preferences)."""

from __future__ import annotations

import json
import os
import stat
import sys
from dataclasses import asdict, dataclass, fields
from pathlib import Path

CONFIG_DIR = Path.home() / ".screenchat"
CONFIG_PATH = CONFIG_DIR / "config.json"

DEFAULT_MODEL = "claude-opus-5"


def _ui_font() -> str:
    """Police d'interface native ; Tk retombe sur sa police par defaut si absente."""
    if sys.platform == "win32":
        return "Segoe UI"
    if sys.platform == "darwin":
        return "Helvetica Neue"
    return "DejaVu Sans"


UI_FONT = _ui_font()

# Niveaux d'effort proposes dans l'interface : (valeur API, libelle affiche).
EFFORT_LEVELS = [
    ("low", "Rapide"),
    ("medium", "Normal"),
    ("high", "Approfondi"),
    ("xhigh", "Maximum"),
]

SYSTEM_PROMPT = """Tu es un assistant qui analyse des captures d'écran.
L'utilisateur te montre son écran et te pose des questions sur ce qu'il y voit.

Règles :
- Réponds en français, sauf si l'utilisateur écrit dans une autre langue.
- Appuie-toi uniquement sur ce qui est réellement visible dans l'image. Si un
  détail est illisible, coupé ou hors champ, dis-le plutôt que de deviner.
- Va droit au but : la réponse d'abord, les détails ensuite.
- Quand tu parles d'un élément de l'interface, situe-le (en haut à droite, dans
  la barre latérale, ligne 42 du code...) pour que l'utilisateur le retrouve.
- Pour du code ou un message d'erreur affiché à l'écran, recopie fidèlement les
  extraits importants avant de les commenter.
- Si la question porte sur une capture précédente de la conversation, dis
  clairement de laquelle tu parles."""


@dataclass
class Config:
    """Preferences persistees dans ~/.screenchat/config.json."""

    api_key: str = ""
    model: str = DEFAULT_MODEL
    effort: str = "high"
    capture_delay: float = 0.4       # secondes d'attente apres avoir masque la fenetre
    max_image_edge: int = 1568       # cote long max envoye a l'API (recommandation Claude)
    monitor_index: int = 1           # 1 = premier ecran, 0 = tous les ecrans reunis
    show_thinking: bool = True
    max_history_messages: int = 24   # nombre de messages conserves dans la conversation
    max_history_images: int = 2      # nombre de captures conservees en entier

    @property
    def resolved_api_key(self) -> str:
        """La variable d'environnement l'emporte sur la cle enregistree."""
        return os.environ.get("ANTHROPIC_API_KEY", "").strip() or self.api_key.strip()

    @property
    def api_key_from_env(self) -> bool:
        return bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())


def load_config() -> Config:
    """Lit la configuration ; renvoie les valeurs par defaut si le fichier est absent ou illisible."""
    try:
        raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return Config()

    if not isinstance(raw, dict):
        return Config()

    known = {f.name for f in fields(Config)}
    return Config(**{k: v for k, v in raw.items() if k in known})


def save_config(config: Config) -> None:
    """Ecrit la configuration avec des permissions restreintes (elle contient la cle API)."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    data = asdict(config)
    if config.api_key_from_env:
        # Ne pas recopier sur le disque une cle qui vient de l'environnement.
        data["api_key"] = config.api_key
    CONFIG_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    try:
        CONFIG_PATH.chmod(stat.S_IRUSR | stat.S_IWUSR)  # 0600
    except OSError:
        pass  # systemes de fichiers sans permissions POSIX (certains montages Windows)
