# Package scran for the home server

Type: task
Status: open
Blocked by: 13

## Question

The destination requires a container someone else's phone can reach, started by something other
than my hands.

- A `Dockerfile` on `oven/bun:1-slim` — verified in ticket 02 to have FTS5 compiled in. The client
  builds to static assets; decide whether Hono serves them or a second container does (it
  shouldn't).
- A compose file with the two bind mounts that matter: `DATA_DIR` for photos and the SQLite file.
  Those are the irreplaceable artifacts and they must survive the container.
- `COOKIE_SECURE=false` and a `BASE_URL` of `http://192.168.x.x:PORT` — the LAN has no domain, so
  **no Caddy and no TLS**. The whole TLS story is one variable when the public deploy happens.
- Restart policy, and what starts it on boot.
- Backups of the photo directory and the database file — the map has left this unspecified, and a
  container makes it worse by hiding where things live.

Done when the container is started by the home server rather than by me, survives a reboot, and
someone else's phone loads scran over the LAN.

## Comments

2026-10-21: Home-server packaging implemented at the user's request. The deployment
scope now includes the existing host Caddy and custom DNS over Tailscale:
`https://scran.hp.affablegecko.net`, secure cookies, and a localhost-only Docker
mapping on port 3080. This supersedes this ticket's original HTTP-only constraint.
The image serves the built client and API together. One bind-mounted `data/`
directory preserves sources, SQLite, and its WAL/SHM sidecars. Compose includes
a healthcheck and `unless-stopped`; Docker is enabled at host boot. README documents
manual backup and restore, and `deploy/install-caddy.sh` installs the route with
validation, backup, and rollback on reload failure.

Image build, container HTTP/authentication smoke checks, 74 tests, and repository
checks passed. The user supplied the OpenAI key and installed the Caddy route;
validation uses the service's `/etc/caddy/cloudflare.env` token file. Private DNS
resolves the hostname through the tailnet's DNS server (these records are not in
public Cloudflare DNS). Scran is running healthy on localhost port 3080, and the
health endpoint, sign-in page, and built assets passed HTTPS checks through Caddy.
A signup invite was generated for the user. A real phone check, live recipe
extraction, and reboot recovery remain unverified. Automated backups are not
configured; leave this ticket open until its acceptance is confirmed.

First live extraction exposed two separate failures: the original API key was
rejected with HTTP 401, then the replacement authenticated successfully but GPT-5
rejected `temperature: 0` with HTTP 400. Removed the explicit temperature override
to use the model default. This supersedes ticket 10's earlier observation that
GPT-5 accepted zero; the deployed API explicitly rejects it now.

The GPT-5 retry succeeded, but the user clarified that temperature zero was
important to their measured extraction quality. All four saved photo fixtures
identify their model as GPT-4.1, contradicting ticket 10's GPT-5 attribution.
At the user's request, restored `temperature: 0` and changed the application,
Compose, and environment-template defaults to `gpt-4.1`, with an explicit local
environment setting. Existing extracted versions are preserved.
