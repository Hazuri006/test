"""Calculs de coordonnees pour la selection de zone (sans dependance a tkinter)."""

from __future__ import annotations

from .capture import Monitor


def to_image_box(
    start: tuple[float, float],
    end: tuple[float, float],
    offset: tuple[float, float],
    ratio: float,
    image_size: tuple[int, int],
) -> tuple[int, int, int, int] | None:
    """Convertit un rectangle trace dans la fenetre vers les pixels de l'image.

    `offset` est la marge de centrage de l'image affichee et `ratio` le facteur
    de reduction applique pour la faire tenir dans la fenetre. Renvoie None si
    le rectangle est vide (simple clic).
    """
    width, height = image_size
    offset_x, offset_y = offset

    xs = sorted(((start[0] - offset_x) / ratio, (end[0] - offset_x) / ratio))
    ys = sorted(((start[1] - offset_y) / ratio, (end[1] - offset_y) / ratio))

    left = _clamp(xs[0], width)
    right = _clamp(xs[1], width)
    top = _clamp(ys[0], height)
    bottom = _clamp(ys[1], height)

    if right <= left or bottom <= top:
        return None
    return (left, top, right, bottom)


def logical_bounds(monitor: Monitor, scale: float) -> tuple[int, int, int, int]:
    """Position et taille de la fenetre de selection, en pixels logiques Tk.

    mss raisonne en pixels physiques ; sur un ecran mis a l'echelle (Windows a
    150 %, Retina) Tk raisonne en pixels logiques.
    """
    return (
        round(monitor.left / scale),
        round(monitor.top / scale),
        max(320, round(monitor.width / scale)),
        max(240, round(monitor.height / scale)),
    )


def clamp_scale(physical_width: int, logical_width: int) -> float:
    """Facteur d'echelle ecran, ramene a 1.0 quand l'estimation est aberrante."""
    if not logical_width or not physical_width:
        return 1.0
    scale = physical_width / logical_width
    return scale if 0.5 <= scale <= 4.0 else 1.0


def _clamp(value: float, maximum: int) -> int:
    return max(0, min(maximum, round(value)))
