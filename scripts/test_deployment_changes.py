"""Exercise deployment classification against paths and real Git history."""

import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("deployment_required", Path(__file__).with_name("deployment-required.py"))
changes = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(changes)


class DeploymentChangesTests(unittest.TestCase):
    def test_known_safe_paths(self):
        for path in [*changes.SAFE_FILES, "docs/ui.md", "tasks/feature/spec.md", ".vscode/settings.json", ".githooks/pre-commit"]:
            with self.subTest(path=path):
                self.assertFalse(changes.deployment_required([path]))

    def test_runtime_build_and_unknown_paths_deploy_even_with_docs(self):
        for path in ["client/src/theme.css", "server/src/index.ts", "shared/src/index.ts", "package.json", "bun.lockb", "Dockerfile", ".dockerignore", ".gitignore", "compose.hostinger.yaml", "deploy/vps.Caddyfile", "deploy/Dockerfile.caddy", "deploy/start-hostinger.sh", ".github/workflows/hostinger.yaml", "scripts/wait-hostinger.py", "scripts/test_hostinger.py", ".env.test", "new-build-input", "docs-not-really/app.ts"]:
            with self.subTest(path=path):
                self.assertTrue(changes.deployment_required(["README.md", path]))

    def test_invalid_or_initial_history_deploys(self):
        for before in ["", "0" * 40, "main", "--help"]:
            self.assertTrue(changes.commits_require_deployment(before, "a" * 40))

    def test_real_multi_commit_push_deletion_rename_and_missing_history(self):
        with tempfile.TemporaryDirectory() as root:
            def git(*args):
                return subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, check=True).stdout.strip()

            def commit(path, content):
                file = Path(root, path)
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text(content)
                git("add", "-A")
                git("commit", "-qm", "fixture")
                return git("rev-parse", "HEAD")

            git("init", "-q")
            git("config", "user.email", "test@example.com")
            git("config", "user.name", "Test")
            start = commit("README.md", "start")
            docs = commit("docs/notes.md", "documentation")
            self.assertFalse(changes.commits_require_deployment(start, docs, root))
            app = commit("server/app.ts", "runtime")
            latest = commit("README.md", "docs after code")
            self.assertTrue(changes.commits_require_deployment(docs, latest, root))
            self.assertFalse(changes.commits_require_deployment(app, latest, root))
            git("mv", "server/app.ts", "docs/moved.md")
            git("commit", "-qm", "rename out of runtime")
            renamed = git("rev-parse", "HEAD")
            self.assertTrue(changes.commits_require_deployment(latest, renamed, root))
            git("rm", "docs/moved.md")
            git("commit", "-qm", "delete docs")
            deleted = git("rev-parse", "HEAD")
            self.assertFalse(changes.commits_require_deployment(renamed, deleted, root))
            self.assertTrue(changes.commits_require_deployment("f" * 40, deleted, root))


if __name__ == "__main__":
    unittest.main()
