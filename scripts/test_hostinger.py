"""Provider response tests; set HOSTINGER_TEST_IMAGE for real backup tests."""

import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("wait_hostinger", ROOT / "scripts/wait-hostinger.py")
wait_hostinger = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(wait_hostinger)
IMAGES = [f"ghcr.io/example/scran@sha256:{'a' * 64}", f"ghcr.io/example/scran-caddy@sha256:{'b' * 64}"]


class DeploymentHealthTests(unittest.TestCase):
    def containers(self):
        return [{"image": image, "state": "running", "health": "healthy"} for image in IMAGES]

    def test_requires_both_new_images_and_healthy_containers(self):
        containers = self.containers()
        self.assertTrue(wait_hostinger.release_is_healthy(containers, IMAGES))
        for field, value in [("image", "old:latest"), ("health", "starting"), ("state", "exited")]:
            changed = self.containers()
            changed[0][field] = value
            self.assertFalse(wait_hostinger.release_is_healthy(changed, IMAGES))
        for invalid in [None, {}, [], containers[:1], containers + containers[:1], [containers[0]] * 2]:
            self.assertFalse(wait_hostinger.release_is_healthy(invalid, IMAGES))

    def test_waits_for_new_images_then_checks_public_https(self):
        with patch.object(wait_hostinger, "get_json", side_effect=[[], self.containers(), {"ok": True}]) as get_json, patch.object(wait_hostinger.time, "sleep"), patch("sys.stdout", new=io.StringIO()):
            wait_hostinger.wait_for_release(vm="123", token="private-token", images=IMAGES, host="recipes.example.com", release="a" * 40)
        self.assertEqual(get_json.call_args_list[-1].args, (f"https://recipes.example.com/api/health?release={'a' * 40}",))
        self.assertEqual(get_json.call_args_list[0].args[1], "private-token")

    def test_acceptance_and_old_health_do_not_count_as_release_success(self):
        with patch.object(wait_hostinger, "get_json", return_value=[]), patch.object(wait_hostinger.time, "monotonic", side_effect=[0, 1, 1000]), patch.object(wait_hostinger.time, "sleep"), patch("sys.stdout", new=io.StringIO()):
            with self.assertRaises(TimeoutError):
                wait_hostinger.wait_for_release(vm="123", token="private-token", images=IMAGES, host="recipes.example.com", release="a" * 40)

    def test_rejects_unsafe_settings_before_making_requests(self):
        valid = dict(vm="123", token="private-token", images=IMAGES, host="recipes.example.com", release="a" * 40)
        with patch.object(wait_hostinger, "get_json") as get_json:
            for changes in [{"vm": "123/other"}, {"host": "https://example.com"}, {"host": "example.com/path"}, {"release": "main"}, {"images": ["image:latest"] * 2}]:
                with self.assertRaises(ValueError):
                    wait_hostinger.wait_for_release(**(valid | changes))
            get_json.assert_not_called()


class ManifestTests(unittest.TestCase):
    def test_manifest_is_standalone_and_keeps_secrets_on_vps(self):
        result = subprocess.run(["docker", "compose", "-f", str(ROOT / "compose.hostinger.yaml"), "config", "--no-interpolate", "--no-env-resolution", "--format", "json"], check=True, capture_output=True, text=True)
        model = json.loads(result.stdout)
        self.assertEqual(set(model["services"]), {"scran", "caddy"})
        app = model["services"]["scran"]
        self.assertFalse(app.get("ports"))
        self.assertNotIn("build", app)
        self.assertNotIn("extends", app)
        self.assertEqual(app["environment"]["COOKIE_SECURE"], "true")
        self.assertEqual(app["environment"]["AUTH_IP_HEADER"], "x-real-ip")
        self.assertNotIn("env_file", app)
        self.assertEqual(app["environment"]["OPENAI_API_KEY"], "${OPENAI_API_KEY:?Set the OPENAI_API_KEY GitHub environment secret}")
        self.assertEqual(app["environment"]["AUTH_SECRET"], "${AUTH_SECRET:?Set the AUTH_SECRET GitHub environment secret}")
        self.assertNotIn("OPENAI_API_KEY", caddy_environment := model["services"]["caddy"]["environment"])
        self.assertNotIn("AUTH_SECRET", caddy_environment)
        self.assertTrue(app["read_only"])
        self.assertEqual(app["cap_drop"], ["ALL"])
        self.assertEqual({v["source"] for v in app["volumes"]}, {"/opt/scran/data", "/opt/scran/backups"})
        caddy = model["services"]["caddy"]
        self.assertEqual({p["published"] for p in caddy["ports"]}, {"80", "443"})
        self.assertFalse(caddy.get("env_file"))
        self.assertNotIn("build", caddy)
        self.assertTrue(all(v["type"] == "volume" for v in caddy["volumes"]))
        self.assertEqual(model["volumes"]["caddy_data"]["name"], "scran-hostinger-caddy-data")


