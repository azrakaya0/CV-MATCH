"""SMTP ile otomatik e-posta bildirimleri (mesaj, başvuru)."""

from __future__ import annotations

import asyncio
import logging

from config import settings
from database import job_collection, users_collection
from services.company_scope import company_has_hr_scope, job_visible_to_company_user
from services.email_service import send_email, smtp_configured
from services.messaging_service import company_can_message_employee

logger = logging.getLogger(__name__)


def _user_wants_email(doc: dict | None) -> bool:
    if not doc:
        return False
    if doc.get("notify_email") is False:
        return False
    em = (doc.get("email") or "").strip()
    return bool(em and "@" in em)


async def _send_async(to: str, subject: str, body: str) -> bool:
    return await asyncio.to_thread(send_email, to, subject, body)


def _app_messages_url() -> str:
    base = (settings.APP_PUBLIC_URL or "http://localhost:8000").rstrip("/")
    return f"{base}/#messages"


def _app_applicants_url() -> str:
    base = (settings.APP_PUBLIC_URL or "http://localhost:8000").rstrip("/")
    return f"{base}/#job-applicants"


async def _company_usernames(company_id: str) -> list[str]:
    names: set[str] = set()
    async for u in users_collection.find({"role": "company"}):
        cid = u.get("company_id")
        managed = u.get("managed_company_ids") or []
        if cid == company_id or company_id in managed:
            names.add(u["username"])
    return list(names)


async def notify_new_message_email(conv: dict, msg: dict, sender: dict) -> None:
    if not smtp_configured():
        return
    preview = ((msg.get("body") or "").strip())[:280]
    if len((msg.get("body") or "")) > 280:
        preview += "…"
    link = _app_messages_url()
    company_name = conv.get("company_name") or "Şirket"
    employee_label = conv.get("employee_label") or conv.get("employee_username") or "Aday"
    sender_username = sender.get("username")
    sender_label = sender.get("full_name") or sender_username or "Kullanıcı"

    try:
        if sender.get("role") == "employee":
            owner = conv.get("company_participant_username")
            if not owner or owner == sender_username:
                return
            u = await users_collection.find_one({"username": owner})
            if not u or not _user_wants_email(u):
                return
            subject = f"CVMatch — {employee_label} size mesaj gönderdi"
            body = (
                f"Merhaba,\n\n"
                f"{employee_label}, «{company_name}» ile olan görüşmenizde size mesaj gönderdi:\n\n"
                f"«{preview}»\n\n"
                f"Yanıtlamak için: {link}\n\n"
                f"— CVMatch AI"
            )
            await _send_async(u["email"].strip(), subject, body)
        else:
            emp_username = conv.get("employee_username")
            if not emp_username or emp_username == sender_username:
                return
            u = await users_collection.find_one({"username": emp_username})
            if not u or not _user_wants_email(u):
                return
            subject = f"CVMatch — {sender_label} ({company_name}) size mesaj gönderdi"
            body = (
                f"Merhaba {u.get('full_name') or emp_username},\n\n"
                f"{sender_label}, {company_name} adına size mesaj gönderdi:\n\n"
                f"«{preview}»\n\n"
                f"Okumak için: {link}\n\n"
                f"— CVMatch AI"
            )
            await _send_async(u["email"].strip(), subject, body)
    except Exception:
        logger.exception("Mesaj e-postası gönderilemedi conv=%s", conv.get("_id"))


async def notify_new_application_email(
    *,
    company_id: str,
    job_id: str,
    job_title: str,
    applicant_username: str,
) -> None:
    if not smtp_configured():
        return
    applicant = await users_collection.find_one({"username": applicant_username})
    applicant_label = (applicant.get("full_name") if applicant else None) or applicant_username
    title = (job_title or "İlan")[:120]
    link = _app_applicants_url()
    subject = f"CVMatch — İlanınıza yeni başvuru: {title}"

    job_doc = await job_collection.find_one({"_id": job_id})

    try:
        for username in await _company_usernames(company_id):
            u = await users_collection.find_one({"username": username})
            if not u or not _user_wants_email(u):
                continue
            if company_has_hr_scope(u):
                pass
            elif job_doc and job_visible_to_company_user(job_doc, u):
                pass
            else:
                continue
            body = (
                f"Merhaba,\n\n"
                f"«{title}» ilanınıza yeni bir başvuru geldi.\n"
                f"Aday: {applicant_label}\n\n"
                f"Başvuruları görüntülemek için: {link}\n\n"
                f"— CVMatch AI"
            )
            await _send_async(u["email"].strip(), subject, body)
    except Exception:
        logger.exception("Başvuru e-postası gönderilemedi company=%s", company_id)
