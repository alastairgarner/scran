#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo sh deploy/install-caddy.sh" >&2
  exit 1
fi

snippet="$(dirname "$0")/scran.caddy"
config=/etc/caddy/Caddyfile
candidate=$(mktemp /etc/caddy/scran-candidate.XXXXXX)
trap 'rm -f "$candidate"' EXIT
# Replace only this managed top-level site; preserve every unrelated route.
# Refuse an unexpected site declaration rather than appending a duplicate.
if grep '^scran\.hp\.affablegecko\.net' "$config" | grep -qv '^scran\.hp\.affablegecko\.net {$'; then
  echo 'Unexpected existing Scran site declaration; update it manually.' >&2
  exit 1
fi
awk '
  /^scran\.hp\.affablegecko\.net \{$/ { skipping=1; next }
  skipping && /^\}/ { skipping=0; next }
  !skipping { print }
  END { if (skipping) exit 1 }
' "$config" > "$candidate"
printf '\n' >> "$candidate"
cat "$snippet" >> "$candidate"
/usr/local/bin/caddy fmt --overwrite "$candidate"
# Match the systemd service's EnvironmentFile without printing or sourcing it.
/usr/local/bin/caddy validate --config "$candidate" --adapter caddyfile \
  --envfile /etc/caddy/cloudflare.env

backup="${config}.before-scran.$(date +%Y%m%d%H%M%S)"
cp -p "$config" "$backup"
cat "$candidate" > "$config"
if ! systemctl reload caddy; then
  cp -p "$backup" "$config"
  systemctl reload caddy
  echo "Reload failed; restored $backup" >&2
  exit 1
fi
echo "Scran route installed/updated. Previous config: $backup"
