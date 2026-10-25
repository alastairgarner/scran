# Automatic Hostinger deployment

This is the current production deployment at https://recipes.alastair.sh.
The workflow is configured and enabled: **push `main` to GitHub to deploy** and
verify the matching Actions run succeeds. No local Docker deployment is needed.

`.github/workflows/hostinger.yaml` verifies PRs and main. Pushes to main build
immutable app/proxy images in GitHub Container Registry
(GHCR) and deploy `compose.hostinger.yaml` using Hostinger's Docker Manager API.
No inbound SSH from GitHub, Tailscale or self-hosted runner is needed.

The manual [VPS stack](vps.md) is an alternative installation, not the current
release process. The home-server instance is retired and its local deploy
command/script have been removed; do not run the root `compose.yaml`.
Use isolated `bun run preview:up` previews for local
validation and `bun run preview:reset` afterwards. Don't run both public stacks
against the same data or ports. The setup sections below document provisioning
and recovery; routine deployment needs only a validated push to main.

## What the workflow does

1. Runs `bun run check`, all Bun tests, deployment-verification tests and manifest validation.
2. On main only, builds the app and a Caddy image containing the versioned Caddyfile.
   Tests the real backup entrypoint before publishing either image.
3. Publishes SHA-tagged images and deploys by **digest**, not a mutable `latest` tag.
4. Calls the pinned, official `hostinger/deploy-on-vps` action with this commit's
   standalone Compose URL and non-secret image/hostname settings.
5. Waits up to ten minutes for **both requested image digests** to be running and
   healthy in Docker Manager, then checks public HTTPS `/api/health`.

Deployments are serialized; a newer push does not cancel one in flight. GitHub
may replace an older pending run with the latest pending run. Failed deployment
checks fail the workflow; they do not automatically restore a database or roll
back a release that may already have applied migrations.

