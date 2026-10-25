# Public VPS: Scran + Caddy

This guide describes an alternative **manual installation**. Current production
uses [automatic Hostinger deployment](hostinger.md): push `main` to GitHub and
verify the workflow succeeds. Do not run this manual stack alongside production.

This is the Hostinger (or other Linux VPS) deployment for
`https://recipes.alastair.sh`. It runs **two containers**:

- `scran`: Bun API, built frontend and embedded SQLite; no frontend/database service.
- `caddy`: public HTTPS reverse proxy, automatic certificates and HTTP-to-HTTPS redirects.

Only Caddy publishes host ports (TCP 80/443). Scran is reachable at `scran:3000`
inside the Compose network, not on the host's port 3000/3080. No host-installed
Caddy or paid control panel is needed. Do not run multiple Scran replicas.

The app data bind mount holds SQLite, WAL/SHM sidecars and source photos/HTML.
Named volumes hold Caddy's certificates (`caddy_data`) and state (`caddy_config`).
Container replacements preserve these. **Never run `down -v`** or prune these
volumes; deleting the app data directory loses household data.

This is a standalone stack: always use `docker compose -f compose.vps.yaml`.
Do not combine it with `compose.yaml` using multiple `-f` arguments. The latter
and `deploy/install-caddy.sh` target the **retired** home server; do not use them
for validation or production deployment. The obsolete local deploy command/script
have been removed.
For GitHub-triggered deployment through Docker Manager instead, follow
[the Hostinger guide](hostinger.md). That uses a separate image-only manifest;
don't run both stacks against the same data or ports.

## 1. Prepare the VPS

