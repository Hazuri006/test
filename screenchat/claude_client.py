"""Dialogue avec l'API Claude : conversation, streaming, gestion des erreurs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

import anthropic

from .capture import EncodedImage
from .config import SYSTEM_PROMPT, Config

MAX_TOKENS = 16_000
FALLBACK_BETA = "server-side-fallback-2026-07-01"

# Remplace le contenu des captures les plus anciennes pour ne pas renvoyer
# toutes les images de la conversation a chaque question.
OLD_IMAGE_PLACEHOLDER = "[capture d'écran plus ancienne, retirée de l'historique]"

Emit = Callable[[str, Any], None]
"""Callback appele depuis le thread de travail : emit(kind, payload).

kind vaut "thinking", "text", "done" ou "error".
"""


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0

    def summary(self) -> str:
        parts = [f"{self.input_tokens} jetons entrants", f"{self.output_tokens} sortants"]
        if self.cache_read_tokens:
            parts.append(f"{self.cache_read_tokens} lus en cache")
        if self.cache_write_tokens:
            parts.append(f"{self.cache_write_tokens} mis en cache")
        return " · ".join(parts)


class ScreenChatSession:
    """Une conversation avec Claude, a laquelle on attache des captures d'ecran."""

    def __init__(self, config: Config) -> None:
        self.config = config
        self._client = anthropic.Anthropic(api_key=config.resolved_api_key)
        self._messages: list[dict[str, Any]] = []
        self._pending_image: EncodedImage | None = None
        # Les replis serveur ne sont pas ouverts sur tous les comptes : on
        # bascule sur l'appel standard si l'API les refuse.
        self._fallbacks_enabled = True

    # ------------------------------------------------------------------ etat

    def reset(self) -> None:
        """Repart d'une conversation vide (les captures deja envoyees sont oubliees)."""
        self._messages.clear()
        self._pending_image = None

    def attach_screenshot(self, image: EncodedImage) -> None:
        """Joint une capture a la prochaine question posee."""
        self._pending_image = image

    @property
    def has_pending_image(self) -> bool:
        return self._pending_image is not None

    @property
    def history(self) -> list[dict[str, Any]]:
        """Les messages echanges, pour transferer la conversation a une nouvelle session."""
        return self._messages

    @history.setter
    def history(self, messages: list[dict[str, Any]]) -> None:
        self._messages = list(messages)

    @property
    def turn_count(self) -> int:
        return sum(1 for m in self._messages if m.get("role") == "user")

    # ---------------------------------------------------------------- requete

    def ask(self, question: str, emit: Emit) -> None:
        """Envoie la question (et la capture en attente) puis diffuse la reponse.

        Concu pour tourner dans un thread de travail : tout passe par `emit`.
        """
        content: list[dict[str, Any]] = []
        if self._pending_image is not None:
            content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": self._pending_image.media_type,
                        "data": self._pending_image.data,
                    },
                }
            )
        content.append({"type": "text", "text": question})

        self._messages.append({"role": "user", "content": content})
        self._prune_history()
        self._apply_cache_breakpoint()

        try:
            final = self._stream(emit)
        except Exception as exc:  # noqa: BLE001 - traduit en message pour l'interface
            # La question n'a pas abouti : on la retire pour ne pas polluer la suite.
            self._messages.pop()
            emit("error", _describe_error(exc))
            return

        self._pending_image = None
        self._messages.append({"role": "assistant", "content": final.content})

        if final.stop_reason == "refusal":
            details = getattr(final, "stop_details", None)
            reason = getattr(details, "explanation", None) or "aucune précision donnée"
            emit("error", f"Claude a décliné cette demande ({reason}).")

        emit(
            "done",
            Usage(
                input_tokens=getattr(final.usage, "input_tokens", 0) or 0,
                output_tokens=getattr(final.usage, "output_tokens", 0) or 0,
                cache_read_tokens=getattr(final.usage, "cache_read_input_tokens", 0) or 0,
                cache_write_tokens=getattr(final.usage, "cache_creation_input_tokens", 0) or 0,
            ),
        )

    def _stream(self, emit: Emit):
        params: dict[str, Any] = {
            "model": self.config.model,
            "max_tokens": MAX_TOKENS,
            "system": SYSTEM_PROMPT,
            "messages": self._messages,
            "thinking": {"type": "adaptive", "display": "summarized"},
            "output_config": {"effort": self.config.effort},
        }

        if self._fallbacks_enabled:
            try:
                return self._consume(
                    self._client.beta.messages.stream(
                        **params, betas=[FALLBACK_BETA], fallbacks="default"
                    ),
                    emit,
                )
            except anthropic.BadRequestError as exc:
                if not _is_fallback_rejection(exc):
                    raise
                # Compte sans repli serveur : on reessaie une fois sans, et on
                # ne retente plus pour les questions suivantes.
                self._fallbacks_enabled = False

        return self._consume(self._client.messages.stream(**params), emit)

    @staticmethod
    def _consume(stream_ctx, emit: Emit):
        with stream_ctx as stream:
            for event in stream:
                if event.type != "content_block_delta":
                    continue
                if event.delta.type == "thinking_delta":
                    emit("thinking", event.delta.thinking)
                elif event.delta.type == "text_delta":
                    emit("text", event.delta.text)
            return stream.get_final_message()

    # --------------------------------------------------------------- contexte

    def _prune_history(self) -> None:
        """Borne la taille de la conversation renvoyee a chaque requete."""
        limit = max(2, self.config.max_history_messages)
        if len(self._messages) > limit:
            self._messages = self._messages[-limit:]
            while self._messages and self._messages[0].get("role") != "user":
                self._messages.pop(0)

        kept = 0
        for message in reversed(self._messages):
            blocks = message.get("content")
            if not isinstance(blocks, list):
                continue
            rebuilt: list[Any] = []
            for block in blocks:
                if _is_image_block(block):
                    kept += 1
                    if kept > max(1, self.config.max_history_images):
                        rebuilt.append({"type": "text", "text": OLD_IMAGE_PLACEHOLDER})
                        continue
                rebuilt.append(block)
            message["content"] = rebuilt

    def _apply_cache_breakpoint(self) -> None:
        """Place le point de cache sur la derniere image.

        Les questions de suivi reutilisent ainsi le prefixe (systeme + historique
        + capture) au lieu de le refacturer plein tarif a chaque fois.
        """
        last_image: dict[str, Any] | None = None
        for message in self._messages:
            blocks = message.get("content")
            if not isinstance(blocks, list):
                continue
            for block in blocks:
                if _is_image_block(block):
                    block.pop("cache_control", None)
                    last_image = block
        if last_image is not None:
            last_image["cache_control"] = {"type": "ephemeral"}