The official [support guide](https://www.hostinger.com/support/deploy-to-hostinger-vps-using-github-actions/)
currently shows an outdated action name. The published repository is
[hostinger/deploy-on-vps](https://github.com/hostinger/deploy-on-vps), pinned here
to its reviewed v2 commit. It submits deployment but doesn't wait for completion
or offer a pre-deployment hook. Provider/API behavior must still be verified on
the first real deployment; local tests don't exercise a Hostinger account.

## 1. VPS prerequisites and private settings

Install Hostinger **Docker Manager**, without reinstalling an already configured
VPS unless you intend to erase it. Keep SSH limited to your IP, allow TCP 80/443,
and use the DNS/TLS setup in [the VPS guide](vps.md). Check `docker ps` for existing
listeners: don't have Hostinger's Traefik, host Caddy or another stack also claim
80/443. This stack handles routing/certificates itself; don't enable an additional
Hostinger domain proxy for it.

Store `OPENAI_API_KEY` and `AUTH_SECRET` as GitHub **environment secrets** in
`hostinger-production`, alongside `HOSTINGER_API_KEY` (see step 3). The workflow
sends all required app secrets on every deployment, alongside image/version
settings; it doesn't rely on preservation of UI-entered variables. No app secrets
need to be set manually in Hostinger and no `/etc/scran/app.env` file is required.

Generate the auth secret locally using `openssl rand -hex 32`; never paste it
into chat, Git, workflow source or a shared terminal transcript. The provider
action uses shell-interpolated inputs, so preflight validation rejects shell
metacharacters/newlines in tokens before invoking it. The manifest sets secure
cookies and storage/IP settings itself. Missing required secrets fail deployment
rather than starting with empty credentials. To customize model/quotas, change
the manifest defaults or explicitly add non-secret workflow inputs; don't rely
on Hostinger retaining UI edits when it replaces a project.

For a **new installation**, make the data/backup directories writable by Bun:

```sh
sudo install -d -m 700 -o 1000 -g 1000 /opt/scran/data /opt/scran/backups
```

For an **existing installation**, stop its writer and make a secure backup before
moving data or changing ownership. Transfer the whole SQLite/photo directory;
never copy a live database file alone. `/opt/scran/data` can be reused from a
manual checkout there, but stop that manual stack first. Keep the old Caddy
volumes until the new service is verified; don't use `down -v` during migration.

GitHub stores the app secrets and the deployment action sends them to Hostinger
over HTTPS. Authorized workflows/actions and Docker/Hostinger administrators can
access them, so protect main and restrict account/API access. Caddy receives only
the public hostname. Keep a secure recovery copy of both app secrets.

## 2. Allow Docker Manager to read the repository and private images

If the GitHub repository is private, install a **read-only repository deploy
key** on the VPS following
[Hostinger's private repository guide](https://www.hostinger.com/support/how-to-deploy-from-private-github-repository-on-hostinger-docker-manager/).
The action passes a commit-specific GitHub Compose URL; the VPS must be able to
read it. No broad GitHub personal token is passed to the deployment action.

The workflow publishes two GHCR packages, `ghcr.io/OWNER/REPO` and
`ghcr.io/OWNER/REPO-caddy`. New packages default to private; don't make them public
just to work around authentication (images contain application source code).
If packages already exist, check their visibility and grant this repository's
Actions workflow permission to publish them.

Configure Docker Manager's **private registry credentials** for `ghcr.io` using
a separate GitHub credential with `read:packages` and access to both packages.
For a classic PAT, use the minimum scopes and authorize organization SSO if
required. Follow
[Hostinger's registry credentials guide](https://www.hostinger.com/support/how-to-add-credentials-for-a-private-registry-in-docker-manager/).
This credential belongs in Hostinger, not in Compose, Git or chat. The publishing
job uses its short-lived GitHub-provided `GITHUB_TOKEN` automatically.

The packages won't exist until the first publishing run. Configure the registry
credential first; the workflow creates the packages before requesting deployment.
If an existing package denies access, fix its permissions and rerun on main.

## 3. Configure GitHub, then enable deployment

Create the GitHub Actions environment **`hostinger-production`**, restrict it to
main, and add these environment secrets:

- **`HOSTINGER_API_KEY`**: generated in Hostinger's API settings.
- **`OPENAI_API_KEY`**: a dedicated OpenAI project key with spending controls.
- **`AUTH_SECRET`**: a stable random value generated with `openssl rand -hex 32`.

Limit the Hostinger key's permissions as far as the provider allows, and treat
it as server/account administrative access. Configure required reviewers if you want
approval before deployment; omit that requirement for fully automatic deployment.
Protect main from unreviewed/untrusted changes.

Under repository **Settings → Secrets and variables → Actions → Variables**:

- Optional `SCRAN_HOST`: defaults to `recipes.alastair.sh` (hostname only).
- **Set `HOSTINGER_VM_ID` last**, only after the VPS, secrets, DNS, registry and
  repository access are ready. It must be a numeric VM ID from the VPS dashboard
  URL. This must be a **repository-level** variable, not only an environment variable:
  its presence enables the publishing/deployment jobs.

Then merge/push main or use **Actions → Verify and deploy to Hostinger → Run
workflow**, selecting main. Dispatches on other branches don't publish/deploy.
Setting the variable alone does not deploy anything. Clear `HOSTINGER_VM_ID`
to disable future automatic deployments (that does not stop an in-flight run).
Do not enable it on a repository with an unrelated VPS deployment using the same
`/opt/scran` paths or `scran-hostinger` project name.

## 4. First deployment and operator commands

Watch the workflow and Docker Manager together. A successful API submission is
not sufficient: the final workflow step requires the new images and HTTPS to be
healthy. Check for port conflicts, registry/repository access failures, DNS/TLS
errors, missing project environment variables, or unwritable data mounts if it fails.
Don't dump resolved Compose contents, environment files or provider responses
into a public issue; they may contain secrets.

From your own VPS terminal, create the first invite in the running app:

```sh
app=$(docker ps -q --filter label=com.docker.compose.project=scran-hostinger \
  --filter label=com.docker.compose.service=scran)
# Check exactly one container was found before proceeding.
docker exec "$app" bun server/src/cli/invite.ts you@example.com
```

Open the printed link privately and create your own account. Then appoint that
existing account as the single admin (replace the example email with yours):

```sh
docker exec "$app" bun server/src/cli/accounts.ts make-admin you@example.com
```

Refresh the app, then go to **Account → Administration** to manage member
accounts and create further invites. New signups are always members; the first
signup is not automatically an admin. The setup command is idempotent for your
account and refuses to appoint a different admin. Keep terminal access for recovery.
Never paste invite links or generated recovery passwords into issues or chat.

Complete the authenticated/anonymous and
Cloudflare forwarding-header checks in [the VPS guide](vps.md) before inviting
others. Public HTTPS proves connectivity; it is not a penetration test.

## Backups, retention and recovery

Before Bun starts a new release, `deploy/start-hostinger.sh` archives the whole
stopped `/data` directory to `/opt/scran/backups/before-COMMIT.tar.gz`, then starts
the app (including migrations). This assumes Docker Manager replaces the previous
single app container before starting the new one. **No other process/project may
write this database.** This is a startup backup, not a provider pre-deploy hook.

Backup failure prevents app startup. Retries of the same commit reuse and verify
its existing archive rather than overwriting pre-migration data. The seven most
recent pre-release archives are retained; other manual backups aren't pruned.
The first launch with no database needs no pre-release backup. Backups must be
writable by uid 1000; monitor free disk space and failed container restarts.

These are **local pre-release backups**, not daily backups or disaster recovery.
Arrange encrypted scheduled off-host backups separately; Hostinger snapshots
are an additional safety net. Keep a separate secure copy of the app secrets
stored in GitHub so you can recover the installation.
Never delete/recreate the Docker Manager project as an update mechanism; that
can destroy volumes. Stable host paths and explicit Caddy volume names prevent
routine image replacements from changing data locations.

For recovery, disable automatic deployment and stop the app using Docker Manager.
Preserve failed data. A pre-release archive contains data entries directly, not a
wrapping `data/` directory: extract it into an empty `/opt/scran/data`, restore
uid/gid `1000:1000` and mode `700`, and deploy an image compatible with that schema.
Keep the original backup archive outside the data directory. Restore the matching
release configuration/image through Docker Manager, not by deleting the project.
Test this procedure in an isolated instance first. There is no automatic rollback:
restarting an older image against a newer schema may corrupt or lose data.

## Local validation

```sh
bun run check
bun test
python3 -m unittest discover -s scripts -p 'test_hostinger.py' -v
docker build -t scran-hostinger-test .
HOSTINGER_TEST_IMAGE=scran-hostinger-test \
  python3 -m unittest discover -s scripts -p 'test_hostinger.py' -v
```

Without the test image, the three backup-container tests skip; the workflow runs
them with the actual built release image before publishing. The image test uses
real tar/filesystem operations, including backup failure, restart preservation,
private archive permissions and seven-release retention. Worktree UI previews
still use `bun run preview:up` and never call Hostinger or publish images.
