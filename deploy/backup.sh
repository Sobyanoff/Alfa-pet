#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${DB_PATH:-/var/lib/alfa-tracker/alfa.db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/alfa}"

mkdir -p "${BACKUP_DIR}"
sqlite3 "${DB_PATH}" ".backup '${BACKUP_DIR}/alfa-$(date +%Y%m%d-%H%M).db'"
find "${BACKUP_DIR}" -name 'alfa-*.db' -mtime +14 -delete
