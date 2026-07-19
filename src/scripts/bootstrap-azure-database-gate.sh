#!/bin/sh
set -eu

: "${KOMANDA_ENVIRONMENT:?KOMANDA_ENVIRONMENT (staging or production) is required}"
: "${NODE_MODULES_ARCHIVE_BASE_URL:?NODE_MODULES_ARCHIVE_BASE_URL is required}"
: "${NODE_MODULES_ARCHIVE_SAS:?NODE_MODULES_ARCHIVE_SAS is required}"
: "${NODE_MODULES_ARCHIVE_PARTS:?NODE_MODULES_ARCHIVE_PARTS is required}"
: "${NODE_MODULES_ARCHIVE_SHA256:?NODE_MODULES_ARCHIVE_SHA256 is required}"

archive=/tmp/komanda-node-modules.tgz
: > "$archive"
part=0
while [ "$part" -lt "$NODE_MODULES_ARCHIVE_PARTS" ]; do
  suffix=$(printf '%03d' "$part")
  wget --quiet --output-document - \
    "${NODE_MODULES_ARCHIVE_BASE_URL}${suffix}?${NODE_MODULES_ARCHIVE_SAS}" \
    >> "$archive"
  part=$((part + 1))
done
printf '%s  %s\n' "$NODE_MODULES_ARCHIVE_SHA256" "$archive" | sha256sum -c -
tar -xzf "$archive" -C /app
rm "$archive"

export KOMANDA_ENVIRONMENT
exec sh scripts/run-azure-database-gate.sh
