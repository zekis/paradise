"""Docker operations for nanobot container lifecycle.

Error-handling convention
-------------------------
* **Read helpers** (``get_container_status``, ``get_container_logs``,
  ``get_container_stats``, ``read_nanobot_config``, ``read_workspace_file``,
  ``list_workspace_files``) return ``None`` (or a sentinel string such as
  ``"not_found"``/``"unknown"``) when the container is missing or the
  Docker API fails.  All failures are logged at DEBUG or WARNING level.

* **Write helpers** (``write_nanobot_config``, ``write_workspace_file``,
  ``write_workspace_files_batch``) are best-effort: errors are logged at
  WARNING level but **not** raised, because callers cannot meaningfully
  recover from a write failure on a potentially-vanished container.

* **Lifecycle helpers** (``create_nanobot_container``,
  ``stop_nanobot_container``, ``restart_nanobot_container``) let
  ``docker.errors.APIError`` propagate for creation (callers handle
  setup failures), but swallow ``NotFound``/``APIError`` for stop and
  restart since the container may already be gone.

* **run_container_command** lets all Docker exceptions propagate so the
  caller can decide how to handle them.
"""

import json
import io
import logging
import os
import tarfile

import docker

logger = logging.getLogger(__name__)

DOCKER_CLIENT = docker.from_env()
PARADISE_NETWORK = os.environ.get("PARADISE_NETWORK", "paradise_paradise")
NANOBOT_IMAGE = os.environ.get("NANOBOT_IMAGE", "paradise-nanobot")


def create_nanobot_container(node_id: str, name: str) -> str:
    """Spin up a new nanobot container. Returns the container ID."""
    container_name = f"nanobot-{node_id[:8]}"
    volume_name = f"paradise_nanobot_{node_id[:8]}"
    ssh_volume_name = f"paradise_nanobot_{node_id[:8]}_ssh"

    container = DOCKER_CLIENT.containers.run(
        NANOBOT_IMAGE,
        name=container_name,
        detach=True,
        labels={
            "paradise.node_id": node_id,
            "paradise.managed": "true",
        },
        volumes={
            volume_name: {"bind": "/root/.nanobot", "mode": "rw"},
            ssh_volume_name: {"bind": "/root/.ssh", "mode": "rw"},
        },
        environment={
            "PARADISE_NODE_ID": node_id,
            "PARADISE_BACKEND_URL": "http://backend:8000",
        },
        network=PARADISE_NETWORK,
        restart_policy={"Name": "unless-stopped"},
    )
    return container.id


def stop_nanobot_container(container_id: str) -> None:
    """Also removes the container after stopping it."""
    try:
        container = DOCKER_CLIENT.containers.get(container_id)
        container.stop(timeout=5)
        container.remove(force=True)
    except docker.errors.NotFound:
        logger.debug("Container %s not found during stop/remove (already removed?)", container_id)


def get_container_status(container_id: str) -> str:
    """Return the container status string, or ``'not_found'`` if missing."""
    try:
        container = DOCKER_CLIENT.containers.get(container_id)
        return container.status
    except docker.errors.NotFound:
        return "not_found"
    except docker.errors.APIError:
        logger.warning("Docker API error fetching status for container %s", container_id, exc_info=True)
        return "unknown"


def get_container_logs(container_id: str, tail: int = 100) -> str | None:
    """Return recent container logs, or ``None`` if the container is missing."""
    try:
        container = DOCKER_CLIENT.containers.get(container_id)
        return container.logs(tail=tail, timestamps=True).decode("utf-8", errors="replace")
    except docker.errors.NotFound:
        return None
    except docker.errors.APIError:
        logger.warning("Docker API error fetching logs for container %s", container_id, exc_info=True)
        return None


