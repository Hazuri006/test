"""Capture d'ecran : enumeration des ecrans, capture, recadrage, encodage pour l'API."""

from __future__ import annotations

import base64
import io
from dataclasses import dataclass

import mss
from PIL import Image

# L'API accepte au maximum 5 Mo de donnees base64 par image ; base64 gonfle les
# octets d'environ 4/3, on se garde donc une marge sur la taille binaire.
MAX_RAW_BYTES = 3_500_000


@dataclass(frozen=True)
class Monitor:
    """Un ecran tel que mss le decrit (coordonnees en pixels physiques)."""

    index: int
    left: int
    top: int
    width: int
    height: int
    label: str

    @property
    def region(self) -> dict[str, int]:
        return {"left": self.left, "top": self.top, "width": self.width, "height": self.height}


@dataclass(frozen=True)
class EncodedImage:
    media_type: str
    data: str          # base64
    width: int
    height: int
    byte_size: int     # taille binaire avant base64


def list_monitors() -> list[Monitor]:
    """Renvoie les ecrans disponibles. L'index 0 correspond a tous les ecrans reunis."""
    with mss.mss() as sct:
        raw = sct.monitors

    monitors: list[Monitor] = []
    for index, mon in enumerate(raw):
        if index == 0:
            label = f"Tous les écrans ({mon['width']}x{mon['height']})"
        else:
            label = f"Écran {index} ({mon['width']}x{mon['height']})"
        monitors.append(
            Monitor(
                index=index,
                left=mon["left"],
                top=mon["top"],
                width=mon["width"],
                height=mon["height"],
                label=label,
            )
        )

    if len(monitors) > 2:
        return monitors           # plusieurs ecrans : garder l'entree "tous les ecrans"
    return monitors[1:] or monitors


def grab(monitor: Monitor) -> Image.Image:
    """Capture l'ecran demande et renvoie une image RVB."""
    with mss.mss() as sct:
        shot = sct.grab(monitor.region)
    # mss renvoie du BGRA brut ; "BGRX" ignore le canal alpha, toujours opaque ici.
    return Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")


def encode_for_api(image: Image.Image, max_edge: int = 1568) -> EncodedImage:
    """Reduit puis encode l'image pour l'API.

    On reste en PNG (sans perte, le texte a l'ecran reste lisible) tant que la
    taille le permet, et on bascule en JPEG pour les captures multi-ecrans qui
    depassent la limite de la requete.
    """
    work = image.convert("RGB")

    long_edge = max(work.size)
    if max_edge and long_edge > max_edge:
        ratio = max_edge / long_edge
        new_size = (max(1, round(work.width * ratio)), max(1, round(work.height * ratio)))
        work = work.resize(new_size, Image.LANCZOS)

    raw = _to_bytes(work, "PNG")
    media_type = "image/png"

    if len(raw) > MAX_RAW_BYTES:
        raw = _to_bytes(work, "JPEG", quality=85)
        media_type = "image/jpeg"

    # Filet de securite : si le JPEG passe encore au-dessus, on reduit la taille.
    while len(raw) > MAX_RAW_BYTES and min(work.size) > 320:
        work = work.resize((round(work.width * 0.8), round(work.height * 0.8)), Image.LANCZOS)
        raw = _to_bytes(work, "JPEG", quality=80)
        media_type = "image/jpeg"

    return EncodedImage(
        media_type=media_type,
        data=base64.standard_b64encode(raw).decode("ascii"),
        width=work.width,
        height=work.height,
        byte_size=len(raw),
    )


def _to_bytes(image: Image.Image, fmt: str, **params) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format=fmt, **params)
    return buffer.getvalue()
