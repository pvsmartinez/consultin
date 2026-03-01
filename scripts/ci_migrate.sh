#!/usr/bin/env bash
# CI migration script — applies unapplied local migrations in order using psql.
# Usage: DB_URL=<postgres-url> bash scripts/ci_migrate.sh
set -euo pipefail

DB_URL="${SUPABASE_DB_URL:-${1:-}}"

if [[ -z "$DB_URL" ]]; then
  echo "Error: SUPABASE_DB_URL not set" >&2
  exit 1
fi

PSQL="psql $DB_URL --set ON_ERROR_STOP=1 -q"

# Ensure the migrations schema/table exists (idempotent)
$PSQL -c "
  CREATE SCHEMA IF NOT EXISTS supabase_migrations;
  CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version    TEXT NOT NULL PRIMARY KEY,
    inserted_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
"

echo "=== Checking applied migrations ==="
APPLIED=$($PSQL -t -c "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;" | tr -d ' \r')

APPLIED_COUNT=0
for file in $(ls supabase/migrations/*.sql | sort); do
  version=$(basename "$file" .sql)
  if echo "$APPLIED" | grep -qx "$version"; then
    echo "⏭️  $version (already applied)"
    APPLIED_COUNT=$((APPLIED_COUNT + 1))
  else
    echo "⏳  Applying $version ..."
    $PSQL -f "$file"
    $PSQL -c "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('$version') ON CONFLICT DO NOTHING;"
    echo "✅  $version"
  fi
done

TOTAL=$(ls supabase/migrations/*.sql | wc -l)
echo ""
echo "Done: $((TOTAL - APPLIED_COUNT)) migration(s) applied, $APPLIED_COUNT already up-to-date."
