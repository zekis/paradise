"""Tests for app.docker_ops — all Docker interactions are mocked."""

import io
import json
import tarfile
from unittest.mock import MagicMock, patch, PropertyMock

import pytest

import docker.errors


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_tar_bytes(filename: str, content: bytes) -> bytes:
    """Build an in-memory tar archive containing a single file."""
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode="w") as tar:
        info = tarfile.TarInfo(name=filename)
        info.size = len(content)
        tar.addfile(info, io.BytesIO(content))
    stream.seek(0)
    return stream.read()


def _chunked_tar(filename: str, content: bytes):
    """Return a list-of-bytes iterable that mimics ``container.get_archive()`` bits."""
    return [_make_tar_bytes(filename, content)]


# ---------------------------------------------------------------------------
# create_nanobot_container
# ---------------------------------------------------------------------------

class TestCreateNanobotContainer:
    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_returns_container_id(self, mock_client):
        mock_container = MagicMock()
        mock_container.id = "container-xyz"
        mock_client.containers.run.return_value = mock_container

        from app.docker_ops import create_nanobot_container
        cid = create_nanobot_container("node-1234-5678", "my-bot")

        assert cid == "container-xyz"
        mock_client.containers.run.assert_called_once()

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_container_name_format(self, mock_client):
        mock_container = MagicMock()
        mock_container.id = "c1"
        mock_client.containers.run.return_value = mock_container

        from app.docker_ops import create_nanobot_container
        create_nanobot_container("abcdefgh-rest", "bot")

        call_kwargs = mock_client.containers.run.call_args
        assert call_kwargs.kwargs["name"] == "nanobot-abcdefgh"

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_labels_set(self, mock_client):
        mock_container = MagicMock()
        mock_container.id = "c1"
        mock_client.containers.run.return_value = mock_container

        from app.docker_ops import create_nanobot_container
        create_nanobot_container("node1234", "bot")

        labels = mock_client.containers.run.call_args.kwargs["labels"]
        assert labels["paradise.node_id"] == "node1234"
        assert labels["paradise.managed"] == "true"


# ---------------------------------------------------------------------------
# stop_nanobot_container
# ---------------------------------------------------------------------------

class TestStopNanobotContainer:
    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_stops_and_removes(self, mock_client):
        mock_container = MagicMock()
        mock_client.containers.get.return_value = mock_container

        from app.docker_ops import stop_nanobot_container
        stop_nanobot_container("cid")

        mock_container.stop.assert_called_once_with(timeout=5)
        mock_container.remove.assert_called_once_with(force=True)

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_not_found_is_silent(self, mock_client):
        mock_client.containers.get.side_effect = docker.errors.NotFound("gone")

        from app.docker_ops import stop_nanobot_container
        stop_nanobot_container("missing")  # should not raise


# ---------------------------------------------------------------------------
# get_container_status
# ---------------------------------------------------------------------------

class TestGetContainerStatus:
    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_returns_actual_status(self, mock_client):
        mock_container = MagicMock()
        mock_container.status = "running"
        mock_client.containers.get.return_value = mock_container

        from app.docker_ops import get_container_status
        assert get_container_status("cid") == "running"

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_not_found_returns_not_found(self, mock_client):
        mock_client.containers.get.side_effect = docker.errors.NotFound("nope")

        from app.docker_ops import get_container_status
        assert get_container_status("cid") == "not_found"

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_api_error_returns_unknown(self, mock_client):
        mock_client.containers.get.side_effect = docker.errors.APIError("fail")

        from app.docker_ops import get_container_status
        assert get_container_status("cid") == "unknown"


# ---------------------------------------------------------------------------
# get_container_logs
# ---------------------------------------------------------------------------

class TestGetContainerLogs:
    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_returns_decoded_logs(self, mock_client):
        mock_container = MagicMock()
        mock_container.logs.return_value = b"2025-01-01T00:00:00 hello\n"
        mock_client.containers.get.return_value = mock_container

        from app.docker_ops import get_container_logs
        logs = get_container_logs("cid", tail=50)
        assert "hello" in logs
        mock_container.logs.assert_called_once_with(tail=50, timestamps=True)

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_not_found_returns_none(self, mock_client):
        mock_client.containers.get.side_effect = docker.errors.NotFound("nope")

        from app.docker_ops import get_container_logs
        assert get_container_logs("cid") is None

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_api_error_returns_none(self, mock_client):
        mock_client.containers.get.side_effect = docker.errors.APIError("fail")

        from app.docker_ops import get_container_logs
        assert get_container_logs("cid") is None


# ---------------------------------------------------------------------------
# get_container_stats
# ---------------------------------------------------------------------------

