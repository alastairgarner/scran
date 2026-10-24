# Security and public hosting

Scran is **one shared household**, not a multi-tenant service. Invite only people
trusted to see all recipes, source previews, comments and history, edit recipes,
and use the household's extraction allowance. Only authors delete their own
recipes/comments. Do not promise separate private catalogues to friends.

## Review and controls

Four independent model reviews examined authentication/invites, authorization,
imports/uploads, and VPS deployment. No authentication bypass was demonstrated;
that is not a penetration-test certification or a guarantee of security.

The resulting hardening includes credential-path log redaction, no-store and
browser security headers, pre-parser body bounds, account/IP login limits,
persisted extraction allowances, bounded extraction/image concurrency, bounded
source storage and edits, model deadlines/output limits, metadata-free photo
previews, stronger new passwords, and account/session operator controls.
Original photos remain private on disk for rereading and backups; the recipe
photo endpoint serves re-encoded previews, not raw originals. Photos/HTML used
for extraction are sent to OpenAI. Tell invitees before they upload material.

Current default budgets (UTC days; failed admitted attempts count):

- 60 extraction attempts per person/day, 200 across the household/day;
- 2 concurrent extractions, no unbounded extraction queue;
- 5 GiB of permanent sources, with a free-space reserve;
- 200 versions per recipe; 128 KiB recipe content and bounded fields/arrays;
- 200 edits and 1,000 total mutating API requests per person/day;
- 16 KiB auth/invite bodies, 1 MiB other JSON, 55 MiB capture requests.

Concurrency and storage reservations assume **one server process**; do not add
replicas without shared admission controls. Small-body admission is isolated by
user or normalized client IP, so anonymous slow senders cannot consume a shared
sign-in pool. Auxiliary in-memory throttles clear on restart and fail open for
new keys under map pressure; independent IP/auth limits remain in place.

These are abuse/availability limits, **not a dollar spending guarantee**. Use a
separate restricted OpenAI project key, spending alerts, and any available
provider-side enforced limits. Do not assume a dashboard budget is a hard cap.
Retained originals, failed captures, and soft-deleted recipes consume storage.
Do not delete arbitrary files: preserve references and take a backup before
operator-managed reclamation. Monitor the source quota, actual volume/SQLite
size, free space, process memory and container restarts.

## Invitations and access incidents

In the current Compose deployment, run commands inside the container. Locally,
the equivalent scripts are `bun run invite` and `bun run accounts`.

```sh
docker compose exec scran bun server/src/cli/invite.ts person@example.com
docker compose exec scran bun server/src/cli/invite.ts list
docker compose exec scran bun server/src/cli/invite.ts revoke 12

docker compose exec scran bun server/src/cli/accounts.ts list
docker compose exec scran bun server/src/cli/accounts.ts disable person@example.com
docker compose exec scran bun server/src/cli/accounts.ts enable person@example.com
docker compose exec scran bun server/src/cli/accounts.ts reset-password person@example.com
```

Send each invite directly through a trusted private channel. The seven-day,
single-use link is a bearer credential: **email binding is not mailbox
verification**. Anyone with the link can register using its bound email.
Never post links in a group or forward them. Cancel a misdirected unused invite;
disable the account if it has already been redeemed. Disabling revokes sessions
and blocks another login, while retaining attribution. Revoking sessions alone
does not remove a person's credentials.

The Account screen offers sign out, password change (which revokes other
sessions), and sign out other devices. New passwords need 12 characters; old
passwords remain usable for sign-in. For recovery, verify identity separately
(e.g. a known phone number), run the operator reset, deliver the generated
temporary password privately, and ask the person to change it immediately.
Resetting revokes all sessions. Do not paste temporary passwords into logs,
issues, agent conversations or shell arguments.

Existing logs may contain old invite tokens. Restrict access/retention and
cancel outstanding links suspected of exposure; deploys do not erase historical
logs or revoke invitations automatically. Backups contain credentials and private
originals and deserve the same protection as the running database.

