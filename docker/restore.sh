#!/bin/sh
set -eu

file="${BACKUP_FILE:-}"
if [ -z "$file" ]; then
  echo "BACKUP_FILE is required. Example: BACKUP_FILE=arena_20260928T120000Z.dump" >&2
  exit 2
fi

case "$file" in
  */*|*\\*|.*|*[!A-Za-z0-9._-]*)
    echo "Invalid BACKUP_FILE: pass a file name from ./backups, not a path." >&2
    exit 2
    ;;
esac

source_file="/backups/$file"
if [ ! -f "$source_file" ]; then
  echo "Backup not found: $source_file" >&2
  exit 3
fi

if [ -f "${source_file}.sha256" ]; then
  echo "[restore] Checking SHA-256..."
  (cd /backups && sha256sum -c "${file}.sha256")
else
  echo "[restore] Warning: checksum file is missing; restoring without integrity verification." >&2
fi

echo "[restore] Terminating existing connections to $PGDATABASE..."
psql \
  --host="$PGHOST" \
  --port="${PGPORT:-5432}" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --set=ON_ERROR_STOP=1 \
  --command="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();" >/dev/null

echo "[restore] Restoring $file into $PGDATABASE..."
pg_restore \
  --host="$PGHOST" \
  --port="${PGPORT:-5432}" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --clean \
  --if-exists \
  --single-transaction \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  "$source_file"

echo "[restore] Restore completed successfully."
