"""İK/departman ↔ aday mesajlaşma (kişisel sohbet izolasyonu)."""

from __future__ import annotations

from datetime import datetime

from database import (
    applications_collection,
    companies_collection,
    conversations_collection,
    job_collection,
    messages_collection,
    users_collection,
)
from services.company_scope import company_has_hr_scope, job_visible_to_company_user, normalize_dept


def conversation_id(
    company_id: str,
    employee_username: str,
    company_participant_username: str,
) -> str:
    emp = employee_username.strip().lower()
    part = company_participant_username.strip().lower()
    return f"{company_id}:{emp}:{part}"


def legacy_conversation_id(company_id: str, employee_username: str) -> str:
    return f"{company_id}:{employee_username.strip().lower()}"


def is_legacy_conversation_id(conv_id: str) -> bool:
    return conv_id.count(":") < 2


async def employee_applied_to_company(employee_username: str, company_id: str) -> bool:
    async for _app in applications_collection.find(
        {"applicant_username": employee_username, "company_id": company_id}
    ):
        return True
    return False


async def company_can_message_employee(user: dict, employee_username: str) -> bool:
    cid = user.get("effective_company_id") or user.get("company_id")
    if not cid:
        return False
    if not await employee_applied_to_company(employee_username, cid):
        return False
    if company_has_hr_scope(user):
        return True
    async for app in applications_collection.find(
        {"applicant_username": employee_username, "company_id": cid}
    ):
        job = await job_collection.find_one({"_id": app["job_id"]})
        if job and job_visible_to_company_user(job, user):
            return True
    return False


async def employee_can_message_company(employee_username: str, company_id: str) -> bool:
    return await employee_applied_to_company(employee_username, company_id)


async def _participant_meta(username: str) -> dict:
    u = await users_collection.find_one({"username": username})
    if not u:
        return {
            "company_participant_username": username,
            "company_participant_label": username,
            "company_participant_department": "",
            "company_participant_access": "hr",
        }
    return {
        "company_participant_username": username,
        "company_participant_label": (u.get("full_name") or "").strip() or username,
        "company_participant_department": (u.get("department") or "").strip(),
        "company_participant_access": (u.get("company_access") or "hr"),
    }


def employee_contact_label(conv: dict) -> str:
    parts: list[str] = []
    name = (conv.get("company_name") or "").strip()
    if name:
        parts.append(name)
    dept = (conv.get("company_participant_department") or "").strip()
    if dept:
        parts.append(dept)
    person = (conv.get("company_participant_label") or conv.get("company_participant_username") or "").strip()
    if person:
        parts.append(person)
    return " · ".join(parts) if parts else "Şirket"


def company_sender_label(conv: dict) -> str:
    return employee_contact_label(conv)


async def _first_hr_username(company_id: str) -> str | None:
    async for u in users_collection.find({"role": "company"}):
        cid = u.get("company_id")
        managed = u.get("managed_company_ids") or []
        if cid != company_id and company_id not in managed:
            continue
        if company_has_hr_scope(u):
            return u["username"]
    return None


async def resolve_company_participant_for_employee(
    company_id: str,
    job_id: str,
    employee_username: str,
) -> str:
    """Adayın «Mesaj gönder» ile açtığı sohbetin şirket tarafı alıcısı."""
    app = await applications_collection.find_one(
        {
            "applicant_username": employee_username,
            "company_id": company_id,
            "job_id": job_id,
        }
    )
    if app and app.get("assigned_reviewer_username"):
        rev = str(app["assigned_reviewer_username"]).strip()
        u = await users_collection.find_one({"username": rev, "role": "company"})
        if u:
            uc = u.get("company_id")
            managed = u.get("managed_company_ids") or []
            if uc == company_id or company_id in managed:
                return rev

    job = await job_collection.find_one({"_id": job_id})
    dept = (job.get("department") or "").strip() if job else ""
    if dept:
        dn = normalize_dept(dept)
        async for u in users_collection.find({"role": "company"}):
            uc = u.get("company_id")
            managed = u.get("managed_company_ids") or []
            if uc != company_id and company_id not in managed:
                continue
            if (u.get("company_access") or "") == "department" and normalize_dept(u.get("department")) == dn:
                return u["username"]

    hr = await _first_hr_username(company_id)
    if hr:
        return hr
    raise ValueError("Bu ilan için mesaj alıcısı bulunamadı.")


async def get_conversation_doc(conv_id: str) -> dict | None:
    return await conversations_collection.find_one({"_id": conv_id})