Use Debian 13 or Ubuntu 24.04 LTS. A 4 GB VPS is a comfortable starting point.
Install Git and the Docker Engine + Compose plugin using
[Docker's instructions](https://docs.docker.com/engine/install/).
Compose **2.24.0 or newer** is required for the `!reset` port override.

```sh
sudo systemctl enable --now docker
docker compose version
```

The commands below assume an operator with Docker access. Use `sudo` if needed;
Docker access itself is effectively root access. Use SSH keys; test them in a
second session before disabling SSH password authentication. Keep recovery access
through Hostinger available. Patch the OS and Docker regularly.

Provider and host firewalls should allow TCP 80/443 publicly and SSH only from
your IP/VPN. Keep outbound DNS, HTTPS and certificate-authority access available.
Do not open 3000, 3080 or Caddy's admin port 2019. Confirm the firewall is actually
attached/enabled. Avoid running another web server on 80/443.

Once this change has been merged into the repository's main branch, clone it to
a permanent directory such as `/opt/scran` and work there. Configure Git access
using a read-only deploy key for a private repository; never put a token in the
repository URL. No host Bun installation is required: Docker builds the app.

## 2. Secrets and writable data

From the checkout:

```sh
umask 077
cp .env.template .env
chmod 600 .env
# Edit .env with your editor; do not paste secrets into chat or shell arguments.
# Generate AUTH_SECRET locally with: openssl rand -hex 32
sudo install -d -m 700 -o 1000 -g 1000 data
```

Set `OPENAI_API_KEY` to a dedicated OpenAI project key, and `AUTH_SECRET` to a
unique random secret of at least 32 characters. Keep `.env` private and outside
Git; it is also excluded from Docker builds. The stack passes only the hostname
(not application secrets) to Caddy. Docker administrators can still inspect app
secrets, so restrict administrative access. Configure OpenAI spending alerts and
provider-side enforced limits where available.

The default hostname is `recipes.alastair.sh`. To change it, set
`SCRAN_HOST=your.hostname` in `.env` (no scheme, path or trailing slash). Both
Caddy and the app's `BASE_URL=https://...` derive from this one value. The VPS
stack deliberately overrides `BASE_URL` and `AUTH_IP_HEADER` from the base
Compose service; secure cookies stay enabled. See `.env.template` for app quotas.

App files run as uid/gid 1000. If moving an existing data directory here, stop
its writer and take a consistent backup first, then restore the **whole**
directory and set its ownership to `1000:1000`. Do not copy a live SQLite file
alone. Never run this stack against the home server's live data mount.

## 3. Cloudflare DNS and HTTPS

In Cloudflare's DNS for `alastair.sh`, add an **A** record named `recipes` pointing
to the VPS public IPv4 address. Remove stale/conflicting records. Only add AAAA
if the VPS's IPv6, routing and firewall are also configured.

For initial certificate issuance, start with **DNS only** (grey cloud). This
avoids an edge HTTPS redirect or strict-mode certificate error interfering with
bootstrap. Once direct HTTPS works, enable **Proxied** (orange cloud) and use
**Full (strict)** in SSL/TLS. Never use Flexible. Zone-wide TLS settings can affect
other subdomains too: their origins must also have valid certificates.

Caddy obtains and renews a public certificate automatically; no Cloudflare API
token, Origin CA certificate or DNS plugin is required. Keep ports 80/443 open
for issuance/renewal and preserve Caddy's data volume.

`deploy/vps.Caddyfile` trusts `CF-Connecting-IP` **only when the connecting peer
is in Cloudflare's published networks**. It overwrites both forwarding headers
before proxying; the app uses only `X-Real-IP` for IP limits. Direct requests use
the connecting client's IP, ignoring spoofed headers. The CIDRs were checked
against [IPv4](https://www.cloudflare.com/ips-v4) and
[IPv6](https://www.cloudflare.com/ips-v6); review them when maintaining Caddy.
Don't enable Cloudflare's Pseudo IPv4 “Overwrite Headers” mode: retain real
visitor addresses for correct IPv6 rate-limit grouping.

Cloudflare is not an authentication gate. Direct origin access on 80/443 remains
possible by design; app authentication protects household data. Restricting the
origin exclusively to Cloudflare would need a different firewall/certificate
plan. No additional Cloudflare firewall rules are required for this setup.

## 4. Start and verify

```sh
# Validate without printing the resolved config (which contains secrets).
docker compose -f compose.vps.yaml config --quiet
docker compose -f compose.vps.yaml build
docker compose -f compose.vps.yaml run --rm --no-deps caddy \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose -f compose.vps.yaml up -d --no-build --wait --wait-timeout 120
docker compose -f compose.vps.yaml ps
docker compose -f compose.vps.yaml logs --tail=50 caddy scran
```

Caddy's container healthcheck checks its local admin API, not public certificate
issuance. After DNS propagates, verify from outside the VPS:

```sh
curl -I http://recipes.alastair.sh
curl -fsS https://recipes.alastair.sh/api/health
```

HTTP should redirect to HTTPS. HTTPS must validate **without `-k`**. If Caddy
is healthy but HTTPS fails, check its logs, DNS and firewall. A Cloudflare 526
means its strict TLS validation of the origin failed; don't switch to Flexible
to hide it. After enabling Cloudflare proxying, repeat the HTTPS check.

Create the first account invitation:

```sh
docker compose -f compose.vps.yaml exec scran \
  bun server/src/cli/invite.ts you@example.com
```

Send the single-use link privately. Test registration, sign-in, recipe access,
a normal URL/photo import and sign-out. Verify anonymous recipe/photo requests
are denied and signup without an invite fails. Verify repeated invalid sign-ins
are throttled even with changing fake `CF-Connecting-IP`, `X-Real-IP` and
`X-Forwarded-For` headers, both directly against the origin and through Cloudflare.
When proxying, confirm different real client networks aren't all assigned the
Cloudflare edge IP. Clear site data/sign out before testing anonymous access.
Do not put invite tokens or passwords into logs or shared command transcripts.

See [security and operator commands](security.md) for limits, account recovery
and access incidents. Prefix its Compose commands with `-f compose.vps.yaml`.

## 5. Consistent backup and restore

Hostinger's VPS backups are useful, but don't replace an independent,
application-consistent off-host backup. Backups contain credentials and private
original photos. Encrypt off-host copies, restrict access and monitor failures.
Automated scheduling, an off-host destination and retention are **not configured**
by this stack; choose them before relying on it for important data.

Run this from the checkout; it pauses app writes, archives all app data, and
restarts the app even if archiving fails. Only one operator should back up or
update the stack at a time. Ensure space for the archive first.

```sh
(
  set -eu
  umask 077
  mkdir -p backups
  chmod 700 backups
  docker compose -f compose.vps.yaml stop scran
  trap 'docker compose -f compose.vps.yaml start scran' EXIT
  backup="backups/scran-$(date -u +%Y%m%d-%H%M%S).tar.gz"
  # Redirect as the operator so the archive is private even when tar needs sudo.
  sudo tar -czf - data > "$backup"
  printf 'Backup: %s\n' "$backup"
)
```

Verify the archive and copy it encrypted off the VPS. Keep a separate secure
copy of `.env`; don't include it in data archives. Caddy state survives ordinary
updates; on a replacement VPS its certificates can be reissued with correct DNS
and open ports (subject to CA limits), or restored from a secure volume backup.

To restore, first stop Scran and preserve its current data directory for
investigation. Restore only a trusted archive, with an image version compatible
with its database schema:

```sh
mkdir -p backups
chmod 700 backups
docker compose -f compose.vps.yaml stop scran
sudo mv data "backups/data-before-restore-$(date -u +%Y%m%d-%H%M%S)"
sudo tar -xzf /absolute/path/to/backup.tar.gz -C .
sudo chown -R 1000:1000 data
sudo chmod 700 data
docker compose -f compose.vps.yaml up -d --no-build --wait --wait-timeout 120
```

The preserved directory also contains sensitive data; retain/remove it
deliberately. Test recovery in an isolated checkout/VPS with separate credentials,
hostname, ports and Compose project name, never on the running production data.

## 6. Deploy updates

After changes are merged to `origin/main`, on the VPS:

```sh
git pull --ff-only origin main
docker compose -f compose.vps.yaml build
# Validate app settings without opening/migrating its database.
docker compose -f compose.vps.yaml run --rm --no-deps --entrypoint bun scran \
  -e "await import('./server/src/config.ts')"
docker compose -f compose.vps.yaml run --rm --no-deps caddy \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Record the previous app image ID (`docker compose -f compose.vps.yaml images -q
scran`) and commit, then take the consistent backup above **before** replacement.
Keep the old image until the release is verified. Then:

```sh
docker compose -f compose.vps.yaml up -d --no-build --force-recreate \
  --wait --wait-timeout 120
curl -fsS https://recipes.alastair.sh/api/health
```

Recreation makes Caddyfile changes take effect too; ordinary `up` alone doesn't
notice edits to a bind-mounted configuration file. There is brief downtime.
Repeat relevant sign-in/import checks. On failure, inspect logs and preserve the
failed data: migrations run on app startup, so blindly switching back to an old
image can be unsafe. Restore the compatible image **and** pre-update data when
schema changes require it.

The Bun and Caddy images are digest-pinned. Updating a mutable tag or running
`docker compose pull` alone does not update those digests. Deliberately refresh
them, check dependency advisories, review Cloudflare's networks, and test before
deploying. Rotate local backups and unused images deliberately so they don't
fill the disk.
