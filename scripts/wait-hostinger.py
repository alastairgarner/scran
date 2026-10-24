#!/usr/bin/env python3
"""Wait for the requested immutable images, not just an accepted API request."""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request


API = "https://developers.hostinger.com/api/vps/v1/virtual-machines"


def release_is_healthy(containers, images):
    if not isinstance(containers, list) or len(containers) != len(images):
        return False
    return all(
        sum(
            isinstance(container, dict)
            and container.get("image") == image
            and container.get("state") == "running"
            and container.get("health") == "healthy"
            for container in containers
        )
        == 1
        for image in images
    )


def get_json(url, token=None):
    headers = {"Accept": "application/json", "Cache-Control": "no-cache"}
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    with urllib.request.urlopen(
        urllib.request.Request(url, headers=headers), timeout=20
    ) as response:
        return json.load(response)


def wait_for_release(*, vm, token, images, host, release, timeout=600):
    if not re.fullmatch(r"[0-9]+", vm):
        raise ValueError("HOSTINGER_VM_ID must be numeric")
    if not re.fullmatch(r"[a-z0-9]+(?:[.-][a-z0-9]+)*", host):
        raise ValueError("SCRAN_HOST must be a hostname, without a scheme or path")
    if not re.fullmatch(r"[0-9a-f]{40}", release):
        raise ValueError("SCRAN_RELEASE must be a commit SHA")
    if len(set(images)) != 2 or not all(
        re.fullmatch(r"ghcr\.io/[a-z0-9_./-]+@sha256:[0-9a-f]{64}", image)
        for image in images
    ):
        raise ValueError("Expected two distinct, digest-pinned GHCR image references")

    deadline = time.monotonic() + timeout
    containers_url = f"{API}/{vm}/docker/scran-hostinger/containers"
    health_url = f"https://{host}/api/health?release={release}"
    while time.monotonic() < deadline:
        try:
            containers = get_json(containers_url, token)
            if release_is_healthy(containers, images):
                health = get_json(health_url)
                if isinstance(health, dict) and health.get("ok") is True:
                    print(f"Healthy Hostinger deployment: {release}")
                    return
        except urllib.error.HTTPError as error:
            # Don't dump provider responses: project settings can contain secrets.
            if error.code in (401, 403):
                raise RuntimeError("Deployment verification was denied (HTTP 401/403)") from None
            if error.code not in (404, 408, 422, 429) and error.code < 500:
                raise RuntimeError(f"Deployment verification failed (HTTP {error.code})") from None
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            pass
        print("Waiting for both release containers and public HTTPS health...")
        time.sleep(10)
    raise TimeoutError("Deployment did not become healthy within 10 minutes; inspect Docker Manager")


def main():
    try:
        wait_for_release(
            vm=os.environ["HOSTINGER_VM_ID"],
            token=os.environ["HOSTINGER_API_KEY"],
            images=[os.environ["SCRAN_IMAGE"], os.environ["CADDY_IMAGE"]],
            host=os.environ.get("SCRAN_HOST", "recipes.alastair.sh"),
            release=os.environ["SCRAN_RELEASE"],
        )
    except (KeyError, ValueError, RuntimeError, TimeoutError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