@unittest.skipUnless(os.environ.get("HOSTINGER_TEST_IMAGE"), "Set HOSTINGER_TEST_IMAGE to test the built entrypoint")
class BackupEntrypointTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)
        for name in ["data", "backups", "bin"]:
            (self.path / name).mkdir()
        # No mock of tar/the filesystem. Only replace Bun so tests stop after
        # the real backup script without starting the full app process.
        bun = self.path / "bin/bun"
        bun.write_text("#!/bin/sh\nprintf 'APP_STARTED\\n'\n")
        bun.chmod(0o755)
        (self.path / "data/scran.db").write_bytes(b"test database bytes")
        (self.path / "data/scran.db-wal").write_bytes(b"test WAL bytes")
        (self.path / "data/sources").mkdir()
        (self.path / "data/sources/photo.jpg").write_bytes(b"test original photo")

    def start(self, release, readonly_backups=False):
        return subprocess.run([
            "docker", "run", "--rm", "--user", f"{os.getuid()}:{os.getgid()}",
            "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges:true",
            "-e", f"SCRAN_RELEASE={release}", "-e", "PATH=/test-bin:/usr/local/bin:/usr/bin:/bin",
            "-v", f"{self.path / 'data'}:/data:ro,Z",
            "-v", f"{self.path / 'backups'}:/backups" + (":ro,Z" if readonly_backups else ":Z"),
            "-v", f"{self.path / 'bin'}:/test-bin:ro,Z",
            "--entrypoint", "sh", os.environ["HOSTINGER_TEST_IMAGE"], "/app/start-hostinger.sh",
        ], capture_output=True, text=True)

    def test_backup_contains_database_sidecars_and_photos_and_survives_restart(self):
        release = "a" * 40
        result = self.start(release)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("APP_STARTED", result.stdout)
        archive = self.path / f"backups/before-{release}.tar.gz"
        self.assertEqual(archive.stat().st_mode & 0o777, 0o600)
        original = archive.read_bytes()
        with tarfile.open(archive) as backup:
            self.assertEqual(backup.extractfile("./scran.db").read(), b"test database bytes")
            self.assertEqual(backup.extractfile("./scran.db-wal").read(), b"test WAL bytes")
            self.assertEqual(backup.extractfile("./sources/photo.jpg").read(), b"test original photo")
        (self.path / "data/scran.db").write_bytes(b"post-migration database bytes")
        self.assertEqual(self.start(release).returncode, 0)
        self.assertEqual(archive.read_bytes(), original)

    def test_failed_backup_or_invalid_release_never_starts_app(self):
        for release, readonly in [("main", False), ("a" * 40, True)]:
            result = self.start(release, readonly_backups=readonly)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn("APP_STARTED", result.stdout)

    def test_retains_only_seven_pre_release_archives(self):
        for index in range(8):
            result = self.start(f"{index:040x}")
            self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(list((self.path / "backups").glob("before-*.tar.gz"))), 7)
        self.assertTrue((self.path / f"backups/before-{7:040x}.tar.gz").exists())


if __name__ == "__main__":
    unittest.main()
