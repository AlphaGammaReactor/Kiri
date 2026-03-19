#!/bin/bash
# Kiri — Dev Entrypoint
# Install any new/updated Python deps at container startup (fast for incremental changes)
# Then start the API server.

set -e

echo "🔄 Syncing Python dependencies..."
pip install --quiet --no-cache-dir -r requirements.txt 2>&1 | tail -5

echo "🚀 Starting Kiri API..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2
