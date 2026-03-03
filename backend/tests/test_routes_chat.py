"""Tests for app.routes.chat — message helpers, truncation, storage, relay logic."""

import json
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.routes.chat import (
    ExecRequest,
    RunCommandRequest,
    _nanobot_ws_url,
    _store_error,
    _store_response,
    _store_tool_call,
    _store_user_message,
    _truncate,
    _CONNECT_ERROR_PHRASES,
)


# ---------------------------------------------------------------------------
# Pydantic model tests
# ---------------------------------------------------------------------------

class TestExecRequest:
    def test_defaults(self):
        req = ExecRequest(content="hello")
        assert req.content == "hello"
        assert req.session_key is None

    def test_with_session_key(self):
        req = ExecRequest(content="cmd", session_key="sk-123")
        assert req.session_key == "sk-123"


class TestRunCommandRequest:
    def test_basic(self):
        req = RunCommandRequest(command="ls -la")
        assert req.command == "ls -la"


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

class TestNanobotWsUrl:
    def test_url_format(self):
        class FakeNode:
            id = uuid.UUID("12345678-1234-1234-1234-123456789abc")
        url = _nanobot_ws_url(FakeNode())
        assert url == "ws://nanobot-12345678:18790"

    def test_uses_first_8_chars(self):
        class FakeNode:
            id = uuid.UUID("abcdefab-0000-0000-0000-000000000000")
        url = _nanobot_ws_url(FakeNode())
        assert "nanobot-abcdefab" in url


class TestTruncate:
    def test_short_text_unchanged(self):
        assert _truncate("hello") == "hello"

    def test_long_text_truncated(self):
        text = "a" * 100
        result = _truncate(text, limit=80)
        assert len(result) == 83  # 80 + "..."
        assert result.endswith("...")

    def test_exact_limit_unchanged(self):
        text = "a" * 80
        assert _truncate(text, limit=80) == text

    def test_custom_limit(self):
        text = "hello world"
        result = _truncate(text, limit=5)
        assert result == "hello..."


# ---------------------------------------------------------------------------
# Message storage functions
# ---------------------------------------------------------------------------

class TestStoreUserMessage:
    @pytest.mark.asyncio
    async def test_stores_user_message(self):
        fake_session = MagicMock()
        fake_session.add = MagicMock()
        fake_session.commit = AsyncMock()
        fake_session.__aenter__ = AsyncMock(return_value=fake_session)
        fake_session.__aexit__ = AsyncMock(return_value=False)

        node_id = uuid.uuid4()
        parsed = {"content": "Hello bot", "message_type": "chat", "display_content": None}

        with patch("app.routes.chat.async_session", return_value=fake_session):
            await _store_user_message(node_id, parsed)

        fake_session.add.assert_called_once()
        msg = fake_session.add.call_args[0][0]
        assert msg.role == "user"
        assert msg.content == "Hello bot"
        assert msg.node_id == node_id

    @pytest.mark.asyncio
    async def test_stores_display_content(self):
        fake_session = MagicMock()
        fake_session.add = MagicMock()
        fake_session.commit = AsyncMock()
        fake_session.__aenter__ = AsyncMock(return_value=fake_session)
        fake_session.__aexit__ = AsyncMock(return_value=False)

        parsed = {"content": "raw", "display_content": "formatted"}

        with patch("app.routes.chat.async_session", return_value=fake_session):
            await _store_user_message(uuid.uuid4(), parsed)

        msg = fake_session.add.call_args[0][0]
        assert msg.display_content == "formatted"


class TestStoreResponse:
    @pytest.mark.asyncio
    async def test_stores_assistant_response(self):
        fake_session = MagicMock()
        fake_session.add = MagicMock()
        fake_session.commit = AsyncMock()
        fake_session.__aenter__ = AsyncMock(return_value=fake_session)
        fake_session.__aexit__ = AsyncMock(return_value=False)

        with patch("app.routes.chat.async_session", return_value=fake_session), \
             patch("app.routes.chat.emit_event", new_callable=AsyncMock):
            await _store_response(uuid.uuid4(), "bot-name", "The answer is 42")

        msg = fake_session.add.call_args[0][0]
        assert msg.role == "assistant"
        assert msg.content == "The answer is 42"


class TestStoreToolCall:
    @pytest.mark.asyncio
    async def test_stores_tool_call_message(self):
        fake_session = MagicMock()
        fake_session.add = MagicMock()
        fake_session.commit = AsyncMock()
        fake_session.__aenter__ = AsyncMock(return_value=fake_session)
        fake_session.__aexit__ = AsyncMock(return_value=False)

        with patch("app.routes.chat.async_session", return_value=fake_session), \
             patch("app.routes.chat.emit_event", new_callable=AsyncMock):
            await _store_tool_call(uuid.uuid4(), "bot", "Using tool X")

        msg = fake_session.add.call_args[0][0]
        assert msg.role == "assistant"
        assert msg.message_type == "tool_call"


class TestStoreError:
    @pytest.mark.asyncio
    async def test_stores_non_transient_error(self):
        fake_session = MagicMock()
        fake_session.add = MagicMock()
        fake_session.commit = AsyncMock()
        fake_session.__aenter__ = AsyncMock(return_value=fake_session)
        fake_session.__aexit__ = AsyncMock(return_value=False)

        with patch("app.routes.chat.async_session", return_value=fake_session), \
             patch("app.routes.chat.emit_event", new_callable=AsyncMock):
            await _store_error(uuid.uuid4(), "bot", "Something broke")

        fake_session.add.assert_called_once()
        msg = fake_session.add.call_args[0][0]
        assert msg.message_type == "error"
        assert "Something broke" in msg.content

    @pytest.mark.asyncio
    async def test_skips_connection_errors(self):
        """Transient connection errors should NOT be stored."""
        fake_session = MagicMock()
        fake_session.add = MagicMock()
        fake_session.__aenter__ = AsyncMock(return_value=fake_session)
        fake_session.__aexit__ = AsyncMock(return_value=False)

        with patch("app.routes.chat.async_session", return_value=fake_session):
            await _store_error(uuid.uuid4(), "bot", "Cannot connect to host")

        fake_session.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_connection_refused(self):
        fake_session = MagicMock()
        fake_session.add = MagicMock()
        fake_session.__aenter__ = AsyncMock(return_value=fake_session)
        fake_session.__aexit__ = AsyncMock(return_value=False)

        with patch("app.routes.chat.async_session", return_value=fake_session):
            await _store_error(uuid.uuid4(), "bot", "Connection refused by server")

        fake_session.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_name_resolution_errors(self):
        fake_session = MagicMock()
        fake_session.add = MagicMock()
        fake_session.__aenter__ = AsyncMock(return_value=fake_session)
        fake_session.__aexit__ = AsyncMock(return_value=False)

        with patch("app.routes.chat.async_session", return_value=fake_session):
            await _store_error(uuid.uuid4(), "bot", "Name resolution failed for host")

        fake_session.add.assert_not_called()


class TestConnectErrorPhrases:
    def test_phrases_are_lowercase(self):
        """All phrases should be lowercase since we compare with .lower()."""
        for phrase in _CONNECT_ERROR_PHRASES:
            assert phrase == phrase.lower()