def _is_image_block(block: Any) -> bool:
    return isinstance(block, dict) and block.get("type") == "image"


def _is_fallback_rejection(exc: anthropic.BadRequestError) -> bool:
    message = str(exc).lower()
    return "fallback" in message or FALLBACK_BETA in message or "beta" in message


def _describe_error(exc: Exception) -> str:
    """Traduit une exception du SDK en message lisible dans l'interface."""
    if isinstance(exc, anthropic.AuthenticationError):
        return (
            "Clé API refusée. Vérifie ANTHROPIC_API_KEY ou saisis-la de nouveau "
            "dans Réglages."
        )
    if isinstance(exc, anthropic.PermissionDeniedError):
        return "Accès refusé : ce compte n'a pas accès à ce modèle."
    if isinstance(exc, anthropic.NotFoundError):
        return "Modèle introuvable. Vérifie le nom du modèle dans Réglages."
    if isinstance(exc, anthropic.RateLimitError):
        return "Limite de débit atteinte. Patiente quelques secondes puis réessaie."
    if isinstance(exc, anthropic.APIStatusError):
        return f"Erreur de l'API (HTTP {exc.status_code}) : {exc.message}"
    if isinstance(exc, anthropic.APITimeoutError):
        return "Délai dépassé. La réponse a mis trop de temps à arriver."
    if isinstance(exc, anthropic.APIConnectionError):
        return "Connexion impossible à l'API. Vérifie ton accès réseau."
    return f"Erreur inattendue : {exc}"
