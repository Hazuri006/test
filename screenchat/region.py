"""Selection d'une zone a la souris sur une capture figee."""

from __future__ import annotations

import tkinter as tk

from PIL import Image, ImageTk

from .capture import Monitor
from .config import UI_FONT
from .geometry import clamp_scale, logical_bounds, to_image_box

HINT = "Trace un rectangle à la souris  ·  Entrée = tout l'écran  ·  Échap = annuler"


class RegionSelector:
    """Affiche la capture en plein ecran et renvoie le rectangle choisi.

    On travaille sur l'image deja capturee plutot que sur une fenetre
    transparente : la correspondance pixel a pixel reste exacte, y compris sur
    les ecrans haute densite ou la taille logique differe de la taille reelle.
    """

    def __init__(
        self, parent: tk.Misc, image: Image.Image, monitor: Monitor, scale: float = 1.0
    ) -> None:
        self.image = image
        self.result: tuple[int, int, int, int] | None = None
        self._start: tuple[float, float] | None = None
        self._rect_id: int | None = None

        self.top = tk.Toplevel(parent)
        self.top.title("Sélectionner une zone")
        self.top.overrideredirect(True)
        self.top.attributes("-topmost", True)
        self.top.configure(bg="black")

        left, top, width, height = logical_bounds(monitor, scale)
        self.top.geometry(f"{width}x{height}+{left}+{top}")

        self.canvas = tk.Canvas(
            self.top, bg="black", highlightthickness=0, cursor="crosshair",
            width=width, height=height,
        )
        self.canvas.pack(fill="both", expand=True)

        # Image affichee reduite pour tenir dans la fenetre, centree.
        self._ratio = min(width / image.width, height / image.height)
        shown = image.resize(
            (max(1, round(image.width * self._ratio)), max(1, round(image.height * self._ratio))),
            Image.LANCZOS,
        )
        self._offset = ((width - shown.width) / 2, (height - shown.height) / 2)
        self._photo = ImageTk.PhotoImage(shown)  # referencee pour eviter le ramasse-miettes
        self.canvas.create_image(self._offset[0], self._offset[1], image=self._photo, anchor="nw")

        self.canvas.create_text(
            width / 2, 28, text=HINT, fill="white",
            font=(UI_FONT, 12, "bold"), tags="hint",
        )
        bbox = self.canvas.bbox("hint")
        if bbox:
            self.canvas.create_rectangle(
                bbox[0] - 14, bbox[1] - 8, bbox[2] + 14, bbox[3] + 8,
                fill="#1a1a1a", outline="#555",
            )
            self.canvas.tag_raise("hint")

        self.canvas.bind("<ButtonPress-1>", self._on_press)
        self.canvas.bind("<B1-Motion>", self._on_drag)
        self.canvas.bind("<ButtonRelease-1>", self._on_release)
        self.top.bind("<Escape>", lambda _e: self._finish(None))
        self.top.bind("<Return>", lambda _e: self._finish((0, 0, image.width, image.height)))

    def select(self) -> tuple[int, int, int, int] | None:
        """Bloque jusqu'au choix de l'utilisateur ; renvoie (gauche, haut, droite, bas)."""
        self.top.grab_set()
        self.top.focus_force()
        self.top.wait_window()
        return self.result

    # ------------------------------------------------------------ evenements

    def _on_press(self, event: tk.Event) -> None:
        self._start = (event.x, event.y)
        if self._rect_id is not None:
            self.canvas.delete(self._rect_id)
        self._rect_id = self.canvas.create_rectangle(
            event.x, event.y, event.x, event.y, outline="#4da3ff", width=2,
        )

    def _on_drag(self, event: tk.Event) -> None:
        if self._start is None or self._rect_id is None:
            return
        self.canvas.coords(self._rect_id, self._start[0], self._start[1], event.x, event.y)

    def _on_release(self, event: tk.Event) -> None:
        if self._start is None:
            return
        box = self._to_image_box(self._start, (event.x, event.y))
        # Un simple clic ne selectionne rien d'exploitable.
        if box is None or (box[2] - box[0]) < 8 or (box[3] - box[1]) < 8:
            self._start = None
            return
        self._finish(box)

    def _finish(self, box: tuple[int, int, int, int] | None) -> None:
        self.result = box
        self.top.grab_release()
        self.top.destroy()

    def _to_image_box(
        self, start: tuple[float, float], end: tuple[float, float]
    ) -> tuple[int, int, int, int] | None:
        return to_image_box(
            start, end, self._offset, self._ratio, (self.image.width, self.image.height)
        )


def estimate_scale(parent: tk.Misc, primary: Monitor | None) -> float:
    """Rapport pixels physiques / pixels logiques Tk, estime sur l'ecran principal.

    Une estimation aberrante est ramenee a 1.0 : la selection reste juste de
    toute facon, seul le placement de la fenetre en depend.
    """
    if primary is None:
        return 1.0
    try:
        return clamp_scale(primary.width, parent.winfo_screenwidth())
    except tk.TclError:
        return 1.0
