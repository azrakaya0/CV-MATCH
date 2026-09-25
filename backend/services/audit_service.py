import logging
from datetime import datetime
from typing import Any

from database import audit_logs_collection

logger = logging.getLogger(__name__)


async def log_audit(
    action: str,
    *,
    username: str | None = None,
    role: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    company_id: str | None = None,
    ip: str | None = None,
    meta: dict[str, Any] | None = None,
) -> None:
    doc = {
        "action": action,
        "username": username,
        "role": role,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "company_id": company_id,
        "ip": ip,
        "meta": meta or {},
        "created_at": datetime.utcnow().isoformat(),
    }
    try:
        await audit_logs_collection.insert_one(doc)
    except Exception:
        logger.exception("Audit kaydı yazılamadı: %s", action)
