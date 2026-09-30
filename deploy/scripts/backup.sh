#!/usr/bin/env bash
# Daily backup. Two things hold data that matters: Postgres (customers, bookings, payments, all other records) and
# UPLOAD_DIR on disk (uploaded visas, tickets and vouchers — encrypted at rest, stored outside the database since
# storage.service.ts moved documents off Postgres). Both are dumped here; keeps the last 14 days of each.
#
# Install (as root):   cp /var/www/mashkoor/mashkoor-dashboard/deploy/scripts/backup.sh /usr/local/bin/mashkoor-backup && chmod +x /usr/local/bin/mashkoor-backup
#                      echo '15 2 * * * root /usr/local/bin/mashkoor-backup >> /var/log/mashkoor-backup.log 2>&1' > /etc/cron.d/mashkoor-backup
# Then copy /var/backups/mashkoor off the server too (Hostinger snapshots, or scp/rclone to another machine).
set -euo pipefail

DIR=/var/backups/mashkoor
# Must match UPLOAD_DIR in backend/.env.
UPLOAD_DIR=/var/lib/mashkoor/uploads
KEEP_DAYS=14
STAMP=$(date +%Y%m%d-%H%M%S)

if ! docker ps --format '{{.Names}}' | grep -qx mashkoor-postgres; then echo "$(date -Is) database container is not running"; exit 1; fi
mkdir -p "$DIR"

DB_FILE="$DIR/mashkoor-db-$STAMP.dump"
docker exec mashkoor-postgres pg_dump -U mashkoor -Fc mashkoor > "$DB_FILE"
# A dump that is suspiciously small means something went wrong.
if [ "$(stat -c%s "$DB_FILE")" -lt 10000 ]; then echo "$(date -Is) database backup looks empty: $DB_FILE"; exit 1; fi

UPLOADS_FILE="$DIR/mashkoor-uploads-$STAMP.tar.gz"
if [ -d "$UPLOAD_DIR" ]; then
  tar -czf "$UPLOADS_FILE" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")"
else
  echo "$(date -Is) warning: $UPLOAD_DIR does not exist — no documents to back up, or UPLOAD_DIR has moved"
fi

find "$DIR" -name 'mashkoor-db-*.dump' -mtime +"$KEEP_DAYS" -delete
find "$DIR" -name 'mashkoor-uploads-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: $DB_FILE ($(du -h "$DB_FILE" | cut -f1))$( [ -f "$UPLOADS_FILE" ] && echo ", $UPLOADS_FILE ($(du -h "$UPLOADS_FILE" | cut -f1))" )"
