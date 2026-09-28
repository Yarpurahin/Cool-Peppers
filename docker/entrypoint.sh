#!/bin/sh
set -eu

echo "[arena] PostgreSQL is ready. Applying database migrations..."
npm run db:migrate

echo "[arena] Ensuring initial scenarios and bootstrap administrator..."
npm run db:seed

echo "[arena] Starting application..."
exec "$@"
