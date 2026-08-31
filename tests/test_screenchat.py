"""Tests unitaires de ScreenChat (aucun appel reseau, aucune fenetre ouverte)."""

from __future__ import annotations

import base64
import copy
import io
import unittest
from types import SimpleNamespace

from PIL import Image

from screenchat.capture import MAX_RAW_BYTES, encode_for_api
from screenchat.claude_client import OLD_IMAGE_PLACEHOLDER, ScreenChatSession
from screenchat.config import Config
from screenchat.capture import EncodedImage, Monitor
from screenchat.geometry import clamp_scale, logical_bounds, to_image_box


def make_image(width: int, height: int, noisy: bool = False) -> Image.Image:
    """Image de test ; `noisy` produit un contenu difficile a compresser."""
    if not noisy:
        return Image.new("RGB", (width, height), (30, 60, 120))
    import random

    random.seed(1234)
    image = Image.new("RGB", (width, height))
    image.putdata([
        (random.randrange(256), random.randrange(256), random.randrange(256))
        for _ in range(width * height)
    ])
    return image


def fake_encoded() -> EncodedImage:
    return EncodedImage(media_type="image/png", data="AAAA", width=10, height=10, byte_size=4)


class FakeStream:
    """Imite le gestionnaire de contexte renvoye par `messages.stream`."""

    def __init__(self, events, final):
        self._events = events
        self._final = final

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False

    def __iter__(self):
        return iter(self._events)

    def get_final_message(self):
        return self._final


def text_delta(text: str):
    return SimpleNamespace(type="content_block_delta", delta=SimpleNamespace(type="text_delta", text=text))


def thinking_delta(text: str):
    return SimpleNamespace(
        type="content_block_delta", delta=SimpleNamespace(type="thinking_delta", thinking=text)
    )


def final_message(text: str = "Bonjour", stop_reason: str = "end_turn"):
    return SimpleNamespace(
        content=[SimpleNamespace(type="text", text=text)],
        stop_reason=stop_reason,
        stop_details=None,
        usage=SimpleNamespace(
            input_tokens=1200, output_tokens=80,
            cache_read_input_tokens=1000, cache_creation_input_tokens=0,
        ),
    )


class FakeClient:
    """Client minimal : enregistre les parametres envoyes et rejoue un flux fige."""

    def __init__(self, events=None, final=None, error: Exception | None = None):
        self.calls: list[dict] = []
        self._events = events or [text_delta("Bonjour")]
        self._final = final or final_message()
        self._error = error
        self.beta = SimpleNamespace(messages=SimpleNamespace(stream=self._stream))
        self.messages = SimpleNamespace(stream=self._stream)

    def _stream(self, **kwargs):
        # Copie : la session reutilise la meme liste de messages d'un appel a
        # l'autre, on veut figer ce qui a reellement ete envoye.
        self.calls.append(copy.deepcopy(kwargs))
        if self._error is not None:
            raise self._error
        return FakeStream(self._events, self._final)


def make_session(client: FakeClient, **overrides) -> ScreenChatSession:
    config = Config(api_key="sk-ant-test", **overrides)
    session = ScreenChatSession(config)
    session._client = client
    return session


class EncodeTests(unittest.TestCase):
    def test_downscale_to_max_edge(self):
        encoded = encode_for_api(make_image(3840, 2160), max_edge=1568)
        self.assertEqual(encoded.width, 1568)
        self.assertEqual(encoded.height, 882)          # ratio conserve
        self.assertEqual(encoded.media_type, "image/png")

    def test_small_image_is_not_upscaled(self):
        encoded = encode_for_api(make_image(800, 600), max_edge=1568)
        self.assertEqual((encoded.width, encoded.height), (800, 600))

    def test_base64_decodes_to_a_readable_image(self):
        encoded = encode_for_api(make_image(400, 300), max_edge=1568)
        restored = Image.open(io.BytesIO(base64.standard_b64decode(encoded.data)))
        self.assertEqual(restored.size, (400, 300))

    def test_large_noisy_capture_falls_back_to_jpeg_within_limit(self):
        encoded = encode_for_api(make_image(2200, 1400, noisy=True), max_edge=2200)
        self.assertEqual(encoded.media_type, "image/jpeg")
        self.assertLessEqual(encoded.byte_size, MAX_RAW_BYTES)


