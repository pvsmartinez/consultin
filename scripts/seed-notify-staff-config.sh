#!/bin/bash
# Seeds notify_staff_config table with Supabase URL + service role key.
# Run this once after `bash scripts/apply-migrations.sh`.
# Reads credentials from app/.env — never stored in git.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
APP_ENV="$ROOT_DIR/app/.env"

# ── Find psql ────────────────────────────────────────────────────────────────
PSQL=""
for candidate in \
  /usr/local/Cellar/libpq/*/bin/psql \
  /opt/homebrew/opt/libpq/bin/psql \
  $(which psql 2>/dev/null || true)
do
  [[ -x "$candidate" ]] && PSQL="$candidate" && break
done

if [[ -z "$PSQL" ]]; then
  echo "❌ psql não encontrado. Instale com: brew install libpq"
  exit 1
fi

# ── Read credentials ──────────────────────────────────────────────────────────
if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  PEDRIN_ENV="/Users/pedromartinez/Dev/pmatz/pedrin/.env"
  [[ -f "$PEDRIN_ENV" ]] && SUPABASE_DB_PASSWORD="$(grep '^SUPABASE_DB_PASSWORD=' "$PEDRIN_ENV" | head -1 | cut -d'=' -f2-)"
fi

if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "❌ SUPABASE_DB_PASSWORD não encontrado."
  exit 1
fi

if [[ ! -f "$APP_ENV" ]]; then
  echo "❌ $APP_ENV não encontrado."
  exit 1
fi

SUPABASE_URL="$(grep '^VITE_SUPABASE_URL=' "$APP_ENV" | head -1 | cut -d'=' -f2-)"
SERVICE_KEY="$(grep  '^SUPABASE_SERVICE_KEY=' "$APP_ENV" | head -1 | cut -d'=' -f2-)"

if [[ -z "$SUPABASE_URL" || -z "$SERVICE_KEY" ]]; then
  echo "❌ VITE_SUPABASE_URL ou SUPABASE_SERVICE_KEY ausentes em $APP_ENV"
  exit 1
fi

DB_HOST="db.nxztzehgnkdmluogxehi.supabase.co"

echo "🔧 Configurando notify_staff_config..."
PGPASSWORD="$SUPABASE_DB_PASSWORD" "$PSQL" \
  -h "$DB_HOST" -p 5432 -U postgres -d postgres \
  -c "INSERT INTO notify_staff_config (key, value)
      VALUES ('supabase_url', '${SUPABASE_URL}'), ('service_role_key', '${SERVICE_KEY}')
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;" \
  2>&1 | grep -v "^NOTICE" || true

echo "✅ notify_staff_config ok — trigger de notificações de staff ativo."
