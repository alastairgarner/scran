#!/usr/bin/env bash
# Explicitly deploy committed origin/main; never deploy the caller's worktree.
set -euo pipefail
common=$(git rev-parse --path-format=absolute --git-common-dir)
root=$(dirname "$common")
state="$root/.scratch/deployment"
checkout="$state/checkout"
mkdir -p "$state"
exec 9>"$state/lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
[ -f "$root/.env" ] || { echo "Missing deployment secrets: $root/.env" >&2; exit 1; }
# This clone is private to the deployer, rather than a branch an agent can edit.
if [ ! -d "$checkout/.git" ]; then
  git clone --no-checkout "$(git -C "$root" remote get-url origin)" "$checkout"
fi
git -C "$checkout" fetch origin main
sha=$(git -C "$checkout" rev-parse origin/main)
if [ "${1:-}" = --prepare ]; then
  echo "Preparing origin/main at $sha; the running deployment will not change."
elif [ "$#" -ne 0 ]; then
  echo 'Usage: bun run deploy [--prepare]' >&2; exit 1
fi
if ! git -C "$checkout" cat-file -e "$sha:scripts/deploy.sh" 2>/dev/null; then
  echo 'Merge the deployment tooling into origin/main before deploying.' >&2
  exit 1
fi
git -C "$checkout" checkout --detach "$sha"
cd "$checkout"
bun install --frozen-lockfile
bun run check
bun test
export SCRAN_IMAGE="scran-deploy:$sha"
export SCRAN_DATA_DIR="$root/data"
compose() { docker compose --env-file "$root/.env" -p scran -f "$checkout/compose.yaml" "$@"; }
compose build
if [ "${1:-}" = --prepare ]; then
  echo "Validated and built $SCRAN_IMAGE. No container was replaced."
  exit 0
fi
# Save the old image ID before replacement, for manual recovery if needed.
old=$(compose ps -q scran)
if [ -n "$old" ]; then docker inspect --format '{{.Image}}' "$old" > "$state/previous-image"; fi
mkdir -p "$root/backups"
backup="$root/backups/scran-before-$sha-$(date +%Y%m%d-%H%M%S).tar.gz"
# No writes while copying SQLite, its sidecars, and sources together.
compose stop scran
restart_old() { compose start scran || true; }
trap restart_old EXIT
if [ -d "$SCRAN_DATA_DIR" ]; then
  tar -czf "$backup" -C "$root" data
  echo "Data backup: $backup"
fi
# From here a new process can migrate the database. Do not blindly restart an
# old image against a potentially changed schema on failure.
trap - EXIT
if ! compose up -d --no-build --wait --wait-timeout 120; then
  compose logs --tail=100 scran
  echo "Deployment failed. Inspect migrations before rollback. Backup: $backup" >&2
  exit 1
fi
curl -fsS http://127.0.0.1:3080/api/health
printf '%s\n' "$sha" > "$state/deployed-sha"
printf '\nDeployed %s to https://scran.hp.affablegecko.net\n' "$sha"
