"""Skip production releases only for explicitly known non-deployment paths."""

import re
import subprocess
import sys


SAFE_PREFIXES = ("docs/", "tasks/", ".vscode/", ".githooks/")
SAFE_FILES = {
    "AGENTS.md", "CONTEXT.md", "README.md", "LICENSE", ".env.template",
    "scripts/preview.sh", "compose.yaml", "compose.vps.yaml",
    "deploy/install-caddy.sh", "deploy/scran.caddy", "deploy/public.Caddyfile.example",
}


def deployment_required(paths):
    return any(path not in SAFE_FILES and not path.startswith(SAFE_PREFIXES) for path in paths)


def commits_require_deployment(before, after, cwd=None):
    # Manual dispatches, initial pushes and unavailable history must not suppress a release.
    if not all(re.fullmatch(r"[0-9a-f]{40}", sha) and sha != "0" * 40 for sha in (before, after)):
        return True
    try:
        result = subprocess.run(
            ["git", "diff", "--no-renames", "--name-only", "-z", before, after, "--"],
            cwd=cwd, capture_output=True, check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return True
    paths = result.stdout.decode("utf-8", errors="surrogateescape").split("\0")
    return deployment_required(path for path in paths if path)


if __name__ == "__main__":
    before, after = sys.argv[1:3]
    print("true" if commits_require_deployment(before, after) else "false")
