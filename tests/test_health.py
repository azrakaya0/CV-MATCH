import os
import sys

import pytest
from httpx import ASGITransport, AsyncClient

# backend modülünü import edebilmek için
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("SEED_DEMO_USERS", "false")

from main import app  # noqa: E402

pytestmark = pytest.mark.asyncio


async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "database" in data
    assert "environment" in data