async def ensure_conversation(
    company_id: str,
    employee_username: str,
    job_id: str | None,
    company_participant_username: str,
) -> dict:
    part = company_participant_username.strip()
    cid = conversation_id(company_id, employee_username, part)
    now = datetime.utcnow().isoformat()
    existing = await conversations_collection.find_one({"_id": cid})
    meta = await _participant_meta(part)
    if existing:
        patch: dict = {}
        if job_id and not existing.get("job_id"):
            patch["job_id"] = job_id
        for k, v in meta.items():
            if existing.get(k) != v:
                patch[k] = v
        if patch:
            await conversations_collection.update_one({"_id": cid}, {"$set": patch})
            existing.update(patch)
        return existing

    co = await companies_collection.find_one({"_id": company_id})
    emp = await users_collection.find_one({"username": employee_username})
    doc = {
        "_id": cid,
        "company_id": company_id,
        "employee_username": employee_username,
        "company_name": (co.get("name") if co else "") or "",
        "employee_label": (emp.get("full_name") if emp else None) or employee_username,
        "job_id": job_id,
        "created_at": now,
        "updated_at": now,
        "last_message": "",
        "last_sender": None,
        "unread_employee": 0,
        "unread_company": 0,
        **meta,
    }
    await conversations_collection.insert_one(doc)
    return doc


async def user_can_access_conversation(user: dict, conv: dict) -> bool:
    role = user.get("role")
    if role == "employee":
        return conv.get("employee_username") == user.get("username")
    if role == "company":
        cid = user.get("effective_company_id") or user.get("company_id")
        if conv.get("company_id") != cid:
            return False
        owner = conv.get("company_participant_username")
        if not owner or owner != user.get("username"):
            return False
        return await company_can_message_employee(user, conv["employee_username"])
    return False


def enrich_message_for_client(msg: dict, conv: dict) -> dict:
    out = dict(msg)
    if msg.get("sender_role") == "company":
        out["sender_label"] = company_sender_label(conv)
    else:
        out["sender_label"] = conv.get("employee_label") or msg.get("sender_username") or "Aday"
    return out


def _inc_unread(conv: dict, sender_role: str) -> dict:
    if sender_role == "employee":
        return {"unread_company": int(conv.get("unread_company") or 0) + 1}
    return {"unread_employee": int(conv.get("unread_employee") or 0) + 1}


async def send_message(
    user: dict,
    conv_id: str,
    body: str,
) -> dict:
    text = (body or "").strip()
    if not text or len(text) > 4000:
        raise ValueError("Mesaj boş olamaz veya çok uzun.")

    conv = await get_conversation_doc(conv_id)
    if not conv:
        raise LookupError("Sohbet bulunamadı.")
    if not await user_can_access_conversation(user, conv):
        raise PermissionError("Bu sohbete erişiminiz yok.")

    now = datetime.utcnow().isoformat()
    role = user["role"]
    msg = {
        "_id": f"{conv_id}:{now}:{user['username']}",
        "conversation_id": conv_id,
        "sender_username": user["username"],
        "sender_role": role,
        "body": text,
        "created_at": now,
    }
    await messages_collection.insert_one(msg)

    preview = text if len(text) <= 120 else text[:117] + "…"
    upd = {
        "updated_at": now,
        "last_message": preview,
        "last_sender": user["username"],
        **_inc_unread(conv, role),
    }
    await conversations_collection.update_one({"_id": conv_id}, {"$set": upd})
    msg["conversation_id"] = conv_id
    return enrich_message_for_client(msg, conv)


async def mark_conversation_read(user: dict, conv_id: str) -> None:
    conv = await get_conversation_doc(conv_id)
    if not conv or not await user_can_access_conversation(user, conv):
        return
    if user["role"] == "employee":
        await conversations_collection.update_one(
            {"_id": conv_id}, {"$set": {"unread_employee": 0}}
        )
    else:
        await conversations_collection.update_one(
            {"_id": conv_id}, {"$set": {"unread_company": 0}}
        )


async def migrate_legacy_conversations() -> None:
    """Eski paylaşımlı sohbetleri ilk şirket gönderenine / İK'ya taşır."""
    migrated = 0
    async for conv in conversations_collection.find({}):
        old_id = conv["_id"]
        if not is_legacy_conversation_id(old_id):
            continue
        company_id = conv.get("company_id")
        employee_username = conv.get("employee_username")
        if not company_id or not employee_username:
            continue
        participant = conv.get("company_participant_username")
        if not participant:
            async for m in messages_collection.find(
                {"conversation_id": old_id, "sender_role": "company"}
            ).sort("created_at", 1).limit(1):
                participant = m.get("sender_username")
        if not participant:
            participant = await _first_hr_username(company_id)
        if not participant:
            continue
        new_id = conversation_id(company_id, employee_username, participant)
        if new_id == old_id:
            continue
        meta = await _participant_meta(participant)
        target = await conversations_collection.find_one({"_id": new_id})
        if target:
            await messages_collection.update_many(
                {"conversation_id": old_id},
                {"$set": {"conversation_id": new_id}},
            )
            await conversations_collection.delete_one({"_id": old_id})
            migrated += 1
            continue
        new_doc = {**conv, "_id": new_id, **meta}
        await conversations_collection.insert_one(new_doc)
        await messages_collection.update_many(
            {"conversation_id": old_id},
            {"$set": {"conversation_id": new_id}},
        )
        await conversations_collection.delete_one({"_id": old_id})
        migrated += 1
    if migrated:
        import logging

        logging.getLogger(__name__).info("Eski mesaj sohbetleri taşındı: %s", migrated)
