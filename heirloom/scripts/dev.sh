#!/usr/bin/env bash
# Start Heirloom (API on :8000, web on :3100). Works with no keys: every missing
# credential falls back to its offline provider. Pass --reset to reseed first.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="$ROOT/services/api"
WEB="$ROOT/apps/web"

PY="${PYTHON:-$(command -v python3.12 || command -v python3.13 || command -v python3)}"
if [ ! -x "$API/.venv/bin/python" ]; then
  echo "Creating Python venv with $PY (needs 3.10+)…"
  "$PY" -m venv "$API/.venv"
  "$API/.venv/bin/pip" install -q --upgrade pip
  "$API/.venv/bin/pip" install -q -r "$API/requirements.txt"
fi
[ -d "$WEB/node_modules" ] || (cd "$WEB" && npm install --no-audit --no-fund)
[ -f "$ROOT/.env" ] || cp "$ROOT/.env.example" "$ROOT/.env"

if [ "${1:-}" = "--reset" ]; then
  (cd "$API" && .venv/bin/python scripts/seed.py)
fi

(cd "$API" && exec .venv/bin/uvicorn main:app --port 8000) &
API_PID=$!
(cd "$WEB" && exec npm run dev) &
WEB_PID=$!
trap 'kill $API_PID $WEB_PID 2>/dev/null' EXIT INT TERM
echo "Heirloom: http://localhost:3100  (API http://localhost:8000/health)"
wait
