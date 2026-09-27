#!/usr/bin/env bash
# Picks docker-compose.dev.yml or docker-compose.prod.yml based on ENV in .env
# (defaults to development), then runs `docker compose` with the given args.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

case "${ENV:-development}" in
  production|prod)
    OVERRIDE_FILE="docker-compose.prod.yml"
    ;;
  development|dev)
    OVERRIDE_FILE="docker-compose.dev.yml"
    ;;
  *)
    echo "Unknown ENV '${ENV}' in .env — expected 'development' or 'production'." >&2
    exit 1
    ;;
esac

echo "> ENV=${ENV:-development} — using $OVERRIDE_FILE" >&2
exec docker compose -f docker-compose.yml -f "$OVERRIDE_FILE" "$@"
