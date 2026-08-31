#!/usr/bin/env bash
# Lance ScreenChat sous macOS / Linux : cree l'environnement virtuel au premier demarrage.
set -euo pipefail
cd "$(dirname "$0")"

PYTHON="${PYTHON:-python3}"

if [ ! -x ".venv/bin/python" ]; then
    echo "Premier demarrage : installation des dependances..."
    "$PYTHON" -m venv .venv
    .venv/bin/python -m pip install --upgrade pip >/dev/null
    .venv/bin/python -m pip install -r requirements.txt
fi

exec .venv/bin/python -m screenchat
