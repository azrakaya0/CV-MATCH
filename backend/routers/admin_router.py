import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from config import settings
from database import (
    applications_collection,
    audit_logs_collection,
    companies_collection,
    cv_collection,
    job_collection,
    match_collection,
    settings_collection,
    users_collection,
)
from services.user_company import managed_company_ids_from_doc
from deps import require_admin, get_current_user
from services.kvkk_defaults import DEFAULT_KVKK_HTML
from services.account_service import delete_employee_account, delete_company_account

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/stats")
async def admin_stats(_: dict = Depends(require_admin)):
    users_n = await users_collection.count_documents({})
    cvs_n = await cv_collection.count_documents({})
    jobs_n = await job_collection.count_documents({})
    apps_n = await applications_collection.count_documents({})
    matches_n = await match_collection.count_documents({})
    companies_n = await companies_collection.count_documents({})
    open_jobs = await job_collection.count_documents({"status": {"$ne": "closed"}})
    return {
        "users": users_n,
        "cvs": cvs_n,
        "jobs": jobs_n,
        "open_jobs": open_jobs,
        "applications": apps_n,
        "matches": matches_n,
        "companies": companies_n,
    }


@router.get("/audit-logs")
async def admin_audit_logs(_: dict = Depends(require_admin), limit: int = 50):
    limit = min(max(limit, 1), 200)
    out = []
    async for row in audit_logs_collection.find({}).sort("created_at", -1).limit(limit):
        out.append(
            {
                "action": row.get("action"),
                "username": row.get("username"),
                "role": row.get("role"),
                "resource_type": row.get("resource_type"),
                "resource_id": row.get("resource_id"),
                "created_at": row.get("created_at"),
            }
        )
    return out


class KvkkUpdateBody(BaseModel):
    html: str = Field(..., min_length=20)
    version: str = Field(..., min_length=1, max_length=32)


@router.get("/kvkk")
async def get_kvkk_admin(_: dict = Depends(require_admin)):
    doc = await settings_collection.find_one({"_id": "kvkk"})
    if not doc:
        return {
            "html": DEFAULT_KVKK_HTML,
            "version": settings.KVKK_POLICY_VERSION,
        }
    return {"html": doc.get("html", DEFAULT_KVKK_HTML), "version": doc.get("version", "1.0")}


@router.put("/kvkk")
async def put_kvkk(body: KvkkUpdateBody, _: dict = Depends(require_admin)):
    await settings_collection.update_one(
        {"_id": "kvkk"},
        {
            "$set": {
                "html": body.html,
                "version": body.version,
                "updated_at": datetime.utcnow().isoformat(),
            }
        },
        upsert=True,
    )
    return {"message": "KVKK metni güncellendi.", "version": body.version}


@router.get("/users")
async def list_users(_: dict = Depends(require_admin)):
    out = []
    async for u in users_collection.find().sort("username", 1):
        out.append(
            {
                "username": u["username"],
                "role": u.get("role"),
                "email": u.get("email"),
                "full_name": u.get("full_name"),
                "company_id": u.get("company_id"),
                "department": u.get("department"),
                "company_access": u.get("company_access") if u.get("role") == "company" else None,
                "managed_company_ids": managed_company_ids_from_doc(u)
                if u.get("role") == "company"
                else None,
                "kvkk_accepted_at": u.get("kvkk_accepted_at"),
            }
        )
    return out


@router.get("/jobs/{job_id}")
async def admin_job_detail(job_id: str, _: dict = Depends(require_admin)):
    doc = await job_collection.find_one({"_id": job_id})
    if not doc:
        raise HTTPException(404, detail="İş ilanı bulunamadı.")
    company = None
    cid = doc.get("company_id")
    if cid:
        c = await companies_collection.find_one({"_id": cid})
        if c:
            company = {
                "id": cid,
                "name": c.get("name") or "",
                "email": c.get("email"),
                "phone": c.get("phone"),
                "address": c.get("address"),
                "website": c.get("website"),
                "created_at": c.get("created_at"),
            }
    apps_n = await applications_collection.count_documents({"job_id": job_id})
    return {
        "job": {
            "id": doc["_id"],
            "title": doc.get("title"),
            "company": doc.get("company"),
            "company_id": cid,
            "company_legal_name": company.get("name") if company else None,
            "department": doc.get("department"),
            "location": doc.get("location"),
            "workplace_type": doc.get("workplace_type"),
            "description": doc.get("description"),
            "requirements": doc.get("requirements"),
            "status": doc.get("status", "open"),
            "created_at": doc.get("created_at"),
            "application_count": apps_n,
        },
        "company": company,
    }


