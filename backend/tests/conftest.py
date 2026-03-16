"""
Kiri — Test Configuration (conftest.py)

Async httpx client for tests against Docker-hosted Kiri backend.
"""

import sys
import os
import pytest
import pytest_asyncio
import httpx

# Ensure the backend app is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

API_BASE = "http://localhost:8000/api"


@pytest_asyncio.fixture
async def client():
    """Async HTTP client — fresh per test to avoid event loop issues."""
    async with httpx.AsyncClient(base_url=API_BASE, timeout=30.0) as c:
        # Quick health check
        try:
            resp = await c.get("/health")
            if resp.status_code != 200:
                pytest.skip("Backend health check failed")
        except (httpx.ConnectError, httpx.ConnectTimeout):
            pytest.skip("Backend not running — start with: docker compose up -d api")
        yield c
