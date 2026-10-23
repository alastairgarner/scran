#!/usr/bin/env bash
set -euo pipefail
root=$(git rev-parse --show-toplevel)
id=$(printf '%s' "$root" | sha256sum | cut -c1-12)
name="scran-preview-$id"
volume="$name-data"
mkdir -p "$root/.scratch"
exec 9>"$root/.scratch/preview.lock"
flock -n 9 || { echo 'Another preview command is running in this worktree.' >&2; exit 1; }
url() { docker port "$name" 3000/tcp | sed 's|^|http://|'; }
case "${1:-}" in
  up)
    docker build -t "$name:latest" "$root"
    docker rm -f "$name" >/dev/null 2>&1 || true
    docker volume create "$volume" >/dev/null
    # Docker allocates the port before the app starts. Supply the exact origin
    # through a file so auth and CSRF use that port, without a reservation race.
    docker run -d --name "$name" --label scran.preview=true \
      --read-only --cap-drop ALL --security-opt no-new-privileges \
      --tmpfs /tmp:size=64m,mode=1777 --memory 2g --cpus 2 --pids-limit 128 \
      --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 \
      -p 127.0.0.1::3000 -v "$volume:/data" \
      -e DATA_DIR=/data -e DATABASE_URL=/data/scran.db -e PORT=3000 \
      -e ALLOW_INSECURE_HTTP=true -e COOKIE_SECURE=false -e AUTH_COOKIE_PREFIX="$name" -e AUTH_SECRET="$(openssl rand -hex 32)" \
      -e OPENAI_API_KEY="${PREVIEW_OPENAI_API_KEY:-preview-no-live-extraction}" \
      "$name:latest" sh -c '
        for i in $(seq 1 60); do
          if [ -s /tmp/preview-origin ]; then
            export BASE_URL="$(cat /tmp/preview-origin)"
            exec bun server/src/index.ts
          fi
          sleep 1
        done
        exit 1' >/dev/null
    origin=$(url)
    printf '%s' "$origin" | docker exec -i "$name" sh -c 'cat > /tmp/preview-origin'
    ready=false
    for ((i=0; i<60; i++)); do
      if curl -fsS "$origin/api/health" >/dev/null 2>&1; then ready=true; break; fi
      sleep 1
    done
    if [ "$ready" != true ]; then docker logs "$name"; exit 1; fi
    docker exec -e BASE_URL="$origin" "$name" bun server/src/cli/seed-preview.ts
    printf '\nPreview: %s\nLogin: preview@scran.test\nPassword: scran-preview-password\n' "$origin"
    ;;
  url) url ;;
  logs) docker logs --tail=100 "$name" ;;
  down) docker rm -f "$name" >/dev/null ;;
  reset)
    docker rm -f "$name" >/dev/null 2>&1 || true
    docker volume rm "$volume"
    echo 'Preview data removed. Run bun run preview:up to recreate it.'
    ;;
  *) echo 'Usage: bash scripts/preview.sh {up|url|logs|down|reset}' >&2; exit 1 ;;
esac
