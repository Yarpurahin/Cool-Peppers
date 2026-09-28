#!/bin/sh
set -eu

echo "[arena] PostgreSQL is ready. Applying database migrations..."
npm run db:migrate

echo "[arena] Ensuring initial scenarios and bootstrap administrator..."
npm run db:seed

echo "[arena] Upgrading stored scenario documents to the canonical graph format..."
npm run db:normalize-scenarios

echo "[arena] Starting application..."
exec "$@"
