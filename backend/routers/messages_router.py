"""Mesajlaşma REST + WebSocket."""

from __future__ import annotations

import asyncio
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from database import (
    applications_collection,
    companies_collection,
    conversations_collection,
    cv_collection,
    job_collection,
    messages_collection,
    users_collection,
)
from deps import (
    ensure_company_registration_dict,
    get_current_user,
    resolve_company_scoped_user,
)
from services.auth_service import payload_from_token
from services.company_scope import company_has_hr_scope, job_visible_to_company_user
from services.company_profile import profile_from_company_doc
from services.messaging_service import (
    company_can_message_employee,
    employee_can_message_company,
    employee_contact_label,
    enrich_message_for_client,
    ensure_conversation,
    mark_conversation_read,
    resolve_company_participant_for_employee,
    send_message,
    user_can_access_conversation,
)
from services.notification_email_service import notify_new_message_email
from services.ws_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/messages", tags=["Mesajlaşma"])


async def require_messaging_user(
    user: dict = Depends(get_current_user),
    x_company_id: Annotated[str | None, Header(alias="X-Company-Id")] = None,
) -> dict:
    if user["role"] == "employee":
        return user
    if user["role"] == "company":
        u = ensure_company_registration_dict(dict(user))
        return await resolve_company_scoped_user(u, x_company_id)
    raise HTTPException(403, "Mesajlaşma yalnızca aday ve şirket hesapları içindir.")


class StartConversationBody(BaseModel):
    employee_username: str | None = Field(None, max_length=32)
    company_id: str | None = Field(None, max_length=64)
    job_id: str | None = Field(None, max_length=64)


class SendMessageBody(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)


async def _conv_to_response(conv: dict, user: dict) -> dict:
    unread = 0
    if user["role"] == "employee":
        unread = int(conv.get("unread_employee") or 0)
    elif user["role"] == "company":
        unread = int(conv.get("unread_company") or 0)
    job_title = ""
    if conv.get("job_id"):
        j = await job_collection.find_one({"_id": conv["job_id"]})
        if j:
            job_title = (j.get("title") or "").strip()
    contact_label = employee_contact_label(conv) if user.get("role") == "employee" else None
    return {
        "id": conv["_id"],
        "company_id": conv.get("company_id"),
        "company_name": conv.get("company_name") or "",
        "employee_username": conv.get("employee_username"),
        "employee_label": conv.get("employee_label") or conv.get("employee_username"),
        "company_participant_username": conv.get("company_participant_username"),
        "company_participant_label": conv.get("company_participant_label"),
        "company_participant_department": conv.get("company_participant_department"),
        "contact_label": contact_label,
        "job_id": conv.get("job_id"),
        "job_title": job_title,
        "updated_at": conv.get("updated_at"),
        "last_message": conv.get("last_message") or "",
        "last_sender": conv.get("last_sender"),
        "unread": unread,
    }


async def _notify_message(conv: dict, msg: dict, sender: dict) -> None:
    payload = {
        "type": "message",
        "conversation_id": conv["_id"],
        "message": {
            "id": msg["_id"],
            "conversation_id": conv["_id"],
            "sender_username": msg["sender_username"],
            "sender_role": msg["sender_role"],
            "body": msg["body"],
            "created_at": msg["created_at"],
        },
    }
    targets = {conv["employee_username"]}
    owner = conv.get("company_participant_username")
    if owner:
        targets.add(owner)
    await ws_manager.broadcast_usernames(list(targets), payload)

    sender_label = sender.get("full_name") or sender.get("username") or "Kullanıcı"
    company_name = conv.get("company_name") or "Şirket"
    job_id = conv.get("job_id")
    job_title = None
    if job_id:
        j = await job_collection.find_one({"_id": job_id})
        job_title = j.get("title") if j else None

    if sender["role"] == "employee":
        owner = conv.get("company_participant_username")
        if owner and owner != sender.get("username"):
            try:
                await notify_new_message(
                    recipient_username=owner,
                    sender_label=sender_label,
                    company_name=company_name,
                    conversation_id=conv["_id"],
                    job_id=job_id,
                    job_title=job_title,
                    company_id=conv.get("company_id"),
                    is_employee_recipient=False,
                )
            except Exception:
                logger.exception("Mesaj bildirimi: %s", owner)
    else:
        emp = conv.get("employee_username")
        if emp and emp != sender.get("username"):
            try:
                await notify_new_message(
                    recipient_username=emp,
                    sender_label=sender_label,
                    company_name=company_name,
                    conversation_id=conv["_id"],
                    job_id=job_id,
                    job_title=job_title,
                    company_id=conv.get("company_id"),
                    is_employee_recipient=True,
                )
            except Exception:
                logger.exception("Mesaj bildirimi: %s", emp)


