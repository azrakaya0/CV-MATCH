import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import companies_collection, users_collection
from deps import require_company_hr, require_company_scoped
from models import CompanyProfile
from services.auth_service import hash_password
from services.company_profile import profile_from_company_doc
from services.username import username_fields, username_taken, validate_username_format

router = APIRouter(prefix="/api/company", tags=["Şirket"])

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.çğıöşüÇĞİÖŞÜ-]{3,32}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_URL_RE = re.compile(r"^https?://[^\s]+$", re.IGNORECASE)


class TeamMemberCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    password: str = Field(..., min_length=6, max_length=128)
    full_name: str = Field(..., min_length=2)
    email: str = Field(..., min_length=3)
    department: str = ""
    company_access: str = Field("department", max_length=20)
    target_company_id: str | None = Field(
        None,
        max_length=64,
        description="Birden fazla şirket erişiminiz varsa zorunlu: yeni kullanıcının şirket kimliği.",
    )
    kvkk_accepted: bool = True
    kvkk_version: str = ""


class TeamMemberPatch(BaseModel):
    company_access: str = Field(..., max_length=20)
    department: str = Field("", max_length=120)


class CompanyProfileUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=200)
    email: str | None = Field(None, max_length=120)
    phone: str | None = Field(None, max_length=40)
    address: str | None = Field(None, max_length=500)
    website: str | None = Field(None, max_length=200)


def _managed_list(user: dict) -> list[str]:
    m = list(user.get("managed_company_ids") or [])
    if not m and user.get("company_id"):
        m = [user["company_id"]]
    return m


def _resolve_target_company_id(user: dict, body_target: str | None) -> str:
    managed = _managed_list(user)
    tid = (body_target or "").strip() or None
    if len(managed) > 1:
        if not tid or tid not in managed:
            raise HTTPException(
                400,
                detail="Birden fazla şirket erişiminiz var; target_company_id alanında geçerli şirket kimliği gönderin.",
            )
        return tid
    return managed[0]


@router.get("/profile", response_model=CompanyProfile)
async def get_company_profile(user: dict = Depends(require_company_scoped)):
    cid = user.get("effective_company_id") or user.get("company_id")
    if not cid:
        raise HTTPException(404, "Şirket kaydı bulunamadı.")
    doc = await companies_collection.find_one({"_id": cid})
    if not doc:
        raise HTTPException(404, "Şirket kaydı bulunamadı.")
    prof = profile_from_company_doc(doc) or {}
    if doc.get("name") and not prof.get("name"):
        prof["name"] = doc.get("name")
    return CompanyProfile(**prof)


@router.patch("/profile", response_model=CompanyProfile)
async def update_company_profile(body: CompanyProfileUpdate, user: dict = Depends(require_company_hr)):
    cid = user.get("effective_company_id") or user.get("company_id")
    if not cid:
        raise HTTPException(404, "Şirket kaydı bulunamadı.")
    upd: dict = {}
    if body.name is not None:
        nm = body.name.strip()
        if len(nm) < 2:
            raise HTTPException(400, "Şirket unvanı en az 2 karakter olmalıdır.")
        upd["name"] = nm
    for field in ("email", "phone", "address", "website"):
        val = getattr(body, field, None)
        if val is not None:
            s = val.strip() or None
            if field == "email" and s and not _EMAIL_RE.match(s):
                raise HTTPException(400, "Geçerli bir e-posta adresi girin.")
            if field == "website" and s and not _URL_RE.match(s):
                raise HTTPException(400, "Web sitesi http:// veya https:// ile başlamalıdır.")
            upd[field] = s
    if upd:
        await companies_collection.update_one({"_id": cid}, {"$set": upd})
    doc = await companies_collection.find_one({"_id": cid})
    prof = profile_from_company_doc(doc) or {}
    if doc and doc.get("name"):
        prof.setdefault("name", doc.get("name"))
    return CompanyProfile(**prof)


@router.post("/team-member")
async def add_team_member(body: TeamMemberCreate, user: dict = Depends(require_company_hr)):
    if not body.kvkk_accepted:
        raise HTTPException(400, "KVKK onayı gerekir.")
    ca = (body.company_access or "department").strip().lower()
    if ca not in ("hr", "department"):
        raise HTTPException(400, "Geçersiz erişim tipi.")
    dept = (body.department or "").strip() or None
    if ca == "department":
        if not dept or len(dept) < 2:
            raise HTTPException(400, "Departman yetkilisi için departman adı gerekli (en az 2 karakter).")
    target_company_id = _resolve_target_company_id(user, body.target_company_id)

    un = body.username.strip()
    fmt_err = validate_username_format(un)
    if fmt_err:
        raise HTTPException(400, fmt_err)
    if await username_taken(un):
        raise HTTPException(409, "Bu kullanıcı adı zaten kayıtlı.")

    from datetime import datetime

    from config import settings

    now = datetime.utcnow().isoformat()
    new_managed = [target_company_id]
    await users_collection.insert_one(
        {
            **username_fields(un),
            "password_hash": hash_password(body.password),
            "role": "company",
            "company_id": target_company_id,
            "managed_company_ids": new_managed,
            "full_name": body.full_name.strip(),
            "email": body.email.strip(),
            "phone": "",
            "company_access": ca,
            "department": dept,
            "account_status": "active",
            "kvkk_accepted_at": now,
            "kvkk_version": body.kvkk_version or settings.KVKK_POLICY_VERSION,
        }
    )
    return {"message": "Şirket kullanıcısı oluşturuldu.", "username": un}