## Public VPS checklist

The containerized Caddy stack in [the VPS guide](vps.md) uses
`compose.vps.yaml`, exposes only Caddy's 80/443, derives the HTTPS origin from
`SCRAN_HOST`, and overwrites `X-Real-IP` with Caddy's resolved client IP. It
trusts Cloudflare's `CF-Connecting-IP` only from the published Cloudflare
networks pinned in `deploy/vps.Caddyfile`; review that list periodically. Direct
connections cannot supply their own trusted visitor IP. Use `docker compose -f
compose.vps.yaml` for the operator commands above when running that stack.

For automatic deployment via Hostinger's API, see [the Hostinger guide](hostinger.md).
Its standalone image-only manifest uses fixed VPS data paths and GitHub environment
secrets sent to Docker Manager on every deploy; missing required secrets fail
deployment. It takes bounded
local pre-release backups before Bun starts. Off-host backups remain an operator
responsibility.

The checklist below describes the alternative **host-installed Caddy** setup:

1. Choose a hostname and point its DNS at the VPS. Set `BASE_URL` in `.env` to
   that exact HTTPS origin (no path/trailing slash). Compose defaults to the
   existing home hostname; changing it does not change DNS or Caddy for you.
2. Keep the application mapping at `127.0.0.1:3080:3000`. Only a reverse proxy on
   the same host should reach it. Never publish port 3000/3080 publicly; Docker
   publishing can bypass host firewall tooling. Open 80/443 as needed and
   restrict SSH (prefer VPN/key-only access) in host and provider firewalls.
3. Caddy must **overwrite** the single-IP header the app trusts. The included
   route overwrites both `X-Real-IP` and `X-Forwarded-For`; `AUTH_IP_HEADER`
   defaults to `x-forwarded-for` for existing direct-Caddy installs. Set it to
   `x-real-ip` only after the proxy overwrites that header. Do not trust a
   client-supplied header or an unconfigured CDN chain. A CDN needs a separate
   trusted-proxy configuration and end-to-end rate-limit verification.
4. For a new public host, adapt `deploy/public.Caddyfile.example`. The existing
   `deploy/scran.caddy` uses this home host's `cloudflare_tls` snippet; the
   install script is specifically for that host. Updating its route requires
   `sudo sh deploy/install-caddy.sh`; app deployments do not reload Caddy.
5. Use a random, unique `AUTH_SECRET` (at least 32 characters), restrict `.env`
   permissions to the operator, and do not put it in Git, images or data archives.
   Keep secure cookies on. Production refuses HTTP except explicitly opted-in
   loopback previews. TLS certificates and browser cookie behavior must be
   verified against the real public hostname before inviting people.
6. The container runs as uid/gid 1000 with a read-only root filesystem, dropped
   capabilities, bounded resources and rotating logs. Existing bind-mounted
   data must be writable by uid 1000; the deploy script backs up then adjusts
   ownership. Keep the image digest and locked dependencies updated, run
   `bun audit`, and regularly patch the VPS/Docker/Caddy.
7. Schedule encrypted off-host backups of the **whole data directory**, taken
   with writes stopped or with a proper SQLite backup procedure. Store `.env`
   separately and securely. Test a restore to an isolated instance. The deploy
   script's private local backup is not off-host disaster recovery. Off-host
   destination, encryption recipient, retention and monitoring must be supplied
   by the operator; this repository does not silently choose them.
8. Verify via the actual proxy: anonymous recipe/photo requests fail, public
   signup is blocked, a new invite is single-use, sign-in throttles despite fake
   forwarding headers, oversized requests fail, sign-out/revocation works, and
   a normal photo/URL recipe works. Configure egress firewall rules against
   private/metadata/host addresses as defense in depth; URL validation alone
   cannot know the VPS's own public service addresses.

Public provisioning, DNS changes, off-host backups, and provider billing settings
are separate operational steps. The existing deployment remains on Tailscale
unless those steps are explicitly carried out.
