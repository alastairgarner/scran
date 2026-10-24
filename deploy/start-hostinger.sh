#!/bin/sh
# Docker must stop the previous single Scran writer before this container starts.
# Run only for the Hostinger stack; home deployments and previews keep their CMD.
set -eu
umask 077

case "${SCRAN_RELEASE:-}" in
  ''|*[!0-9a-f]*) echo 'SCRAN_RELEASE must be a lowercase commit SHA.' >&2; exit 1 ;;
esac
[ "${#SCRAN_RELEASE}" -eq 40 ] || { echo 'SCRAN_RELEASE must be 40 characters.' >&2; exit 1; }

if [ -f /data/scran.db ]; then
  archive="/backups/before-$SCRAN_RELEASE.tar.gz"
  if [ ! -f "$archive" ]; then
    temporary=$(mktemp /backups/.before-XXXXXX)
    trap 'rm -f "$temporary"' EXIT
    # Capture the whole stopped database, sidecars and photos before migrations.
    tar -czf "$temporary" -C /data .
    tar -tzf "$temporary" >/dev/null
    mv "$temporary" "$archive"
    trap - EXIT
  else
    # A crash/restart of this release must not replace its pre-migration backup.
    tar -tzf "$archive" >/dev/null
  fi
  # These controlled filenames contain only a hex SHA. Retain seven releases;
  # dot-prefixed failed temporary files aren't treated as successful backups.
  ls -1t /backups/before-*.tar.gz | tail -n +8 | while IFS= read -r old; do
    rm -f "$old"
  done
fi

exec bun server/src/index.ts