class ConversationTests(unittest.TestCase):
    def test_question_carries_the_attached_screenshot(self):
        client = FakeClient()
        session = make_session(client)
        session.attach_screenshot(fake_encoded())
        session.ask("Que vois-tu ?", lambda *_: None)

        blocks = client.calls[0]["messages"][0]["content"]
        self.assertEqual(blocks[0]["type"], "image")
        self.assertEqual(blocks[0]["source"]["data"], "AAAA")
        self.assertEqual(blocks[1], {"type": "text", "text": "Que vois-tu ?"})
        self.assertFalse(session.has_pending_image)   # consommee par la question

    def test_streamed_chunks_reach_the_callback(self):
        client = FakeClient(events=[thinking_delta("hmm"), text_delta("Bon"), text_delta("jour")])
        session = make_session(client)
        seen: list[tuple[str, object]] = []
        session.ask("Salut", lambda kind, payload: seen.append((kind, payload)))

        self.assertEqual([k for k, _ in seen], ["thinking", "text", "text", "done"])
        self.assertEqual("".join(str(p) for k, p in seen if k == "text"), "Bonjour")
        self.assertEqual(seen[-1][1].cache_read_tokens, 1000)

    def test_assistant_reply_is_kept_for_follow_up_questions(self):
        client = FakeClient()
        session = make_session(client)
        session.ask("Premiere", lambda *_: None)
        session.ask("Seconde", lambda *_: None)

        roles = [m["role"] for m in session.history]
        self.assertEqual(roles, ["user", "assistant", "user", "assistant"])
        self.assertEqual(len(client.calls[1]["messages"]), 3)

    def test_failed_question_is_removed_from_history(self):
        client = FakeClient(error=RuntimeError("reseau coupe"))
        session = make_session(client)
        seen: list[tuple[str, object]] = []
        session.ask("Question", lambda kind, payload: seen.append((kind, payload)))

        self.assertEqual(seen[0][0], "error")
        self.assertIn("reseau coupe", str(seen[0][1]))
        self.assertEqual(session.history, [])

    def test_refusal_is_reported(self):
        client = FakeClient(final=final_message(stop_reason="refusal"))
        session = make_session(client)
        seen: list[tuple[str, object]] = []
        session.ask("Question", lambda kind, payload: seen.append((kind, payload)))
        self.assertIn("décliné", str(dict(seen).get("error", "")))

    def test_server_side_fallbacks_are_requested(self):
        client = FakeClient()
        session = make_session(client)
        session.ask("Question", lambda *_: None)
        self.assertEqual(client.calls[0]["fallbacks"], "default")
        self.assertIn("server-side-fallback-2026-07-01", client.calls[0]["betas"])

    def test_effort_and_adaptive_thinking_are_sent(self):
        client = FakeClient()
        session = make_session(client, effort="medium")
        session.ask("Question", lambda *_: None)
        self.assertEqual(client.calls[0]["output_config"], {"effort": "medium"})
        self.assertEqual(client.calls[0]["thinking"]["type"], "adaptive")


class ContextTests(unittest.TestCase):
    def test_only_recent_screenshots_are_resent(self):
        client = FakeClient()
        session = make_session(client, max_history_images=1)
        for question in ("Un", "Deux"):
            session.attach_screenshot(fake_encoded())
            session.ask(question, lambda *_: None)

        sent = client.calls[1]["messages"]
        images = [b for m in sent for b in m["content"] if isinstance(b, dict) and b.get("type") == "image"]
        placeholders = [
            b for m in sent for b in m["content"]
            if isinstance(b, dict) and b.get("text") == OLD_IMAGE_PLACEHOLDER
        ]
        self.assertEqual(len(images), 1)          # seule la capture la plus recente
        self.assertEqual(len(placeholders), 1)    # l'ancienne est remplacee par un repere

    def test_history_is_trimmed_and_starts_with_a_user_message(self):
        client = FakeClient()
        session = make_session(client, max_history_messages=4)
        for i in range(5):
            session.ask(f"Question {i}", lambda *_: None)

        self.assertLessEqual(len(session.history), 5)
        self.assertEqual(client.calls[-1]["messages"][0]["role"], "user")

    def test_cache_breakpoint_sits_on_the_latest_image_only(self):
        client = FakeClient()
        session = make_session(client, max_history_images=5)
        for question in ("Un", "Deux"):
            session.attach_screenshot(fake_encoded())
            session.ask(question, lambda *_: None)

        images = [
            b for m in client.calls[1]["messages"] for b in m["content"]
            if isinstance(b, dict) and b.get("type") == "image"
        ]
        self.assertEqual(len(images), 2)
        self.assertNotIn("cache_control", images[0])
        self.assertEqual(images[1]["cache_control"], {"type": "ephemeral"})


class RegionTests(unittest.TestCase):
    """Conversion coordonnees-fenetre -> pixels de l'image, et placement de la fenetre."""

    def test_maps_selection_back_to_image_pixels(self):
        # Image 1920x1080 affichee a 50 %, centree avec 100 px de marge a gauche.
        box = to_image_box((200.0, 100.0), (400.0, 300.0), (100.0, 0.0), 0.5, (1920, 1080))
        self.assertEqual(box, (200, 200, 600, 600))

    def test_selection_is_clamped_to_the_image(self):
        box = to_image_box((-50.0, -80.0), (2000.0, 2000.0), (0.0, 0.0), 1.0, (800, 600))
        self.assertEqual(box, (0, 0, 800, 600))

    def test_reversed_drag_is_normalised(self):
        box = to_image_box((300.0, 400.0), (100.0, 200.0), (0.0, 0.0), 1.0, (800, 600))
        self.assertEqual(box, (100, 200, 300, 400))

    def test_empty_selection_is_rejected(self):
        self.assertIsNone(to_image_box((10.0, 10.0), (10.0, 10.0), (0.0, 0.0), 1.0, (800, 600)))

    def test_window_bounds_account_for_display_scaling(self):
        monitor = Monitor(index=1, left=0, top=0, width=3840, height=2160, label="Ecran 1")
        self.assertEqual(logical_bounds(monitor, 2.0), (0, 0, 1920, 1080))

    def test_absurd_scale_estimate_falls_back_to_one(self):
        self.assertEqual(clamp_scale(3840, 1920), 2.0)
        self.assertEqual(clamp_scale(3840, 100), 1.0)   # estimation aberrante
        self.assertEqual(clamp_scale(1920, 0), 1.0)     # largeur logique inconnue


class ConfigTests(unittest.TestCase):
    def test_environment_key_wins_over_stored_key(self):
        import os

        config = Config(api_key="depuis-le-fichier")
        previous = os.environ.get("ANTHROPIC_API_KEY")
        os.environ["ANTHROPIC_API_KEY"] = "depuis-l-environnement"
        try:
            self.assertEqual(config.resolved_api_key, "depuis-l-environnement")
            self.assertTrue(config.api_key_from_env)
        finally:
            if previous is None:
                del os.environ["ANTHROPIC_API_KEY"]
            else:
                os.environ["ANTHROPIC_API_KEY"] = previous


if __name__ == "__main__":
    unittest.main()