def get_container_stats(container_id: str) -> dict | None:
    """Return CPU/memory stats for a container, or ``None`` if unavailable.

    Returns ``None`` when the container is missing or the stats response
    lacks the expected keys (e.g. the container just started).
    """
    try:
        container = DOCKER_CLIENT.containers.get(container_id)
        stats = container.stats(stream=False)
        # Extract useful metrics
        cpu_delta = stats["cpu_stats"]["cpu_usage"]["total_usage"] - stats["precpu_stats"]["cpu_usage"]["total_usage"]
        system_delta = stats["cpu_stats"]["system_cpu_usage"] - stats["precpu_stats"]["system_cpu_usage"]
        num_cpus = stats["cpu_stats"].get("online_cpus", 1)
        cpu_percent = (cpu_delta / system_delta) * num_cpus * 100 if system_delta > 0 else 0

        mem_usage = stats["memory_stats"].get("usage", 0)
        mem_limit = stats["memory_stats"].get("limit", 1)
        mem_percent = (mem_usage / mem_limit) * 100

        return {
            "cpu_percent": round(cpu_percent, 2),
            "memory_usage_mb": round(mem_usage / (1024 * 1024), 1),
            "memory_limit_mb": round(mem_limit / (1024 * 1024), 1),
            "memory_percent": round(mem_percent, 2),
        }
    except docker.errors.NotFound:
        logger.debug("Container %s not found when fetching stats", container_id)
        return None
    except KeyError:
        logger.debug("Incomplete stats response for container %s (container may still be starting)", container_id)
        return None
    except docker.errors.APIError:
        logger.warning("Docker API error fetching stats for container %s", container_id, exc_info=True)
        return None


def restart_nanobot_container(container_id: str) -> None:
    """Restart a nanobot container.

    Logs and returns silently when the container is not found or the
    Docker API returns an error -- the caller is expected to check
    container status separately if needed.
    """
    try:
        container = DOCKER_CLIENT.containers.get(container_id)
        container.restart(timeout=5)
    except docker.errors.NotFound:
        logger.debug("Container %s not found during restart", container_id)
    except docker.errors.APIError:
        logger.warning("Docker API error restarting container %s", container_id, exc_info=True)


CONFIG_PATH = "/root/.nanobot/config.json"


def read_nanobot_config(container_id: str) -> dict | None:
    """Read config.json from inside a container via the Docker archive API.

    Returns the parsed config dict, or ``None`` when the container or file is
    missing.
    """
    try:
        container = DOCKER_CLIENT.containers.get(container_id)
        bits, _ = container.get_archive(CONFIG_PATH)
        stream = io.BytesIO()
        for chunk in bits:
            stream.write(chunk)
        stream.seek(0)
        with tarfile.open(fileobj=stream) as tar:
            member = tar.getmembers()[0]
            f = tar.extractfile(member)
            if f:
                return json.loads(f.read())
        return None
    except docker.errors.NotFound:
        return None
    except docker.errors.APIError:
        logger.warning("Docker API error reading config from container %s", container_id, exc_info=True)
        return None
    except (KeyError, json.JSONDecodeError) as exc:
        logger.warning("Malformed config.json in container %s: %s", container_id, exc)
        return None


def write_nanobot_config(container_id: str, config: dict) -> None:
    """Write config.json into a container via the Docker archive API."""
    try:
        container = DOCKER_CLIENT.containers.get(container_id)
        data = json.dumps(config, indent=2).encode()
        # Create a tar archive in memory
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode="w") as tar:
            info = tarfile.TarInfo(name="config.json")
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
        stream.seek(0)
        container.put_archive("/root/.nanobot", stream)
    except (docker.errors.NotFound, docker.errors.APIError):
        logger.warning("Failed to write config to container %s", container_id, exc_info=True)


WORKSPACE_PATH = "/root/.nanobot/workspace"