@router.get("/conversations")
async def list_conversations(user: dict = Depends(require_messaging_user)):
    out = []
    if user["role"] == "employee":
        query = {"employee_username": user["username"]}
    else:
        cid = user.get("effective_company_id") or user.get("company_id")
        if not cid:
            return []
        query = {
            "company_id": cid,
            "company_participant_username": user["username"],
        }

    async for conv in conversations_collection.find(query).sort("updated_at", -1).limit(80):
        if user["role"] == "company":
            if conv.get("company_participant_username") != user.get("username"):
                continue
            if not await company_can_message_employee(user, conv["employee_username"]):
                continue
        out.append(await _conv_to_response(conv, user))
    return out


@router.get("/contacts")
async def list_contacts(user: dict = Depends(require_messaging_user)):
    """Yeni sohbet başlatmak için karşı taraf listesi."""
    if user["role"] == "employee":
        seen: set[str] = set()
        out = []
        async for app in applications_collection.find({"applicant_username": user["username"]}):
            cid = app.get("company_id")
            if not cid or cid in seen:
                continue
            seen.add(cid)
            if not await employee_can_message_company(user["username"], cid):
                continue
            co = await companies_collection.find_one({"_id": cid})
            job = await job_collection.find_one({"_id": app.get("job_id")})
            out.append(
                {
                    "company_id": cid,
                    "company_name": (co.get("name") if co else "") or cid,
                    "job_id": app.get("job_id"),
                    "job_title": job.get("title") if job else None,
                }
            )
        return out

    if user["role"] != "company":
        return []

    cid = user.get("effective_company_id") or user.get("company_id")
    if not cid:
        return []
    applicants: dict[str, dict] = {}
    async for app in applications_collection.find({"company_id": cid}):
        emp = app.get("applicant_username")
        if not emp or emp in applicants:
            continue
        job = await job_collection.find_one({"_id": app.get("job_id")})
        if not job or not job_visible_to_company_user(job, user):
            continue
        if not await company_can_message_employee(user, emp):
            continue
        u = await users_collection.find_one({"username": emp})
        applicants[emp] = {
            "employee_username": emp,
            "employee_label": (u.get("full_name") if u else None) or emp,
            "job_id": app.get("job_id"),
            "job_title": job.get("title") if job else None,
        }
    return list(applicants.values())


@router.post("/conversations")
async def start_conversation(
    body: StartConversationBody,
    user: dict = Depends(require_messaging_user),
):
    if user["role"] == "employee":
        cid = (body.company_id or "").strip()
        if not cid:
            raise HTTPException(400, "Şirket seçimi gerekli.")
        if not await employee_can_message_company(user["username"], cid):
            raise HTTPException(403, "Bu şirkete yalnızca başvurduğunuz ilanlar üzerinden yazabilirsiniz.")
        jid = (body.job_id or "").strip()
        if not jid:
            raise HTTPException(
                400,
                detail="İlan seçimi gerekli. Mesajlaşma yalnızca başvurduğunuz ilan üzerinden yapılır.",
            )
        app = await applications_collection.find_one(
            {
                "applicant_username": user["username"],
                "company_id": cid,
                "job_id": jid,
            }
        )
        if not app:
            raise HTTPException(
                403,
                detail="Bu ilana başvurmadan mesaj başlatamazsınız. Önce ilana başvurun.",
            )
        try:
            participant = await resolve_company_participant_for_employee(cid, jid, user["username"])
        except ValueError as e:
            raise HTTPException(400, str(e))
        conv = await ensure_conversation(cid, user["username"], jid, participant)
        return await _conv_to_response(conv, user)

    if user["role"] == "company":
        emp = (body.employee_username or "").strip()
        if not emp:
            raise HTTPException(400, "Aday kullanıcı adı gerekli.")
        if not await company_can_message_employee(user, emp):
            raise HTTPException(403, "Bu adayla yalnızca şirketinize yapılan başvurular için yazabilirsiniz.")
        cid = user.get("effective_company_id") or user.get("company_id")
        conv = await ensure_conversation(cid, emp, body.job_id, user["username"])
        return await _conv_to_response(conv, user)

    raise HTTPException(403, "Yetkisiz.")