@router.get("/pending-registrations")
async def list_pending_registrations(user: dict = Depends(require_company_hr)):
    cid = user.get("effective_company_id") or user.get("company_id")
    if not cid:
        raise HTTPException(404, "Şirket kaydı bulunamadı.")
    items: list[dict] = []
    async for u in users_collection.find(
        {
            "role": "company",
            "company_access": "department",
            "company_id": cid,
            "account_status": "pending",
        }
    ):
        items.append(
            {
                "username": u["username"],
                "full_name": u.get("full_name") or "",
                "email": u.get("email") or "",
                "phone": u.get("phone") or "",
                "department": u.get("department") or "",
                "requested_at": u.get("kvkk_accepted_at"),
            }
        )
    items.sort(key=lambda x: x.get("requested_at") or "")
    return {"items": items}


@router.post("/pending-registrations/{username}/approve")
async def approve_pending_registration(username: str, user: dict = Depends(require_company_hr)):
    cid = user.get("effective_company_id") or user.get("company_id")
    if not cid:
        raise HTTPException(404, "Şirket kaydı bulunamadı.")
    un = username.strip()
    target = await users_collection.find_one(
        {
            "username": {"$regex": f"^{re.escape(un)}$", "$options": "i"},
            "role": "company",
            "company_access": "department",
            "company_id": cid,
            "account_status": "pending",
        }
    )
    if not target:
        raise HTTPException(404, "Onay bekleyen kayıt bulunamadı.")
    await users_collection.update_one(
        {"_id": target["_id"]},
        {"$set": {"account_status": "active"}},
    )
    return {"message": f"{target['username']} onaylandı. Artık giriş yapabilir.", "username": target["username"]}


@router.post("/pending-registrations/{username}/reject")
async def reject_pending_registration(username: str, user: dict = Depends(require_company_hr)):
    cid = user.get("effective_company_id") or user.get("company_id")
    if not cid:
        raise HTTPException(404, "Şirket kaydı bulunamadı.")
    un = username.strip()
    target = await users_collection.find_one(
        {
            "username": {"$regex": f"^{re.escape(un)}$", "$options": "i"},
            "role": "company",
            "company_access": "department",
            "company_id": cid,
            "account_status": "pending",
        }
    )
    if not target:
        raise HTTPException(404, "Onay bekleyen kayıt bulunamadı.")
    await users_collection.delete_one({"_id": target["_id"]})
    return {"message": f"{target['username']} kaydı reddedildi.", "username": target["username"]}


@router.delete("/team-member/{username}")
async def delete_team_member(username: str, user: dict = Depends(require_company_hr)):
    managed = _managed_list(user)
    un = username.strip()
    target = await users_collection.find_one(
        {
            "username": {"$regex": f"^{re.escape(un)}$", "$options": "i"},
            "role": "company",
            "company_id": {"$in": managed},
        }
    )
    if not target:
        raise HTTPException(404, "Kullanıcı bulunamadı.")
    
    # Kendini silemez
    if target["username"] == user["username"]:
        raise HTTPException(400, "Kendinizi silemezsiniz.")
    
    await users_collection.delete_one({"_id": target["_id"]})
    return {"message": f"{target['username']} şirketten çıkarıldı.", "username": target["username"]}


@router.patch("/team-member/{username}")
async def patch_team_member(
    username: str,
    body: TeamMemberPatch,
    user: dict = Depends(require_company_hr),
):
    ca = (body.company_access or "").strip().lower()
    if ca not in ("hr", "department"):
        raise HTTPException(400, "Geçersiz erişim tipi.")
    dept = (body.department or "").strip() or None
    if ca == "department":
        if not dept or len(dept) < 2:
            raise HTTPException(400, "Departman yetkilisi için departman adı gerekli (en az 2 karakter).")

    managed = _managed_list(user)
    un = username.strip()
    target = await users_collection.find_one(
        {
            "username": {"$regex": f"^{re.escape(un)}$", "$options": "i"},
            "role": "company",
            "company_id": {"$in": managed},
        }
    )
    if not target:
        raise HTTPException(404, "Kullanıcı bulunamadı.")

    upd: dict = {"company_access": ca, "department": dept}
    if ca == "hr":
        tid = target.get("company_id")
        if tid:
            upd["managed_company_ids"] = [tid]
    await users_collection.update_one(
        {"_id": target["_id"]},
        {"$set": upd},
    )
    return {"message": "Kullanıcı güncellendi.", "username": target["username"]}
