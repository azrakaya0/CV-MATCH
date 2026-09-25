import asyncio
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import applications_collection, cv_collection, job_collection, users_collection
from deps import get_current_user, require_company_scoped, require_employee
from routers.notifications_router import create_application_notification
from services.notification_email_service import notify_new_application_email
from services.company_scope import job_visible_to_company_user
from services.cv_summary_service import anonymous_cv_summary, anonymized_cv_label
from services.kvkk_check import require_kvkk_consent

router = APIRouter(prefix="/api/applications", tags=["Başvurular"])
logger = logging.getLogger(__name__)


class ApplyBody(BaseModel):
    job_id: str
    cv_id: str


class AssignBody(BaseModel):
    assigned_reviewer_username: str | None = None
    department_label: str | None = Field(None, max_length=120)


class FavoriteBody(BaseModel):
    favorited: bool


async def _job_owned_by_company(job_id: str, company_id: str) -> dict | None:
    doc = await job_collection.find_one({"_id": job_id})
    if not doc or doc.get("company_id") != company_id:
        return None
    return doc


def _tenant_company_id(user: dict) -> str:
    return str(user.get("effective_company_id") or user.get("company_id") or "")


async def _job_visible_to_company_user(job_id: str, user: dict) -> dict | None:
    doc = await _job_owned_by_company(job_id, _tenant_company_id(user))
    if not doc or not job_visible_to_company_user(doc, user):
        return None
    return doc


@router.post("/apply")
async def apply_to_job(body: ApplyBody, user: dict = Depends(require_employee)):
    require_kvkk_consent(user)
    job = await job_collection.find_one({"_id": body.job_id})
    if not job:
        raise HTTPException(404, "İş ilanı bulunamadı.")
    if job.get("status") == "closed":
        raise HTTPException(400, "Bu ilan kapalı.")

    cv = await cv_collection.find_one({"_id": body.cv_id})
    if not cv or cv.get("owner_username") != user["username"]:
        raise HTTPException(403, "Bu CV ile başvuru yapamazsınız.")

    dup = await applications_collection.find_one(
        {"job_id": body.job_id, "applicant_username": user["username"]}
    )
    if dup:
        raise HTTPException(409, "Bu ilana zaten başvurdunuz.")

    app_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    doc = {
        "_id": app_id,
        "job_id": body.job_id,
        "company_id": job["company_id"],
        "applicant_username": user["username"],
        "cv_id": body.cv_id,
        "assigned_reviewer_username": None,
        "department_label": None,
        "company_favorite": False,
        "created_at": now,
    }
    await applications_collection.insert_one(doc)
    try:
        await job_collection.update_one(
            {"_id": body.job_id},
            {"$inc": {"analytics.applications": 1}}
        )
    except Exception:
        logger.exception("İlan başvuru sayısı güncellenemedi: job=%s", body.job_id)
    try:
        applicant = await users_collection.find_one({"username": user["username"]})
        applicant_label = (applicant.get("full_name") if applicant else None) or user["username"]
        await create_application_notification(
            company_id=job["company_id"],
            job_id=body.job_id,
            job_title=job.get("title") or "",
            application_id=app_id,
            applicant_username=user["username"],
            applicant_label=applicant_label,
        )
    except Exception:
        logger.exception("Başvuru bildirimi oluşturulamadı: job=%s app=%s", body.job_id, app_id)
    try:
        asyncio.create_task(
            notify_new_application_email(
                company_id=job["company_id"],
                job_id=body.job_id,
                job_title=job.get("title") or "",
                applicant_username=user["username"],
            )
        )
    except Exception:
        logger.exception("Başvuru e-postası kuyruğa alınamadı: job=%s", body.job_id)
    return {"id": app_id, "message": "Başvurunuz alındı."}


@router.get("/company/recent")
async def company_recent_applications(
    user: dict = Depends(require_company_scoped),
    limit: int = 8,
):
    limit = min(max(limit, 1), 50)
    cid = str(user.get("effective_company_id") or user.get("company_id") or "")
    if not cid:
        return []
    job_ids: list[str] = []
    async for j in job_collection.find({"company_id": cid}):
        if job_visible_to_company_user(j, user):
            job_ids.append(j["_id"])
    if not job_ids:
        return []
    out = []
    idx = 0
    async for a in applications_collection.find({"job_id": {"$in": job_ids}}).sort("created_at", -1).limit(limit):
        idx += 1
        job = await job_collection.find_one({"_id": a["job_id"]})
        cv = await cv_collection.find_one({"_id": a["cv_id"]})
        disp = cv.get("display_id") if cv else None
        out.append(
            {
                "id": a["_id"],
                "job_id": a.get("job_id"),
                "cv_id": a.get("cv_id"),
                "job_title": job.get("title") if job else "?",
                "job_department": job.get("department") if job else None,
                "job_location": job.get("location") if job else None,
                "job_workplace_type": job.get("workplace_type") if job else None,
                "job_status": job.get("status") if job else None,
                "created_at": a.get("created_at"),
                "applicant_label": anonymized_cv_label(disp, idx) if disp is not None else f"Başvuru #{idx}",
            }
        )
    return out


