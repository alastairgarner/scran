#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo sh deploy/install-caddy.sh" >&2
  exit 1
fi

snippet="$(dirname "$0")/scran.caddy"
config=/etc/caddy/Caddyfile
if grep -q '^scran\.hp\.affablegecko\.net' "$config"; then
  echo 'Scran already has a Caddy route; leaving it unchanged.'
  exit 0
fi

candidate=$(mktemp /etc/caddy/scran-candidate.XXXXXX)
trap 'rm -f "$candidate"' EXIT
cat "$config" > "$candidate"
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
echo "Scran route installed. Previous config: $backup"
