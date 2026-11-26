# Kiri — hosted test build (one container: API + built frontend)
#
#   docker build -t kiri-test .
#   docker run -p 8000:8000 -v kiri-data:/data \
#     -e KIRI_ACCESS_PASSWORD='choose-a-long-password' kiri-test
#
# The container always runs in server mode: the whole site is behind
# KIRI_ACCESS_PASSWORD and it refuses to start without one.

# ── Stage 1: build the frontend ──
FROM node:22-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ── Stage 2: install Python dependencies from the lockfile ──
FROM python:3.11-slim AS python-deps
# pycairo (needed by svglib for SVG figures in PDF export) has no Linux wheel, so it compiles here.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc pkg-config libcairo2-dev \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir uv==0.11.32
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/venv
WORKDIR /build
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

# ── Stage 3: runtime ──
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    MPLCONFIGDIR=/tmp/matplotlib \
    KIRI_SERVER_MODE=true \
    KIRI_DATA_DIR=/data \
    KIRI_STATIC_DIR=/app/static \
    HOST=0.0.0.0

# libgomp: OpenMP runtime needed by scikit-learn. libcairo2: runtime for pycairo. gosu: drop root after fixing volume ownership.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 libcairo2 gosu \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home-dir /app --shell /usr/sbin/nologin kiri \
    && mkdir -p /data && chown kiri:kiri /data

WORKDIR /app
COPY --from=python-deps /opt/venv /opt/venv
COPY backend/app ./app
COPY --from=frontend /build/dist ./static
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh

VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import os,urllib.request as u; u.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORT','8000'), timeout=4)" || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
# One worker: the job list, cache and sign-in lockouts live in this process.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --proxy-headers --forwarded-allow-ips='*'"]
