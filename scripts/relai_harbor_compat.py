"""Task-local workaround for Docker Desktop artifact copies over nested RO mounts.

Only the canonical ATIF transcript is eligible. Preserve Docker's normal copy
path, falling back to an exact UTF-8 read from the running container only for
its known read-only-mount error. Never reconstruct or score transcript content.
"""
from pathlib import Path
from harbor.constants import MAIN_SERVICE_NAME
from harbor.environments.docker.docker_unix import UnixOps

_original_download = UnixOps.download_file

async def download_with_readonly_fallback(self, source_path, target_path, service=None):
    try:
        return await _original_download(self, source_path, target_path, service)
    except RuntimeError as error:
        if source_path != "/logs/agent/trajectory.json" or "read-only file system" not in str(error):
            raise
        result = await self._env._run_docker_compose_command(
            ["exec", "-T", service or MAIN_SERVICE_NAME, "cat", source_path], check=True
        )
        # Reject diagnostics/truncated output, while preserving the exact bytes
        # of the valid JSON snapshot that the production agent already wrote.
        import json
        document = json.loads(result.stdout)
        if document.get("schema_version") != "ATIF-v1.7":
            raise RuntimeError("Artifact copy fallback received an invalid ATIF document")
        destination = Path(target_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(result.stdout, encoding="utf-8")

UnixOps.download_file = download_with_readonly_fallback
