#!/bin/sh
set -eu

: "${DATABASE_PREPARE_REPORT:=/tmp/staging-database-readiness.json}"
: "${DATABASE_RESTORE_REPORT:=/tmp/staging-restore-drill.json}"
export DATABASE_PREPARE_REPORT DATABASE_RESTORE_REPORT

npm run db:prepare:azure
npm run test:database-compatibility:azure-staging
npm run db:restore-drill

printf '%s\n' '---BEGIN_STAGING_DATABASE_READINESS---'
cat "$DATABASE_PREPARE_REPORT"
printf '%s\n' '---END_STAGING_DATABASE_READINESS---'
printf '%s\n' '---BEGIN_STAGING_RESTORE_DRILL---'
cat "$DATABASE_RESTORE_REPORT"
printf '%s\n' '---END_STAGING_RESTORE_DRILL---'
