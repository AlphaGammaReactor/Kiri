#!/bin/sh
# A mounted volume (Railway, Docker) arrives owned by root. Give the data
# folder to the unprivileged user, then drop root before starting Kiri.
set -e
if [ "$(id -u)" = "0" ]; then
    chown -R kiri:kiri "${KIRI_DATA_DIR:-/data}" 2>/dev/null || true
    exec gosu kiri "$@"
fi
exec "$@"
