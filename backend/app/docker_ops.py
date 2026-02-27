"""Docker operations for nanobot container lifecycle."""

import json
import os
import tarfile
import io

import docker

DOCKER_CLIENT = docker.from_env()
PARADISE_NETWORK = os.environ.get("PARADISE_NETWORK", "paradise_paradise")
NANOBOT_IMAGE = os.environ.get("NANOBOT_IMAGE", "paradise-nanobot")


def create_nanobot_container(node_id: str, name: str) -> str:
    """Spin up a new nanobot container. Returns the container ID."""
    container_name = f"nanobot-{node_id[:8]}"
    volume_name = f"paradise_nanobot_{node_id[:8]}"

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
        },
        network=PARADISE_NETWORK,
        restart_policy={"Name": "unless-stopped"},
    )
    return container.id


def stop_nanobot_container(container_id: str) -> None:
    """Stop and remove a nanobot container."""
    try:
        container = DOCKER_CLIENT.containers.get(container_id)
        container.stop(timeout=5)
        container.remove(force=True)
    except docker.errors.NotFound:
        pass


def get_container_status(container_id: str) -> str:
    """Get the current status of a container."""
    try:
        container = DOCKER_CLIENT.containers.get(container_id)
        return container.status
    except docker.errors.NotFound:
        return "not_found"


def get_container_logs(container_id: str, tail: int = 100) -> str:
    """Get recent logs from a container."""
    try:
        container = DOCKER_CLIENT.containers.get(container_id)
        return container.logs(tail=tail, timestamps=True).decode("utf-8", errors="replace")
    except docker.errors.NotFound:
        return ""


def get_container_stats(container_id: str) -> dict | None:
    """Get CPU/memory stats from a container."""
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
    except (docker.errors.NotFound, KeyError):
        return None


def restart_nanobot_container(container_id: str) -> None:
    """Restart a nanobot container."""
    try:
        container = DOCKER_CLIENT.containers.get(container_id)
        container.restart(timeout=5)
    except docker.errors.NotFound:
        pass


CONFIG_PATH = "/root/.nanobot/config.json"


def read_nanobot_config(container_id: str) -> dict:
    """Read nanobot.json from inside a container."""
    try:
        container = DOCKER_CLIENT.containers.get(container_id)
        bits, _ = container.get_archive(CONFIG_PATH)
        # Extract tar content
        stream = io.BytesIO()
        for chunk in bits:
            stream.write(chunk)
        stream.seek(0)
        with tarfile.open(fileobj=stream) as tar:
            member = tar.getmembers()[0]
            f = tar.extractfile(member)
            if f:
                return json.loads(f.read())
        return {}
    except (docker.errors.NotFound, docker.errors.APIError, KeyError):
        return {}


def write_nanobot_config(container_id: str, config: dict) -> None:
    """Write nanobot.json into a container."""
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
        pass


WORKSPACE_PATH = "/root/.nanobot/workspace"


def read_workspace_file(container_id: str, filename: str) -> str:
    """Read a file from the nanobot workspace directory."""
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
        return ""
    except (docker.errors.NotFound, docker.errors.APIError):
        return ""


def write_workspace_file(container_id: str, filename: str, content: str) -> None:
    """Write a file to the nanobot workspace directory."""
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
        pass
