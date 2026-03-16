# Kiri Backend — FastAPI (Production)
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1

WORKDIR /app

# System deps for bio-computation libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ gfortran libopenblas-dev libhdf5-dev pkg-config libcairo2-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY . .

EXPOSE ${PORT:-8000}

# Production: no --reload, use workers, respect $PORT from Railway
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2
