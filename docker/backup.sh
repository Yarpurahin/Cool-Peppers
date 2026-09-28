#!/bin/sh
set -eu

umask 077
mkdir -p /backups

if [ -n "${BACKUP_NAME:-}" ]; then
  file="$BACKUP_NAME"
else
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  file="${PGDATABASE}_${timestamp}.dump"
fi

case "$file" in
  */*|*\\*|.*|*[!A-Za-z0-9._-]*)
    echo "Invalid BACKUP_NAME: use only letters, numbers, dot, dash and underscore." >&2
    exit 2
    ;;
esac

case "$file" in
  *.dump) ;;
  *) file="${file}.dump" ;;
esac

target="/backups/$file"
tmp="/backups/.${file}.tmp"
if [ -e "$target" ] && [ "${BACKUP_OVERWRITE:-false}" != "true" ]; then
  echo "Backup already exists: $target (set BACKUP_OVERWRITE=true to replace it)." >&2
  exit 4
fi
trap 'rm -f "$tmp"' EXIT INT TERM

printf '[backup] Creating %s...\n' "$target"
pg_dump \
  --host="$PGHOST" \
  --port="${PGPORT:-5432}" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file="$tmp"

mv "$tmp" "$target"
(cd /backups && sha256sum "$file" > "${file}.sha256")
trap - EXIT INT TERM

printf '[backup] Ready: %s\n' "$target"
printf '[backup] SHA-256: '
cut -d ' ' -f 1 "${target}.sha256"