@router.get("/conversations/{conv_id}/context")
async def get_conversation_context(
    conv_id: str,
    user: dict = Depends(require_messaging_user),
):
    conv = await conversations_collection.find_one({"_id": conv_id})
    if not conv:
        raise HTTPException(404, "Sohbet bulunamadı.")
    if not await user_can_access_conversation(user, conv):
        raise HTTPException(403, "Erişim yok.")

    job = None
    if conv.get("job_id"):
        j = await job_collection.find_one({"_id": conv["job_id"]})
        if j:
            job = {"id": j["_id"], "title": j.get("title") or "", "department": j.get("department")}

    company_profile = None
    co = await companies_collection.find_one({"_id": conv.get("company_id")})
    if co:
        prof = profile_from_company_doc(co) or {}
        company_profile = {
            "name": prof.get("name") or co.get("name") or "",
            "email": prof.get("email") or "",
            "phone": prof.get("phone") or "",
            "address": prof.get("address") or "",
            "website": prof.get("website") or "",
        }

    cv_summary = None
    emp = conv.get("employee_username")
    if emp and user["role"] == "company":
        app_q = {"company_id": conv.get("company_id"), "applicant_username": emp}
        if conv.get("job_id"):
            app_q["job_id"] = conv["job_id"]
        app = None
        async for a in applications_collection.find(app_q).sort("created_at", -1).limit(1):
            app = a
        if not app:
            async for a in (
                applications_collection.find(
                    {"company_id": conv.get("company_id"), "applicant_username": emp}
                )
                .sort("created_at", -1)
                .limit(1)
            ):
                app = a
        if app and app.get("cv_id"):
            cv = await cv_collection.find_one({"_id": app["cv_id"]})
            if cv:
                data = cv.get("data") or {}
                cv_summary = {
                    "id": cv["_id"],
                    "display_id": cv.get("display_id"),
                    "name": data.get("name") or cv.get("filename") or "CV",
                    "email": data.get("email") or "",
                    "phone": data.get("phone") or "",
                    "skills": (data.get("skills") or [])[:8],
                    "experience_years": data.get("experience_years"),
                }

    return {
        "conversation": await _conv_to_response(conv, user),
        "job": job,
        "company_profile": company_profile,
        "cv_summary": cv_summary,
    }


@router.get("/conversations/{conv_id}/messages")
async def get_messages(
    conv_id: str,
    limit: int = Query(50, ge=1, le=100),
    user: dict = Depends(require_messaging_user),
):
    conv = await conversations_collection.find_one({"_id": conv_id})
    if not conv:
        raise HTTPException(404, "Sohbet bulunamadı.")
    if not await user_can_access_conversation(user, conv):
        raise HTTPException(403, "Erişim yok.")

    await mark_conversation_read(user, conv_id)

    rows = []
    async for m in messages_collection.find({"conversation_id": conv_id}).sort("created_at", -1).limit(limit):
        rows.append(
            enrich_message_for_client(
                {
                    "id": m["_id"],
                    "conversation_id": conv_id,
                    "sender_username": m.get("sender_username"),
                    "sender_role": m.get("sender_role"),
                    "body": m.get("body"),
                    "created_at": m.get("created_at"),
                },
                conv,
            )
        )
    rows.reverse()
    return {"messages": rows, "conversation": await _conv_to_response(conv, user)}


@router.post("/conversations/{conv_id}/messages")
async def post_message(
    conv_id: str,
    body: SendMessageBody,
    user: dict = Depends(require_messaging_user),
):
    try:
        msg = await send_message(user, conv_id, body.body)
    except LookupError:
        raise HTTPException(404, "Sohbet bulunamadı.")
    except PermissionError:
        raise HTTPException(403, "Erişim yok.")
    except ValueError as e:
        raise HTTPException(400, str(e))

    conv = await conversations_collection.find_one({"_id": conv_id})
    if conv:
        await _notify_message(conv, msg, user)
        asyncio.create_task(notify_new_message_email(conv, msg, user))

    out = {
        "id": msg["_id"],
        "conversation_id": conv_id,
        "sender_username": msg["sender_username"],
        "sender_role": msg["sender_role"],
        "body": msg["body"],
        "created_at": msg["created_at"],
    }
    if conv:
        out = enrich_message_for_client(out, conv)
    return out


@router.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: str, user: dict = Depends(require_messaging_user)):
    conv = await conversations_collection.find_one({"_id": conv_id})
    if not conv:
        raise HTTPException(404, "Sohbet bulunamadı.")
    if not await user_can_access_conversation(user, conv):
        raise HTTPException(403, "Erişim yok.")
    await messages_collection.delete_many({"conversation_id": conv_id})
    await conversations_collection.delete_one({"_id": conv_id})
    return {"ok": True, "message": "Sohbet silindi."}


@router.post("/conversations/{conv_id}/read")
async def post_read(conv_id: str, user: dict = Depends(require_messaging_user)):
    conv = await conversations_collection.find_one({"_id": conv_id})
    if not conv:
        raise HTTPException(404, "Sohbet bulunamadı.")
    if not await user_can_access_conversation(user, conv):
        raise HTTPException(403, "Erişim yok.")
    await mark_conversation_read(user, conv_id)
    return {"ok": True}


@router.websocket("/ws")
async def messages_websocket(websocket: WebSocket, token: str = Query(...)):
    payload = payload_from_token(token)
    if not payload or not payload.get("sub"):
        await websocket.close(code=4401)
        return
    username = payload["sub"]
    doc = await users_collection.find_one({"username": username})
    if not doc or doc.get("role") not in ("employee", "company"):
        await websocket.close(code=4403)
        return

    await ws_manager.connect(username, websocket)
    try:
        await websocket.send_json({"type": "connected", "username": username})
        while True:
            raw = await websocket.receive_text()
            if raw == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("WebSocket hata: %s", username)
    finally:
        await ws_manager.disconnect(username, websocket)
