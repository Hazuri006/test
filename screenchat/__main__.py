"""Point d'entree : `python -m screenchat`."""

from __future__ import annotations

import sys


def main() -> int:
    try:
        import tkinter  # noqa: F401
    except ImportError:
        print(
            "tkinter est introuvable.\n"
            "  Debian/Ubuntu : sudo apt install python3-tk\n"
            "  Fedora        : sudo dnf install python3-tkinter\n"
            "  macOS/Windows : réinstalle Python depuis python.org (tkinter est inclus)",
            file=sys.stderr,
        )
        return 1

    try:
        from .app import main as run
    except ImportError as exc:
        print(
            f"Dépendance manquante ({exc.name}).\n"
            "Installe-les avec : pip install -r requirements.txt",
            file=sys.stderr,
        )
        return 1

    try:
        run()
    except Exception as exc:  # noqa: BLE001 - dernier filet avant la sortie
        print(f"ScreenChat s'est arrêté : {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
