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
