"""Interface graphique de ScreenChat."""

from __future__ import annotations

import queue
import threading
import time
import tkinter as tk
from dataclasses import replace
from datetime import datetime
from tkinter import messagebox, ttk

from PIL import Image, ImageTk

from . import __version__
from .capture import Monitor, encode_for_api, grab, list_monitors
from .claude_client import ScreenChatSession, Usage
from .config import EFFORT_LEVELS, UI_FONT, Config, load_config, save_config
from .region import RegionSelector, estimate_scale

PREVIEW_BOX = (340, 250)
POLL_INTERVAL_MS = 50


class ScreenChatApp:
    """Fenetre principale : capture d'ecran a gauche, conversation a droite."""

    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.config: Config = load_config()
        self.events: queue.Queue[tuple[str, object]] = queue.Queue()
        self.session: ScreenChatSession | None = None

        self.monitors: list[Monitor] = list_monitors()
        self.scale = estimate_scale(root, self._primary_monitor())

        self.capture_image: Image.Image | None = None
        self._preview_photo: ImageTk.PhotoImage | None = None
        self._busy = False
        self._answer_started = False
        self._thinking_started = False

        self._build_ui()
        self._poll_events()
        self.root.after(150, self._ensure_api_key)

    # --------------------------------------------------------------- interface

    def _build_ui(self) -> None:
        self.root.title(f"ScreenChat {__version__} — analyse ton écran avec Claude")
        self.root.minsize(1020, 700)
        self.root.geometry("1180x780")

        style = ttk.Style()
        if "clam" in style.theme_names():
            style.theme_use("clam")
        style.configure("Accent.TButton", font=(UI_FONT, 10, "bold"), padding=(14, 8))
        style.configure("Toolbar.TButton", padding=(10, 6))

        main = ttk.Frame(self.root, padding=10)
        main.pack(fill="both", expand=True)
        main.columnconfigure(1, weight=1)
        main.rowconfigure(1, weight=1)

        self._build_toolbar(main)
        self._build_preview(main)
        self._build_transcript(main)
        self._build_input(main)
        self._build_status(main)

        self.root.bind("<F9>", lambda _e: self.capture(select_region=False))
        self.root.bind("<F10>", lambda _e: self.capture(select_region=True))
        self.root.bind("<Control-n>", lambda _e: self.new_conversation())
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_toolbar(self, parent: ttk.Frame) -> None:
        bar = ttk.Frame(parent)
        bar.grid(row=0, column=0, columnspan=2, sticky="ew", pady=(0, 10))

        ttk.Button(
            bar, text="⛶  Afficher l'écran   (F9)", style="Accent.TButton",
            command=lambda: self.capture(select_region=False),
        ).pack(side="left")

        ttk.Button(
            bar, text="✂  Choisir une zone   (F10)", style="Toolbar.TButton",
            command=lambda: self.capture(select_region=True),
        ).pack(side="left", padx=(8, 0))

        ttk.Label(bar, text="Écran :").pack(side="left", padx=(18, 4))
        self.monitor_var = tk.StringVar()
        self.monitor_box = ttk.Combobox(
            bar, textvariable=self.monitor_var, state="readonly", width=26,
            values=[m.label for m in self.monitors],
        )
        self.monitor_box.current(self._initial_monitor_row())
        self.monitor_box.pack(side="left")

        ttk.Label(bar, text="Analyse :").pack(side="left", padx=(18, 4))
        self.effort_var = tk.StringVar(value=self._effort_label(self.config.effort))
        effort_box = ttk.Combobox(
            bar, textvariable=self.effort_var, state="readonly", width=12,
            values=[label for _value, label in EFFORT_LEVELS],
        )
        effort_box.bind("<<ComboboxSelected>>", self._on_effort_changed)
        effort_box.pack(side="left")

        ttk.Button(
            bar, text="⚙  Réglages", style="Toolbar.TButton", command=self.open_settings,
        ).pack(side="right")
        ttk.Button(
            bar, text="↺  Nouvelle conversation", style="Toolbar.TButton",
            command=self.new_conversation,
        ).pack(side="right", padx=(0, 8))

    def _build_preview(self, parent: ttk.Frame) -> None:
        frame = ttk.LabelFrame(parent, text=" Dernière capture ", padding=10)
        frame.grid(row=1, column=0, sticky="nsew", padx=(0, 10))

        self.preview_label = tk.Label(
            frame, text="Aucune capture.\n\nClique sur « Afficher l'écran »\npour commencer.",
            width=44, height=16, bg="#f2f2f2", fg="#666", relief="flat",
            justify="center", font=(UI_FONT, 10),
        )
        self.preview_label.pack(fill="both", expand=True)

        self.capture_info = ttk.Label(frame, text="", foreground="#555", wraplength=PREVIEW_BOX[0])
        self.capture_info.pack(anchor="w", pady=(8, 0))

        ttk.Label(
            frame,
            text="Astuce : la fenêtre se cache pendant la capture, tu vois donc\n"
                 "l'écran tel qu'il est derrière ScreenChat.",
            foreground="#888", font=(UI_FONT, 8), justify="left",
        ).pack(anchor="w", pady=(6, 0))

    def _build_transcript(self, parent: ttk.Frame) -> None:
        frame = ttk.LabelFrame(parent, text=" Conversation ", padding=(10, 8))
        frame.grid(row=1, column=1, sticky="nsew")
        frame.rowconfigure(0, weight=1)
        frame.columnconfigure(0, weight=1)

        self.transcript = tk.Text(
            frame, wrap="word", state="disabled", relief="flat", padx=10, pady=8,
            bg="white", font=(UI_FONT, 10), spacing1=2, spacing3=4,
        )
        self.transcript.grid(row=0, column=0, sticky="nsew")

        scroll = ttk.Scrollbar(frame, orient="vertical", command=self.transcript.yview)
        scroll.grid(row=0, column=1, sticky="ns")
        self.transcript.configure(yscrollcommand=scroll.set)

        self.transcript.tag_configure(
            "speaker_user", foreground="#0b5fa5", font=(UI_FONT, 10, "bold"), spacing1=10
        )
        self.transcript.tag_configure(
            "speaker_claude", foreground="#a0522d", font=(UI_FONT, 10, "bold"), spacing1=10
        )
        self.transcript.tag_configure("user", foreground="#111")
        self.transcript.tag_configure("assistant", foreground="#111")
        self.transcript.tag_configure(
            "thinking", foreground="#8a8a8a", font=(UI_FONT, 9, "italic"), lmargin1=14, lmargin2=14
        )
        self.transcript.tag_configure("error", foreground="#b00020", font=(UI_FONT, 10, "bold"))
        self.transcript.tag_configure("meta", foreground="#888", font=(UI_FONT, 9, "italic"))

        self._write(
            "Prends une capture, pose ta question, et Claude te répond à partir de "
            "ce qui est affiché.\n",
            "meta",
        )

    def _build_input(self, parent: ttk.Frame) -> None:
        frame = ttk.Frame(parent)
        frame.grid(row=2, column=0, columnspan=2, sticky="ew", pady=(10, 6))
        frame.columnconfigure(0, weight=1)

        self.input = tk.Text(frame, height=4, wrap="word", font=(UI_FONT, 10), relief="solid",
                             borderwidth=1, padx=8, pady=6)
        self.input.grid(row=0, column=0, sticky="ew")
        self.input.bind("<Return>", self._on_return)
        self.input.bind("<Shift-Return>", lambda _e: None)

        side = ttk.Frame(frame)
        side.grid(row=0, column=1, sticky="ns", padx=(8, 0))
        self.send_button = ttk.Button(
            side, text="Envoyer  ➜", style="Accent.TButton", command=self.send,
        )
        self.send_button.pack(fill="x")
        ttk.Label(
            side, text="Entrée = envoyer\nMaj+Entrée = ligne", foreground="#888",
            font=(UI_FONT, 8), justify="center",
        ).pack(pady=(6, 0))

    def _build_status(self, parent: ttk.Frame) -> None:
        self.status_var = tk.StringVar(value="Pret.")
        ttk.Label(
            parent, textvariable=self.status_var, foreground="#555", anchor="w",
        ).grid(row=3, column=0, columnspan=2, sticky="ew")

    # ------------------------------------------------------------------ capture

    def capture(self, select_region: bool = False) -> None:
        """Masque la fenetre, capture l'ecran choisi, puis affiche l'apercu."""
        if self._busy:
            self._set_status("Analyse en cours, patiente avant de reprendre une capture.")
            return

        monitor = self._selected_monitor()
        self.root.withdraw()
        self.root.update()
        time.sleep(max(0.0, self.config.capture_delay))

        try:
            image = grab(monitor)
        except Exception as exc:  # noqa: BLE001 - remonte tel quel a l'utilisateur
            self.root.deiconify()
            self.root.update()
            messagebox.showerror(
                "Capture impossible",
                f"{exc}\n\nSur macOS, autorise l'application dans Réglages Système > "
                "Confidentialité et sécurité > Enregistrement de l'écran.",
                parent=self.root,
            )
            return
        else:
            self.root.deiconify()
            self.root.lift()
            self.root.update()

        if select_region:
            box = RegionSelector(self.root, image, monitor, self.scale).select()
            if box is None:
                self._set_status("Sélection annulée.")
                return
            image = image.crop(box)

        self._use_capture(image)

    def _use_capture(self, image: Image.Image) -> None:
        self.capture_image = image
        self._show_preview(image)

        encoded = encode_for_api(image, self.config.max_image_edge)
        if self.session is not None:
            self.session.attach_screenshot(encoded)

        stamp = datetime.now().strftime("%H:%M:%S")
        self.capture_info.configure(
            text=f"{image.width}×{image.height} px · envoyée en {encoded.width}×{encoded.height} "
                 f"({encoded.byte_size // 1024} Ko) · {stamp}"
        )
        self._write(f"\n▣ Capture jointe à la prochaine question ({stamp}).\n", "meta")
        self._set_status("Capture prête. Pose ta question ci-dessous.")
        self.input.focus_set()

    def _show_preview(self, image: Image.Image) -> None:
        ratio = min(PREVIEW_BOX[0] / image.width, PREVIEW_BOX[1] / image.height, 1.0)
        thumb = image.resize(
            (max(1, round(image.width * ratio)), max(1, round(image.height * ratio))),
            Image.LANCZOS,
        )
        self._preview_photo = ImageTk.PhotoImage(thumb)  # reference gardee : sinon image vide
        self.preview_label.configure(image=self._preview_photo, text="", bg="#dcdcdc")

    # ------------------------------------------------------------------- envoi

    def _on_return(self, _event: tk.Event) -> str:
        self.send()
        return "break"  # empeche l'insertion du saut de ligne

    def send(self) -> None:
        question = self.input.get("1.0", "end").strip()
        if not question or self._busy:
            return
        if self.session is None:
            messagebox.showwarning(
                "Clé API manquante",
                "Renseigne ta clé API Anthropic dans Réglages pour poser une question.",
                parent=self.root,
            )
            return

        self.input.delete("1.0", "end")
        self._write("\nToi\n", "speaker_user")
        self._write(question + "\n", "user")

        self._set_busy(True)
        self._answer_started = False
        self._thinking_started = False
        threading.Thread(target=self._worker, args=(question,), daemon=True).start()

    def _worker(self, question: str) -> None:
        assert self.session is not None
        self.session.ask(question, lambda kind, payload: self.events.put((kind, payload)))

    def _poll_events(self) -> None:
        try:
            while True:
                kind, payload = self.events.get_nowait()
                self._handle_event(kind, payload)
        except queue.Empty:
            pass
        self.root.after(POLL_INTERVAL_MS, self._poll_events)

    def _handle_event(self, kind: str, payload: object) -> None:
        if kind == "thinking":
            if not self.config.show_thinking:
                return
            if not self._thinking_started:
                self._thinking_started = True
                self._write("\nRéflexion\n", "meta")
            self._write(str(payload), "thinking")

        elif kind == "text":
            if not self._answer_started:
                self._answer_started = True
                self._write("\nClaude\n", "speaker_claude")
            self._write(str(payload), "assistant")

        elif kind == "done":
            self._write("\n", "assistant")
            usage = payload if isinstance(payload, Usage) else Usage()
            self._set_status(f"Réponse terminée · {usage.summary()}")
            self._set_busy(False)

        elif kind == "error":
            self._write(f"\n⚠ {payload}\n", "error")
            self._set_status("Échec de la requête.")
            self._set_busy(False)

    # --------------------------------------------------------------- reglages

    def _ensure_api_key(self) -> None:
        if self.config.resolved_api_key:
            self._start_session()
            return
        SettingsDialog(self.root, self, focus_key=True).show()
        if not self.config.resolved_api_key:
            self._set_status("Aucune clé API : la capture fonctionne, l'envoi non.")

    def _start_session(self) -> None:
        try:
            self.session = ScreenChatSession(self.config)
        except Exception as exc:  # noqa: BLE001
            self.session = None
            messagebox.showerror("Initialisation impossible", str(exc), parent=self.root)
            return

        source = "variable d'environnement" if self.config.api_key_from_env else "reglages"
        self._set_status(f"Prêt · modèle {self.config.model} · clé lue depuis les {source}.")

        if self.capture_image is not None:
            self.session.attach_screenshot(
                encode_for_api(self.capture_image, self.config.max_image_edge)
            )

    def open_settings(self) -> None:
        SettingsDialog(self.root, self).show()

    def apply_settings(self, config: Config) -> None:
        """Applique les reglages du dialogue et recree la session si besoin."""
        previous = self.config
        self.config = config
        save_config(config)

        self.effort_var.set(self._effort_label(config.effort))
        needs_restart = (
            self.session is None
            or config.resolved_api_key != previous.resolved_api_key
            or config.model != previous.model
        )
        if needs_restart and config.resolved_api_key:
            history = self.session.history if self.session else []
            self._start_session()
            if self.session is not None and history and config.model == previous.model:
                self.session.history = history
        elif self.session is not None:
            self.session.config = config

    def new_conversation(self) -> None:
        if self.session is not None:
            self.session.reset()
            if self.capture_image is not None:
                self.session.attach_screenshot(
                    encode_for_api(self.capture_image, self.config.max_image_edge)
                )
        self.transcript.configure(state="normal")
        self.transcript.delete("1.0", "end")
        self.transcript.configure(state="disabled")
        self._write("Nouvelle conversation. La dernière capture reste jointe.\n", "meta")
        self._set_status("Conversation réinitialisée.")

    def _on_effort_changed(self, _event: tk.Event) -> None:
        label = self.effort_var.get()
        for value, text in EFFORT_LEVELS:
            if text == label:
                self.config.effort = value
                break
        if self.session is not None:
            self.session.config = self.config
        save_config(self.config)
        self._set_status(f"Niveau d'analyse : {label}.")

    def _on_close(self) -> None:
        try:
            save_config(self.config)
        finally:
            self.root.destroy()

    # --------------------------------------------------------------- utilitaires

    def _write(self, text: str, tag: str) -> None:
        self.transcript.configure(state="normal")
        self.transcript.insert("end", text, tag)
        self.transcript.configure(state="disabled")
        self.transcript.see("end")

    def _set_status(self, text: str) -> None:
        self.status_var.set(text)

    def _set_busy(self, busy: bool) -> None:
        self._busy = busy
        self.send_button.configure(state="disabled" if busy else "normal")
        if busy:
            self._set_status("Analyse de la capture en cours…")

    def _selected_monitor(self) -> Monitor:
        row = self.monitor_box.current()
        monitor = self.monitors[row] if 0 <= row < len(self.monitors) else self.monitors[0]
        self.config.monitor_index = monitor.index
        return monitor

    def _initial_monitor_row(self) -> int:
        for row, monitor in enumerate(self.monitors):
            if monitor.index == self.config.monitor_index:
                return row
        return 0

    def _primary_monitor(self) -> Monitor | None:
        for monitor in self.monitors:
            if monitor.index == 1:
                return monitor
        return self.monitors[0] if self.monitors else None

    @staticmethod
    def _effort_label(value: str) -> str:
        for effort, label in EFFORT_LEVELS:
            if effort == value:
                return label
        return EFFORT_LEVELS[-1][1]


