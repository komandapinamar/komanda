#!/bin/sh
set -eu

: "${KOMANDA_ENVIRONMENT:?KOMANDA_ENVIRONMENT (staging or production) is required}"
: "${DATABASE_PROVIDER:=gcp}"
: "${DATABASE_PREPARE_REPORT:=/tmp/${KOMANDA_ENVIRONMENT}-database-readiness.json}"
: "${DATABASE_RESTORE_REPORT:=/tmp/${KOMANDA_ENVIRONMENT}-restore-drill.json}"
export DATABASE_PREPARE_REPORT DATABASE_RESTORE_REPORT

case "$DATABASE_PROVIDER" in
  gcp) ;;
  *) echo "DATABASE_PROVIDER must be gcp." >&2; exit 1 ;;
esac

npm run "db:prepare:${DATABASE_PROVIDER}"
npm run "test:database-compatibility:${DATABASE_PROVIDER}-${KOMANDA_ENVIRONMENT}"
npm run db:restore-drill

printf '%s\n' "---BEGIN_${KOMANDA_ENVIRONMENT}_DATABASE_READINESS---"
cat "$DATABASE_PREPARE_REPORT"
printf '%s\n' "---END_${KOMANDA_ENVIRONMENT}_DATABASE_READINESS---"
printf '%s\n' "---BEGIN_${KOMANDA_ENVIRONMENT}_RESTORE_DRILL---"
cat "$DATABASE_RESTORE_REPORT"
printf '%s\n' "---END_${KOMANDA_ENVIRONMENT}_RESTORE_DRILL---"
