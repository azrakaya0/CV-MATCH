import os
import sys

import pytest
from httpx import ASGITransport, AsyncClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("SEED_DEMO_USERS", "false")

from main import app  # noqa: E402

pytestmark = pytest.mark.asyncio


async def test_login_invalid_credentials():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/auth/login",
            json={"username": "nonexistent", "password": "wrongpassword"}
        )
    assert response.status_code == 401


async def test_username_available():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/auth/username-available?username=testuser123")
    assert response.status_code == 200
    data = response.json()
    assert "available" in data


async def test_kvkk_document():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/auth/kvkk-document")
    assert response.status_code == 200
    data = response.json()
    assert "version" in data
    assert "html" in data