@router.get("/my")
async def my_applications(user: dict = Depends(require_employee)):
    out = []
    async for a in applications_collection.find({"applicant_username": user["username"]}).sort(
        "created_at", -1
    ):
        job = await job_collection.find_one({"_id": a["job_id"]})
        cname = job.get("company") if job else None
        if job and job.get("company_id"):
            from database import companies_collection

            co = await companies_collection.find_one({"_id": job["company_id"]})
            if co and co.get("name"):
                cname = co.get("name")
        out.append(
            {
                "id": a["_id"],
                "job_id": a["job_id"],
                "company_id": a.get("company_id") or (job.get("company_id") if job else None),
                "job_title": job["title"] if job else "?",
                "company_name": cname,
                "cv_id": a["cv_id"],
                "created_at": a["created_at"],
                "assigned_reviewer_username": a.get("assigned_reviewer_username"),
                "department_label": a.get("department_label"),
                "job_status": job.get("status") if job else None,
            }
        )
    return out


@router.delete("/my/{application_id}")
async def withdraw_my_application(application_id: str, user: dict = Depends(require_employee)):
    app = await applications_collection.find_one({"_id": application_id})
    if not app or app.get("applicant_username") != user["username"]:
        raise HTTPException(404, "Başvuru bulunamadı.")
    await applications_collection.delete_one({"_id": application_id})
    return {"message": "Başvurunuz geri çekildi."}


@router.get("/job/{job_id}")
async def list_job_applications(job_id: str, user: dict = Depends(require_company_scoped)):
    job = await _job_visible_to_company_user(job_id, user)
    if not job:
        raise HTTPException(404, "İlan bulunamadı veya bu şirkete ait değil.")

    out = []
    idx = 0
    async for a in applications_collection.find({"job_id": job_id}).sort("created_at", -1):
        idx += 1
        cv = await cv_collection.find_one({"_id": a["cv_id"]})
        disp = cv.get("display_id") if cv else None
        out.append(
            {
                "id": a["_id"],
                "applicant_username": a.get("applicant_username"),
                "applicant_label": anonymized_cv_label(disp, idx),
                "cv_id": a["cv_id"],
                "cv_display_id": disp,
                "cv_summary": anonymous_cv_summary(cv),
                "created_at": a["created_at"],
                "assigned_reviewer_username": a.get("assigned_reviewer_username"),
                "department_label": a.get("department_label"),
                "company_favorite": bool(a.get("company_favorite", False)),
                "job_title": job.get("title"),
                "job_department": job.get("department"),
                "job_location": job.get("location"),
                "job_workplace_type": job.get("workplace_type"),
                "job_status": job.get("status"),
            }
        )
    return out


@router.get("/job/{job_id}/cv-ids")
async def applicant_cv_ids(job_id: str, user: dict = Depends(require_company_scoped)):
    job = await _job_visible_to_company_user(job_id, user)
    if not job:
        raise HTTPException(404, "İlan bulunamadı.")
    ids = []
    async for a in applications_collection.find({"job_id": job_id}):
        ids.append(a["cv_id"])
    return {"job_id": job_id, "cv_ids": list(dict.fromkeys(ids))}


@router.patch("/{application_id}/assign")
async def assign_application(
    application_id: str,
    body: AssignBody,
    user: dict = Depends(require_company_scoped),
):
    app = await applications_collection.find_one({"_id": application_id})
    if not app or app.get("company_id") != user["effective_company_id"]:
        raise HTTPException(404, "Başvuru bulunamadı.")
    if not await _job_visible_to_company_user(app["job_id"], user):
        raise HTTPException(404, "Başvuru bulunamadı.")

    if body.assigned_reviewer_username:
        colleague = await users_collection.find_one(
            {
                "username": body.assigned_reviewer_username,
                "company_id": user["effective_company_id"],
                "role": "company",
            }
        )
        if not colleague:
            raise HTTPException(
                400,
                "Atanan kullanıcı aynı şirkette bir şirket hesabı olmalıdır.",
            )

    await applications_collection.update_one(
        {"_id": application_id},
        {
            "$set": {
                "assigned_reviewer_username": body.assigned_reviewer_username,
                "department_label": body.department_label,
            }
        },
    )
    return {"message": "Başvuru güncellendi."}


@router.patch("/{application_id}/favorite")
async def set_application_favorite(
    application_id: str,
    body: FavoriteBody,
    user: dict = Depends(require_company_scoped),
):
    app = await applications_collection.find_one({"_id": application_id})
    if not app or app.get("company_id") != user["effective_company_id"]:
        raise HTTPException(404, "Başvuru bulunamadı.")
    if not await _job_visible_to_company_user(app["job_id"], user):
        raise HTTPException(404, "Başvuru bulunamadı.")
    await applications_collection.update_one(
        {"_id": application_id},
        {"$set": {"company_favorite": body.favorited}},
    )
    return {"company_favorite": body.favorited}


@router.get("/company-team")
async def company_team(user: dict = Depends(require_company_scoped)):
    out = []
    async for u in users_collection.find(
        {"company_id": user["effective_company_id"], "role": "company"}
    ).sort("username", 1):
        out.append(
            {
                "username": u["username"],
                "full_name": u.get("full_name"),
                "email": u.get("email"),
                "department": u.get("department"),
                "company_access": u.get("company_access") or "hr",
            }
        )
    return out
