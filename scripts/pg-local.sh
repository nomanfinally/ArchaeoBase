#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_ROOT="$ROOT_DIR/.local/pgroot"
PG_DATA="$ROOT_DIR/.local/pgdata"
PG_SOCKET="$ROOT_DIR/.local/pgsocket"
PG_LOGS="$ROOT_DIR/.local/pglogs"
PG_CTL="$PG_ROOT/usr/lib/postgresql/16/bin/pg_ctl"
PSQL="$PG_ROOT/usr/lib/postgresql/16/bin/psql"
PG_PORT="${PGPORT:-5432}"

if [[ ! -x "$PG_CTL" ]]; then
  echo "Portable PostgreSQL is not installed under .local/pgroot." >&2
  exit 1
fi

mkdir -p "$PG_SOCKET" "$PG_LOGS"

start() {
  if "$PG_CTL" -D "$PG_DATA" status >/dev/null 2>&1; then
    echo "PostgreSQL is already running."
    return
  fi

  "$PG_CTL" \
    -D "$PG_DATA" \
    -l "$PG_LOGS/postgres.log" \
    -o "-h 127.0.0.1 -p $PG_PORT -k $PG_SOCKET" \
    start
}

stop() {
  "$PG_CTL" -D "$PG_DATA" stop -m fast
}

status() {
  "$PG_CTL" -D "$PG_DATA" status
}

case "${1:-status}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  *)
    echo "Usage: npm run pg:start | npm run pg:stop | npm run pg:status" >&2
    exit 1
    ;;
esac

