"""WebSocket bağlantı yöneticisi — kullanıcı başına anlık bildirim."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, username: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.setdefault(username, set()).add(websocket)

    async def disconnect(self, username: str, websocket: WebSocket) -> None:
        async with self._lock:
            conns = self._connections.get(username)
            if conns:
                conns.discard(websocket)
                if not conns:
                    del self._connections[username]

    async def send_json(self, username: str, payload: dict[str, Any]) -> None:
        async with self._lock:
            conns = list(self._connections.get(username, set()))
        dead: list[WebSocket] = []
        data = json.dumps(payload, ensure_ascii=False)
        for ws in conns:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(username, ws)

    async def broadcast_usernames(self, usernames: list[str], payload: dict[str, Any]) -> None:
        seen = set()
        for u in usernames:
            if not u or u in seen:
                continue
            seen.add(u)
            await self.send_json(u, payload)


ws_manager = ConnectionManager()
