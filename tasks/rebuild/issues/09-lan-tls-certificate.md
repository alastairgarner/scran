# How does Caddy get a real certificate for recipes.alastair.sh on a LAN box?

Type: research
Status: out-of-scope

**Out of scope for this map.** While testing on the LAN the box has no domain — just an IP — so
there is no certificate to get and no passkey to enrol. Plain `http://192.168.x.x` serves cookies
fine; it only forbids the `Secure` flag, which is one env-driven config value, not a reverse proxy.
TLS, Caddy and `recipes.alastair.sh` all arrive together at the public deploy. Ticket kept intact
to carry into that map — the hostname decision below still stands.

## Question

**The hostname is decided: `recipes.alastair.sh`**, from day one, on the LAN box and later in
public. That matters more than it looks — WebAuthn welds a passkey to a hostname, so using the
final name immediately means **no passkey ever has to be re-registered** when this goes public.
Bare IPs and `.local` names are ruled out: an IP is not a valid WebAuthn hostname at all.

`alastair.sh` is on **Cloudflare** (`chance/deb.ns.cloudflare.com`), and neither the apex nor
`recipes` currently resolves. So the shape of the answer is likely Caddy + ACME **DNS-01** against
Cloudflare, with nothing exposed to the internet. Confirm it, and get the details right:

- **DNS-01 with Caddy.** The Cloudflare DNS module isn't in the standard Caddy binary. What's the
  current way to get it — `xcaddy` build, an official plugin image, or something else? Give the
  exact Dockerfile or image tag.
- **The Cloudflare API token**: minimum scopes (Zone:DNS:Edit on `alastair.sh` only?), how Caddy
  consumes it, and how it stays out of the repo.
- **The A record.** Can `recipes.alastair.sh` simply point at a **private** `192.168.x.x` address
  in public DNS? Cloudflare must be **DNS-only (grey cloud)** — proxying a private IP can't work.
  Note the tradeoff: the private IP becomes publicly visible. Is that acceptable, or is split-horizon
  DNS worth it?
- **Renewal on a box with no inbound access.** DNS-01 needs only outbound; confirm Caddy renews
  unattended and what happens if the token expires.
- **iOS specifically.** A recipe gets read on a phone. Confirm a Let's Encrypt cert on a LAN IP
  behind a public hostname is trusted with no profile install, and that passkey enrolment works.
- **The public move later.** What actually changes when this goes public — just the A record, or
  more? Confirm nothing invalidates sessions or passkeys.

Also state what Tailscale would buy instead, and why it was passed over — a `*.ts.net` name would
be free TLS but a different hostname and tailnet-only access, which contradicts sharing with family.

Answer with the compose file and Caddyfile that result, plus what has to be done by hand once.