class TestGetContainerStats:
    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_computes_cpu_and_memory(self, mock_client):
        mock_container = MagicMock()
        mock_container.stats.return_value = {
            "cpu_stats": {
                "cpu_usage": {"total_usage": 200},
                "system_cpu_usage": 1000,
                "online_cpus": 2,
            },
            "precpu_stats": {
                "cpu_usage": {"total_usage": 100},
                "system_cpu_usage": 500,
            },
            "memory_stats": {
                "usage": 50 * 1024 * 1024,   # 50 MB
                "limit": 200 * 1024 * 1024,   # 200 MB
            },
        }
        mock_client.containers.get.return_value = mock_container

        from app.docker_ops import get_container_stats
        stats = get_container_stats("cid")

        assert stats is not None
        # CPU: (200-100)/(1000-500) * 2 * 100 = 40%
        assert stats["cpu_percent"] == 40.0
        assert stats["memory_usage_mb"] == 50.0
        assert stats["memory_limit_mb"] == 200.0
        assert stats["memory_percent"] == 25.0

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_not_found_returns_none(self, mock_client):
        mock_client.containers.get.side_effect = docker.errors.NotFound("nope")

        from app.docker_ops import get_container_stats
        assert get_container_stats("cid") is None

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_missing_key_returns_none(self, mock_client):
        mock_container = MagicMock()
        mock_container.stats.return_value = {}  # missing keys
        mock_client.containers.get.return_value = mock_container

        from app.docker_ops import get_container_stats
        assert get_container_stats("cid") is None


# ---------------------------------------------------------------------------
# restart_nanobot_container
# ---------------------------------------------------------------------------

class TestRestartNanobotContainer:
    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_restarts_container(self, mock_client):
        mock_container = MagicMock()
        mock_client.containers.get.return_value = mock_container

        from app.docker_ops import restart_nanobot_container
        restart_nanobot_container("cid")

        mock_container.restart.assert_called_once_with(timeout=5)

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_not_found_is_silent(self, mock_client):
        mock_client.containers.get.side_effect = docker.errors.NotFound("nope")

        from app.docker_ops import restart_nanobot_container
        restart_nanobot_container("cid")  # should not raise


# ---------------------------------------------------------------------------
# read_nanobot_config
# ---------------------------------------------------------------------------

class TestReadNanobotConfig:
    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_reads_config_json(self, mock_client):
        config_data = {"model": "gpt-4", "temperature": 0.7}
        tar_chunks = _chunked_tar("config.json", json.dumps(config_data).encode())

        mock_container = MagicMock()
        mock_container.get_archive.return_value = (tar_chunks, None)
        mock_client.containers.get.return_value = mock_container

        from app.docker_ops import read_nanobot_config
        result = read_nanobot_config("cid")

        assert result == config_data

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_not_found_returns_none(self, mock_client):
        mock_client.containers.get.side_effect = docker.errors.NotFound("nope")

        from app.docker_ops import read_nanobot_config
        assert read_nanobot_config("cid") is None

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_malformed_json_returns_none(self, mock_client):
        tar_chunks = _chunked_tar("config.json", b"not valid json{{{")

        mock_container = MagicMock()
        mock_container.get_archive.return_value = (tar_chunks, None)
        mock_client.containers.get.return_value = mock_container

        from app.docker_ops import read_nanobot_config
        assert read_nanobot_config("cid") is None

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_api_error_returns_none(self, mock_client):
        mock_container = MagicMock()
        mock_container.get_archive.side_effect = docker.errors.APIError("fail")
        mock_client.containers.get.return_value = mock_container

        from app.docker_ops import read_nanobot_config
        assert read_nanobot_config("cid") is None


# ---------------------------------------------------------------------------
# write_nanobot_config
# ---------------------------------------------------------------------------

class TestWriteNanobotConfig:
    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_writes_tar_archive(self, mock_client):
        mock_container = MagicMock()
        mock_client.containers.get.return_value = mock_container

        from app.docker_ops import write_nanobot_config
        write_nanobot_config("cid", {"key": "value"})

        mock_container.put_archive.assert_called_once()
        call_args = mock_container.put_archive.call_args
        assert call_args[0][0] == "/root/.nanobot"

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_not_found_is_silent(self, mock_client):
        mock_client.containers.get.side_effect = docker.errors.NotFound("nope")

        from app.docker_ops import write_nanobot_config
        write_nanobot_config("cid", {"key": "value"})  # should not raise


# ---------------------------------------------------------------------------
# read_workspace_file
# ---------------------------------------------------------------------------