@router.get("/applications")
async def admin_list_applications(
    _: dict = Depends(require_admin),
    limit: int = 200,
):
    limit = min(max(limit, 1), 500)
    out = []
    async for app in applications_collection.find({}).sort("created_at", -1).limit(limit):
        job = await job_collection.find_one({"_id": app.get("job_id")})
        cv = await cv_collection.find_one({"_id": app.get("cv_id")})
        cid = job.get("company_id") if job else None
        cname = None
        if cid:
            co = await companies_collection.find_one({"_id": cid})
            cname = co.get("name") if co else None
        cv_data = (cv or {}).get("data") or {}
        out.append(
            {
                "id": app["_id"],
                "job_id": app.get("job_id"),
                "job_title": job.get("title") if job else None,
                "company_name": cname or (job.get("company") if job else None),
                "department": job.get("department") if job else None,
                "cv_id": app.get("cv_id"),
                "cv_label": (
                    f"CV #{cv.get('display_id')}"
                    if cv and cv.get("display_id") is not None
                    else (cv_data.get("name") or (cv or {}).get("filename") or "CV")
                ),
                "applicant_username": app.get("applicant_username"),
                "created_at": app.get("created_at"),
            }
        )
    return out


@router.get("/companies")
async def list_companies(current_user: dict = Depends(get_current_user)):
    """List companies (admin or consultant only)"""
    # Allow admin or consultant to list companies
    if current_user["role"] not in ("admin", "company"):
        raise HTTPException(403, "Bu işlem için yetkiniz yok.")
    
    if current_user["role"] == "company" and current_user.get("company_access") != "consultant":
        raise HTTPException(403, "Bu işlem sadece danışman İK için.")
    
    out = []
    async for c in companies_collection.find({}).sort("name", 1):
        out.append({"id": c["_id"], "name": c.get("name") or ""})
    return out


class ManagedCompaniesBody(BaseModel):
    company_ids: list[str] = Field(..., min_length=1)


@router.patch("/users/{username}/managed-companies")
async def patch_user_managed_companies(
    username: str,
    body: ManagedCompaniesBody,
    current_user: dict = Depends(get_current_user),
):
    """Update user's managed companies (admin or consultant self-update)"""
    # Allow admin or the user themselves (if consultant) to update
    if current_user["role"] != "admin" and current_user["username"] != username:
        raise HTTPException(403, "Bu işlem için yetkiniz yok.")
    
    un = username.strip()
    u = await users_collection.find_one(
        {"username": {"$regex": f"^{re.escape(un)}$", "$options": "i"}}
    )
    if not u or u.get("role") != "company":
        raise HTTPException(404, detail="Şirket kullanıcısı bulunamadı.")
    ca = u.get("company_access") or "hr"
    if ca not in ("hr", "consultant"):
        raise HTTPException(
            status_code=400,
            detail="Yalnızca İK veya danışman İK hesaplarına çoklu şirket atanır.",
        )
    seen: set[str] = set()
    clean: list[str] = []
    for cid in body.company_ids:
        s = str(cid).strip()
        if not s or s in seen:
            continue
        c = await companies_collection.find_one({"_id": s})
        if not c:
            raise HTTPException(status_code=400, detail=f"Şirket bulunamadı: {s}")
        seen.add(s)
        clean.append(s)
    await users_collection.update_one(
        {"_id": u["_id"]},
        {"$set": {"managed_company_ids": clean, "company_id": clean[0]}},
    )
    return {"message": "Şirket erişimi güncellendi.", "managed_company_ids": clean}


@router.delete("/users/{username}")
async def admin_delete_user(username: str, _: dict = Depends(require_admin)):
    un = username.strip()
    u = await users_collection.find_one(
        {"username": {"$regex": f"^{re.escape(un)}$", "$options": "i"}}
    )
    if not u:
        raise HTTPException(404, detail="Kullanıcı bulunamadı.")
    if u.get("role") == "admin":
        raise HTTPException(403, detail="Admin hesabı silinemez.")
    target_username = u["username"]
    if u.get("role") == "employee":
        await delete_employee_account(target_username)
    else:
        await delete_company_account(target_username)
    return {"message": f"{target_username} kullanıcısı silindi."}