def read_workspace_file(container_id: str, filename: str) -> str | None:
    """Read a file from the container workspace.

    Returns the file content as a string, or ``None`` when the container or
    file does not exist.
    """
    try:
        container = DOCKER_CLIENT.containers.get(container_id)
        file_path = f"{WORKSPACE_PATH}/{filename}"
        bits, _ = container.get_archive(file_path)
        stream = io.BytesIO()
        for chunk in bits:
            stream.write(chunk)
        stream.seek(0)
        with tarfile.open(fileobj=stream) as tar:
            member = tar.getmembers()[0]
            f = tar.extractfile(member)
            if f:
                return f.read().decode("utf-8", errors="replace")
        return None
    except docker.errors.NotFound:
        return None
    except docker.errors.APIError:
        logger.warning("Docker API error reading '%s' from container %s", filename, container_id, exc_info=True)
        return None


def write_workspace_file(container_id: str, filename: str, content: str) -> None:
    """Write a single file to the container workspace.

    Errors are logged but not raised -- write operations are best-effort
    because the caller typically cannot recover (the container may have
    been removed between the check and the write).
    """
    try:
        container = DOCKER_CLIENT.containers.get(container_id)
        data = content.encode("utf-8")
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode="w") as tar:
            info = tarfile.TarInfo(name=filename)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
        stream.seek(0)
        container.put_archive(WORKSPACE_PATH, stream)
    except (docker.errors.NotFound, docker.errors.APIError):
        logger.warning("Failed to write workspace file '%s' to container %s", filename, container_id, exc_info=True)


def list_workspace_files(container_id: str) -> list[str] | None:
    """List all files in the nanobot workspace directory (flat, relative names).

    Returns ``None`` when the container is not found.
    """
    try:
        container = DOCKER_CLIENT.containers.get(container_id)
        exit_code, output = container.exec_run(
            ["find", WORKSPACE_PATH, "-maxdepth", "1", "-type", "f", "-printf", "%f\\n"],
        )
        if exit_code != 0:
            return []
        filenames = [
            line for line in output.decode("utf-8", errors="replace").strip().split("\n")
            if line and ".." not in line
        ]
        return sorted(filenames)
    except docker.errors.NotFound:
        return None
    except docker.errors.APIError:
        logger.warning("Docker API error listing workspace files for container %s", container_id, exc_info=True)
        return None


def run_container_command(
    container_id: str,
    command: str,
    workdir: str = WORKSPACE_PATH,
) -> tuple[int, str]:
    """Run a shell command inside a container and return (exit_code, stdout).

    stdout and stderr are captured separately (``demux=True``) so that
    warnings or error messages on stderr never corrupt the stdout payload.
    On failure the stderr content is appended so callers still see diagnostics.

    Raises ``docker.errors.NotFound`` when the container does not exist.
    Other Docker/API errors propagate to the caller unchanged.
    """
    container = DOCKER_CLIENT.containers.get(container_id)
    exit_code, output = container.exec_run(
        ["bash", "-c", command],
        workdir=workdir,
        environment={"PYTHONDONTWRITEBYTECODE": "1"},
        demux=True,
    )
    stdout_bytes, stderr_bytes = output
    stdout = (stdout_bytes or b"").decode("utf-8", errors="replace")
    if exit_code != 0 and stderr_bytes:
        stdout += (stderr_bytes).decode("utf-8", errors="replace")
    return exit_code, stdout


def write_workspace_files_batch(container_id: str, files: dict[str, str]) -> None:
    """Write multiple files to the workspace in a single tar archive.

    Errors are logged but not raised -- write operations are best-effort
    because the caller typically cannot recover (the container may have
    been removed between the check and the write).
    """
    if not files:
        return
    try:
        container = DOCKER_CLIENT.containers.get(container_id)
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode="w") as tar:
            for filename, content in files.items():
                data = content.encode("utf-8")
                info = tarfile.TarInfo(name=filename)
                info.size = len(data)
                tar.addfile(info, io.BytesIO(data))
        stream.seek(0)
        container.put_archive(WORKSPACE_PATH, stream)
    except (docker.errors.NotFound, docker.errors.APIError):
        logger.warning("Failed to write batch workspace files to container %s", container_id, exc_info=True)
