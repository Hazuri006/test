#!/bin/sh
# Rendu logiciel hors ecran (lavapipe + Xvfb) : sert a controler visuellement
# le jeu sans carte graphique.
#   tests/render.sh res://tests/capture.tscn [largeur]x[hauteur]
GODOT="${GODOT:-/tmp/claude-0/-home-user-test/9bd07736-5008-5ca1-ac3f-1d30e1ab1ab8/scratchpad/Godot_v4.3-stable_linux.x86_64}"
SCENE="${1:-res://tests/capture.tscn}"
RES="${2:-960x540}"
pgrep Xvfb >/dev/null 2>&1 || { Xvfb :99 -screen 0 1280x720x24 >/dev/null 2>&1 & sleep 2; }
DISPLAY=:99 \
VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json \
LIBGL_ALWAYS_SOFTWARE=1 \
exec "$GODOT" --path "$(dirname "$0")/.." --rendering-driver vulkan \
	--resolution "$RES" "$SCENE"