class TestReadWorkspaceFile:
    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_reads_file_content(self, mock_client):
        tar_chunks = _chunked_tar("SOUL.md", b"# Soul\nI am a nanobot.")

        mock_container = MagicMock()
        mock_container.get_archive.return_value = (tar_chunks, None)
        mock_client.containers.get.return_value = mock_container

        from app.docker_ops import read_workspace_file
        result = read_workspace_file("cid", "SOUL.md")

        assert result == "# Soul\nI am a nanobot."

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_not_found_returns_none(self, mock_client):
        mock_client.containers.get.side_effect = docker.errors.NotFound("nope")

        from app.docker_ops import read_workspace_file
        assert read_workspace_file("cid", "SOUL.md") is None

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_api_error_returns_none(self, mock_client):
        mock_container = MagicMock()
        mock_container.get_archive.side_effect = docker.errors.APIError("fail")
        mock_client.containers.get.return_value = mock_container

        from app.docker_ops import read_workspace_file
        assert read_workspace_file("cid", "SOUL.md") is None


# ---------------------------------------------------------------------------
# write_workspace_file
# ---------------------------------------------------------------------------

class TestWriteWorkspaceFile:
    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_writes_file(self, mock_client):
        mock_container = MagicMock()
        mock_client.containers.get.return_value = mock_container

        from app.docker_ops import write_workspace_file
        write_workspace_file("cid", "SOUL.md", "# Soul\nContent here.")

        mock_container.put_archive.assert_called_once()
        call_args = mock_container.put_archive.call_args
        assert call_args[0][0] == "/root/.nanobot/workspace"

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_not_found_is_silent(self, mock_client):
        mock_client.containers.get.side_effect = docker.errors.NotFound("nope")

        from app.docker_ops import write_workspace_file
        write_workspace_file("cid", "test.md", "content")  # should not raise


# ---------------------------------------------------------------------------
# list_workspace_files
# ---------------------------------------------------------------------------

class TestListWorkspaceFiles:
    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_returns_sorted_filenames(self, mock_client):
        mock_container = MagicMock()
        mock_container.exec_run.return_value = (0, b"SOUL.md\nAGENTS.md\nUSER.md\n")
        mock_client.containers.get.return_value = mock_container

        from app.docker_ops import list_workspace_files
        result = list_workspace_files("cid")

        assert result == ["AGENTS.md", "SOUL.md", "USER.md"]

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_filters_out_dotdot(self, mock_client):
        mock_container = MagicMock()
        mock_container.exec_run.return_value = (0, b"SOUL.md\n../evil\ngood.md\n")
        mock_client.containers.get.return_value = mock_container

        from app.docker_ops import list_workspace_files
        result = list_workspace_files("cid")

        assert "../evil" not in result
        assert "SOUL.md" in result
        assert "good.md" in result

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_nonzero_exit_returns_empty(self, mock_client):
        mock_container = MagicMock()
        mock_container.exec_run.return_value = (1, b"error output")
        mock_client.containers.get.return_value = mock_container

        from app.docker_ops import list_workspace_files
        result = list_workspace_files("cid")

        assert result == []

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_not_found_returns_none(self, mock_client):
        mock_client.containers.get.side_effect = docker.errors.NotFound("nope")

        from app.docker_ops import list_workspace_files
        assert list_workspace_files("cid") is None


# ---------------------------------------------------------------------------
# run_container_command
# ---------------------------------------------------------------------------

class TestRunContainerCommand:
    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_runs_bash_command(self, mock_client):
        mock_container = MagicMock()
        mock_container.exec_run.return_value = (0, b"hello world\n")
        mock_client.containers.get.return_value = mock_container

        from app.docker_ops import run_container_command
        exit_code, stdout = run_container_command("cid", "echo hello world")

        assert exit_code == 0
        assert "hello world" in stdout
        call_args = mock_container.exec_run.call_args
        assert call_args[0][0] == ["bash", "-c", "echo hello world"]

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_not_found_raises(self, mock_client):
        mock_client.containers.get.side_effect = docker.errors.NotFound("nope")

        from app.docker_ops import run_container_command
        with pytest.raises(docker.errors.NotFound):
            run_container_command("cid", "ls")


# ---------------------------------------------------------------------------
# write_workspace_files_batch
# ---------------------------------------------------------------------------

class TestWriteWorkspaceFilesBatch:
    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_writes_multiple_files(self, mock_client):
        mock_container = MagicMock()
        mock_client.containers.get.return_value = mock_container

        from app.docker_ops import write_workspace_files_batch
        write_workspace_files_batch("cid", {
            "SOUL.md": "soul content",
            "AGENTS.md": "agents content",
        })

        mock_container.put_archive.assert_called_once()

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_empty_dict_is_noop(self, mock_client):
        from app.docker_ops import write_workspace_files_batch
        write_workspace_files_batch("cid", {})
        mock_client.containers.get.assert_not_called()

    @patch("app.docker_ops.DOCKER_CLIENT")
    def test_not_found_is_silent(self, mock_client):
        mock_client.containers.get.side_effect = docker.errors.NotFound("nope")

        from app.docker_ops import write_workspace_files_batch
        write_workspace_files_batch("cid", {"f.txt": "data"})  # should not raise
