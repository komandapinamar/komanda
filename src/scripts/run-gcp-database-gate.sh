#!/bin/sh
set -eu

export DATABASE_PROVIDER="${DATABASE_PROVIDER:-gcp}"
exec sh scripts/run-database-gate.sh
