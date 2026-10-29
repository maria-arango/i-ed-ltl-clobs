#!/usr/bin/env bash
# Run the test suite against a LOCAL PostgreSQL, never the live database.
#
#   npm run test:local                 # whole suite
#   npm run test:local -- tests/x.test.ts
#
# Needs a Postgres you can reach as a superuser. Default: the throwaway
# server on port 54329 (see docs/06-handoff.md, "Local database").
# Override with LOCAL_PG=postgresql://user@host:port
set -euo pipefail
LOCAL_PG="${LOCAL_PG:-postgresql://postgres@localhost:54329}"
DB="${LOCAL_TEST_DB:-clobs_test}"
case "$LOCAL_PG" in *neon.tech*) echo "Refusing: LOCAL_PG points at Neon." >&2; exit 1;; esac

hostport="${LOCAL_PG#*@}"
export DATABASE_URL="$LOCAL_PG/$DB"
export CODER_ROLE_PASSWORD="local-test"
export DATABASE_URL_CODER="postgresql://clobs_coder:local-test@$hostport/$DB"
export CLOBS_SKIP_ENV_WRITE=1

psql "$LOCAL_PG/postgres" -qtc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1 \
  || psql "$LOCAL_PG/postgres" -qc "CREATE DATABASE $DB"
npx drizzle-kit migrate
node scripts/setup-coder-role.mts
node scripts/seed-rubric.mts
npx vitest run "$@"
