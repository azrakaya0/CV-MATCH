import uuid

from datetime import datetime



from fastapi import APIRouter, Depends, HTTPException



from database import job_collection, notifications_collection

from deps import get_current_user, require_company_scoped

from services.company_scope import company_has_hr_scope, job_visible_to_company_user

from services.notification_service import (

    notify_application_submitted,

    notify_new_application_to_company,

)



router = APIRouter(prefix="/api/notifications", tags=["Bildirimler"])





def _notif_query_for_user(user: dict) -> dict:

    un = user["username"]

    if user["role"] == "company":

        cid = user.get("effective_company_id") or user.get("company_id")

        return {

            "$or": [

                {"recipient_username": un},

                {"company_id": cid, "recipient_username": {"$exists": False}},

            ]

        }

    return {"recipient_username": un}





async def _notification_visible(doc: dict, user: dict) -> bool:

    run = doc.get("recipient_username")

    if run and run == user["username"]:

        return True

    if user["role"] != "company":

        return False

    if run and run != user["username"]:

        return False

    cid = user.get("effective_company_id") or user.get("company_id")

    if doc.get("company_id") != cid:

        return False

    jid = doc.get("job_id")

    if not jid:

        return company_has_hr_scope(user)

    j = await job_collection.find_one({"_id": jid})

    if not j:

        return False

    return job_visible_to_company_user(j, user)





@router.get("/unread-count")

async def unread_count(user: dict = Depends(get_current_user)):

    if user["role"] == "admin":

        return {"count": 0}

    n = 0

    un = user["username"]

    async for doc in notifications_collection.find(_notif_query_for_user(user)):

        if not await _notification_visible(doc, user):

            continue

        read_by = doc.get("read_by") or []

        if un not in read_by:

            n += 1

    return {"count": n}





@router.get("")

async def list_notifications(limit: int = 40, user: dict = Depends(get_current_user)):

    if user["role"] == "admin":

        return []

    un = user["username"]

    lim = max(1, min(limit, 100))

    out = []

    fetch_lim = lim * 8 if user["role"] == "company" and not company_has_hr_scope(user) else lim * 3

    async for doc in notifications_collection.find(_notif_query_for_user(user)).sort(

        "created_at", -1

    ).limit(fetch_lim):

        if not await _notification_visible(doc, user):

            continue

        read_by = doc.get("read_by") or []

        out.append(

            {

                "id": doc["_id"],

                "kind": doc.get("kind"),

                "job_id": doc.get("job_id"),

                "job_title": doc.get("job_title"),

                "conversation_id": doc.get("conversation_id"),

                "message": doc.get("message"),

                "created_at": doc.get("created_at"),

                "read": un in read_by,

            }

        )

        if len(out) >= lim:

            break

    return out





@router.post("/{notification_id}/read")

async def mark_read(notification_id: str, user: dict = Depends(get_current_user)):

    if user["role"] == "admin":

        raise HTTPException(404, "Bildirim bulunamadı.")

    doc = await notifications_collection.find_one({"_id": notification_id})

    if not doc or not await _notification_visible(doc, user):

        raise HTTPException(404, "Bildirim bulunamadı.")

    await notifications_collection.update_one(

        {"_id": notification_id},

        {"$addToSet": {"read_by": user["username"]}},

    )

    return {"ok": True}





async def create_application_notification(

    *,

    company_id: str,

    job_id: str,

    job_title: str,

    application_id: str,

    applicant_username: str | None = None,

    applicant_label: str | None = None,

) -> None:

    """Şirket kullanıcıları + (isteğe bağlı) aday için başvuru bildirimi."""

    await notify_new_application_to_company(

        company_id=company_id,

        job_id=job_id,

        job_title=job_title,

        application_id=application_id,

        applicant_label=applicant_label or applicant_username or "Aday",

    )

    if applicant_username:

        await notify_application_submitted(

            applicant_username=applicant_username,

            job_title=job_title,

            job_id=job_id,

        )