class SettingsDialog:
    """Petite fenetre modale : cle API, modele, delai de capture, affichage."""

    def __init__(self, parent: tk.Tk, app: ScreenChatApp, focus_key: bool = False) -> None:
        self.app = app
        self.focus_key = focus_key

        self.top = tk.Toplevel(parent)
        self.top.title("Reglages")
        self.top.transient(parent)
        self.top.resizable(False, False)

        body = ttk.Frame(self.top, padding=16)
        body.pack(fill="both", expand=True)
        body.columnconfigure(1, weight=1)

        config = app.config
        self.key_var = tk.StringVar(value="" if config.api_key_from_env else config.api_key)
        self.model_var = tk.StringVar(value=config.model)
        self.delay_var = tk.StringVar(value=f"{config.capture_delay:g}")
        self.edge_var = tk.StringVar(value=str(config.max_image_edge))
        self.thinking_var = tk.BooleanVar(value=config.show_thinking)

        row = 0
        ttk.Label(body, text="Clé API Anthropic", font=(UI_FONT, 10, "bold")).grid(
            row=row, column=0, columnspan=2, sticky="w"
        )
        row += 1
        self.key_entry = ttk.Entry(body, textvariable=self.key_var, show="•", width=46)
        self.key_entry.grid(row=row, column=0, columnspan=2, sticky="ew", pady=(4, 2))
        row += 1
        hint = (
            "Définie par la variable ANTHROPIC_API_KEY (elle a la priorité)."
            if config.api_key_from_env
            else "Clé sk-ant-… depuis console.anthropic.com, enregistrée dans\n"
                 "~/.screenchat/config.json (lisible par toi seul)."
        )
        ttk.Label(body, text=hint, foreground="#777", font=(UI_FONT, 8)).grid(
            row=row, column=0, columnspan=2, sticky="w", pady=(0, 12)
        )

        row += 1
        ttk.Label(body, text="Modèle").grid(row=row, column=0, sticky="w")
        ttk.Entry(body, textvariable=self.model_var, width=28).grid(
            row=row, column=1, sticky="ew", pady=3
        )

        row += 1
        ttk.Label(body, text="Délai avant capture (s)").grid(row=row, column=0, sticky="w")
        ttk.Spinbox(
            body, textvariable=self.delay_var, from_=0.0, to=5.0, increment=0.1, width=8,
        ).grid(row=row, column=1, sticky="w", pady=3)

        row += 1
        ttk.Label(body, text="Taille max envoyée (px)").grid(row=row, column=0, sticky="w")
        ttk.Spinbox(
            body, textvariable=self.edge_var, from_=640, to=2000, increment=64, width=8,
        ).grid(row=row, column=1, sticky="w", pady=3)

        row += 1
        ttk.Checkbutton(
            body, text="Afficher le résumé du raisonnement", variable=self.thinking_var,
        ).grid(row=row, column=0, columnspan=2, sticky="w", pady=(8, 0))

        row += 1
        buttons = ttk.Frame(body)
        buttons.grid(row=row, column=0, columnspan=2, sticky="e", pady=(16, 0))
        ttk.Button(buttons, text="Annuler", command=self.top.destroy).pack(side="right", padx=(8, 0))
        ttk.Button(buttons, text="Enregistrer", command=self._save).pack(side="right")

        self.top.bind("<Return>", lambda _e: self._save())
        self.top.bind("<Escape>", lambda _e: self.top.destroy())

    def show(self) -> None:
        self.top.grab_set()
        if self.focus_key:
            self.key_entry.focus_set()
        self.top.wait_window()

    def _save(self) -> None:
        current = self.app.config
        config = replace(
            current,
            api_key=self.key_var.get().strip(),
            model=self.model_var.get().strip() or current.model,
            show_thinking=bool(self.thinking_var.get()),
            capture_delay=_to_float(self.delay_var.get(), current.capture_delay),
            max_image_edge=int(_to_float(self.edge_var.get(), current.max_image_edge)),
        )

        if not config.resolved_api_key:
            messagebox.showwarning(
                "Clé manquante",
                "Sans clé API, tu peux capturer ton écran mais pas envoyer de question.",
                parent=self.top,
            )

        self.app.apply_settings(config)
        self.top.destroy()


def _to_float(raw: str, fallback: float) -> float:
    try:
        return float(raw.replace(",", "."))
    except ValueError:
        return float(fallback)


def main() -> None:
    root = tk.Tk()
    ScreenChatApp(root)
    root.mainloop()
