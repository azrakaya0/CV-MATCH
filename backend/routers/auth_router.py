import hashlib
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from config import settings
from database import companies_collection, password_reset_collection, settings_collection, users_collection
from rate_limit import check_rate_limit
from deps import get_current_user
from services.account_service import delete_company_account, delete_employee_account
from services.audit_service import log_audit
from services.auth_service import create_access_token, hash_password, verify_password
from services.email_service import send_email
from services.user_company import managed_company_ids_from_doc
from services.kvkk_defaults import DEFAULT_KVKK_HTML
from services.company_departments import (
    account_is_active,
    company_has_hr_user,
    find_company_by_name,
    known_departments_for_company,
)
from services.company_scope import normalize_dept
from services.notification_service import notify_hr_department_registration_pending
from services.username import username_fields, username_taken, validate_username_format

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.çğıöşüÇĞİÖŞÜ-]{3,32}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_UPLOADS_ROOT = os.path.join(_BACKEND_ROOT, "static", "uploads")
_AVATAR_DIR = os.path.join(_UPLOADS_ROOT, "avatars")
_MAX_AVATAR_BYTES = 1_500_000
_AVATAR_CT_EXT = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}

router = APIRouter(prefix="/api/auth", tags=["Kimlik Doğrulama"])
logger = logging.getLogger(__name__)


def _avatar_public_url(avatar_filename: str | None) -> str | None:
    if not avatar_filename:
        return None
    return f"/uploads/{str(avatar_filename).lstrip('/')}"


async def _published_kvkk_version() -> str:
    doc = await settings_collection.find_one({"_id": "kvkk"})
    return doc.get("version", settings.KVKK_POLICY_VERSION) if doc else settings.KVKK_POLICY_VERSION


class LoginBody(BaseModel):
    username: str
    password: str


class CompanyRef(BaseModel):
    id: str
    name: str = ""


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str
    company_id: str | None = None
    full_name: str | None = None
    avatar_url: str | None = None
    company_access: str | None = None
    department: str | None = None
    managed_company_ids: list[str] = []
    companies: list[CompanyRef] = []


class RegisterEmployeeBody(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    password: str = Field(..., min_length=6, max_length=128)
    password_confirm: str = Field(..., min_length=6, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., min_length=3, max_length=120)
    phone: str = Field("", max_length=40)
    kvkk_accepted: bool
    kvkk_version: str = Field(..., min_length=1)


class RegisterConsultantBody(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    password: str = Field(..., min_length=6, max_length=128)
    password_confirm: str = Field(..., min_length=6, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., min_length=3, max_length=120)
    phone: str = Field(..., min_length=8, max_length=40)
    kvkk_accepted: bool
    kvkk_version: str = Field(..., min_length=1)


class RegisterCompanyBody(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=200)
    username: str = Field(..., min_length=3, max_length=32)
    password: str = Field(..., min_length=6, max_length=128)
    password_confirm: str = Field(..., min_length=6, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., min_length=3, max_length=120)
    phone: str = Field(..., min_length=8, max_length=40)
    kvkk_accepted: bool
    kvkk_version: str = Field(..., min_length=1)
    # hr: tüm şirket; department: yalnızca kendi departmanındaki ilanlar / başvurular
    company_access: str = Field("hr", max_length=20)
    department: str = Field("", max_length=120)


class RegisterResponse(BaseModel):
    message: str


def _norm_role(role: str) -> str:
    return "company" if role == "manager" else role


@router.get("/kvkk-document")
async def public_kvkk_document():
    doc = await settings_collection.find_one({"_id": "kvkk"})
    ver = doc.get("version", settings.KVKK_POLICY_VERSION) if doc else settings.KVKK_POLICY_VERSION
    html = doc.get("html", DEFAULT_KVKK_HTML) if doc else DEFAULT_KVKK_HTML
    return {"version": ver, "html": html}


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _validate_register_contact(email: str, phone: str) -> tuple[str, str]:
    em = (email or "").strip()
    ph = (phone or "").strip()
    if not _EMAIL_RE.match(em):
        raise HTTPException(status_code=400, detail="Geçerli bir e-posta adresi girin.")
    if len(ph) < 8:
        raise HTTPException(status_code=400, detail="Telefon numarası zorunludur (en az 8 karakter).")
    return em, ph


async def _assert_username_available(username: str) -> str:
    err = validate_username_format(username)
    if err:
        raise HTTPException(status_code=400, detail=err)
    un = username.strip()
    if await username_taken(un):
        raise HTTPException(status_code=409, detail="Bu kullanıcı adı zaten kayıtlı.")
    return un


@router.get("/username-available")
async def username_available(username: str = ""):
    err = validate_username_format(username)
    if err:
        return {"available": False, "message": err}
    if await username_taken(username):
        return {"available": False, "message": "Bu kullanıcı adı zaten kayıtlı."}
    return {"available": True, "message": ""}


@router.post("/register", response_model=RegisterResponse)
async def register_employee(body: RegisterEmployeeBody, request: Request):
    if not check_rate_limit(
        f"register:{_client_ip(request)}",
        settings.REGISTER_RATE_LIMIT,
        settings.REGISTER_RATE_WINDOW_SECONDS,
    ):
        raise HTTPException(429, detail="Çok fazla kayıt denemesi. Lütfen daha sonra tekrar deneyin.")
    if body.password != body.password_confirm:
        raise HTTPException(status_code=400, detail="Şifreler eşleşmiyor.")
    if not body.kvkk_accepted:
        raise HTTPException(status_code=400, detail="KVKK metnini onaylamanız gerekir.")
    ver = await _published_kvkk_version()
    if body.kvkk_version != ver:
        raise HTTPException(
            status_code=400,
            detail="KVKK metni güncellenmiş olabilir. Lütfen sayfayı yenileyip tekrar onaylayın.",
        )
    un = await _assert_username_available(body.username)
    now = datetime.utcnow().isoformat()
    await users_collection.insert_one(
        {
            **username_fields(un),
            "password_hash": hash_password(body.password),
            "role": "employee",
            "full_name": body.full_name.strip(),
            "email": body.email.strip(),
            "phone": body.phone.strip(),
            "kvkk_accepted_at": now,
            "kvkk_version": body.kvkk_version,
            "favorite_job_ids": [],
        }
    )
    return RegisterResponse(message="Kayıt tamamlandı. Giriş yapabilirsiniz.")


@router.post("/register-company", response_model=RegisterResponse)
async def register_company(body: RegisterCompanyBody, request: Request):
    if not check_rate_limit(
        f"register:{_client_ip(request)}",
        settings.REGISTER_RATE_LIMIT,
        settings.REGISTER_RATE_WINDOW_SECONDS,
    ):
        raise HTTPException(429, detail="Çok fazla kayıt denemesi. Lütfen daha sonra tekrar deneyin.")
    if body.password != body.password_confirm:
        raise HTTPException(status_code=400, detail="Şifreler eşleşmiyor.")
    if not body.kvkk_accepted:
        raise HTTPException(status_code=400, detail="KVKK metnini onaylamanız gerekir.")
    ver = await _published_kvkk_version()
    if body.kvkk_version != ver:
        raise HTTPException(
            status_code=400,
            detail="KVKK metni güncellenmiş olabilir. Lütfen sayfayı yenileyip tekrar onaylayın.",
        )
    un = await _assert_username_available(body.username)

    em, ph = _validate_register_contact(body.email, body.phone)
    cn = body.company_name.strip()
    if len(cn) < 2:
        raise HTTPException(status_code=400, detail="Şirket unvanı zorunludur (en az 2 karakter).")

    ca = (body.company_access or "hr").strip().lower()
    if ca not in ("hr", "department"):
        raise HTTPException(400, detail="Geçersiz şirket erişim tipi.")
    dept = (body.department or "").strip() or None
    if ca == "department":
        if not dept or len(dept) < 2:
            raise HTTPException(
                400,
                detail="Departman yetkilisi için departman adı gerekli (en az 2 karakter).",
            )

    now = datetime.utcnow().isoformat()
    full_name = body.full_name.strip()

    if ca == "hr":
        existing_co = await find_company_by_name(cn)
        if existing_co:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Bu şirket unvanı zaten kayıtlı. "
                    "Mevcut şirkete departman hesabı açmak için «Departman yetkilisi» seçeneğini kullanın."
                ),
            )
        company_id = str(uuid.uuid4())
        await companies_collection.insert_one(
            {
                "_id": company_id,
                "name": cn,
                "created_at": now,
            }
        )
        await users_collection.insert_one(
            {
                **username_fields(un),
                "password_hash": hash_password(body.password),
                "role": "company",
                "company_id": company_id,
                "full_name": full_name,
                "email": em,
                "phone": ph,
                "company_access": "hr",
                "department": None,
                "managed_company_ids": [company_id],
                "account_status": "active",
                "kvkk_accepted_at": now,
                "kvkk_version": body.kvkk_version,
            }
        )
        return RegisterResponse(message="Şirket kaydı tamamlandı. Giriş yapabilirsiniz.")

    existing_co = await find_company_by_name(cn)
    if not existing_co:
        raise HTTPException(
            status_code=400,
            detail=(
                "Bu şirket unvanı sistemde bulunamadı. "
                "Kayıt için önce şirketin İK hesabının oluşturulmuş olması gerekir."
            ),
        )
    company_id = existing_co["_id"]
    if not await company_has_hr_user(company_id):
        raise HTTPException(status_code=400, detail="Bu şirket için henüz İK hesabı tanımlı değil.")

    await users_collection.insert_one(
        {
            **username_fields(un),
            "password_hash": hash_password(body.password),
            "role": "company",
            "company_id": company_id,
            "full_name": full_name,
            "email": em,
            "phone": ph,
            "company_access": "department",
            "department": dept,
            "managed_company_ids": [],
            "account_status": "pending",
            "kvkk_accepted_at": now,
            "kvkk_version": body.kvkk_version,
        }
    )
    await notify_hr_department_registration_pending(
        company_id=company_id,
        company_name=existing_co.get("name") or cn,
        applicant_username=un,
        applicant_full_name=full_name,
        department=dept or "",
    )
    return RegisterResponse(
        message="Başvurunuz alındı. Şirket İK onayından sonra giriş yapabilirsiniz."
    )


@router.post("/register-consultant", response_model=RegisterResponse)
async def register_consultant(body: RegisterConsultantBody, request: Request):
    if not check_rate_limit(
        f"register:{_client_ip(request)}",
        settings.REGISTER_RATE_LIMIT,
        settings.REGISTER_RATE_WINDOW_SECONDS,
    ):
        raise HTTPException(429, detail="Çok fazla kayıt denemesi. Lütfen daha sonra tekrar deneyin.")
    if body.password != body.password_confirm:
        raise HTTPException(status_code=400, detail="Şifreler eşleşmiyor.")
    if not body.kvkk_accepted:
        raise HTTPException(status_code=400, detail="KVKK metnini onaylamanız gerekir.")
    ver = await _published_kvkk_version()
    if body.kvkk_version != ver:
        raise HTTPException(
            status_code=400,
            detail="KVKK metni güncellenmiş olabilir. Lütfen sayfayı yenileyip tekrar onaylayın.",
        )
    un = await _assert_username_available(body.username)
    em, ph = _validate_register_contact(body.email, body.phone)
    now = datetime.utcnow().isoformat()
    await users_collection.insert_one(
        {
            **username_fields(un),
            "password_hash": hash_password(body.password),
            "role": "company",
            "company_access": "consultant",
            "company_id": None,
            "managed_company_ids": [],
            "full_name": body.full_name.strip(),
            "email": em,
            "phone": ph,
            "department": None,
            "kvkk_accepted_at": now,
            "kvkk_version": body.kvkk_version,
        }
    )
    return RegisterResponse(
        message="Danışman İK kaydı tamamlandı. Yönetici şirket erişiminizi tanımladıktan sonra giriş yapabilirsiniz."
    )


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginBody, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"login:{client_ip}"
    if not check_rate_limit(
        rate_key,
        settings.LOGIN_RATE_LIMIT,
        settings.LOGIN_RATE_WINDOW_SECONDS,
    ):
        raise HTTPException(
            status_code=429,
            detail="Çok fazla giriş denemesi. Lütfen birkaç dakika sonra tekrar deneyin.",
        )

    un = body.username.strip()
    user = await users_collection.find_one(
        {"username": {"$regex": f"^{re.escape(un)}$", "$options": "i"}}
    )
    if not user or not verify_password(body.password, user["password_hash"]):
        await log_audit("login_failed", username=body.username.strip(), ip=client_ip)
        raise HTTPException(status_code=401, detail="Kullanıcı adı veya şifre hatalı.")
    role = _norm_role(user.get("role", "employee"))
    if role == "company" and not account_is_active(user):
        raise HTTPException(
            status_code=403,
            detail="Hesabınız İK onayı bekliyor. Onay sonrası giriş yapabilirsiniz.",
        )
    if role == "company" and (user.get("company_access") or "hr") == "department":
        cid = user.get("company_id")
        nd = normalize_dept(user.get("department"))
        if not cid or not nd:
            await log_audit("login_failed", username=user["username"], ip=client_ip)
            raise HTTPException(status_code=401, detail="Kullanıcı adı veya şifre hatalı.")
        known = await known_departments_for_company(cid)
        if nd not in known:
            await log_audit("login_failed", username=user["username"], ip=client_ip)
            raise HTTPException(
                status_code=401,
                detail="Bu şirkette kayıtlı böyle bir departman bulunamadı.",
            )
    await log_audit("login_success", username=user["username"], role=role, ip=client_ip)
    token = create_access_token(user["username"], role)
    ca = None
    dept = None
    managed: list[str] = []
    companies: list[CompanyRef] = []
    if role == "company":
        ca = user.get("company_access") or "hr"
        dept = user.get("department")
        managed = managed_company_ids_from_doc(user)
        for cid in managed:
            c = await companies_collection.find_one({"_id": cid})
            companies.append(CompanyRef(id=cid, name=(c.get("name") if c else "") or ""))
    return LoginResponse(
        access_token=token,
        role=role,
        username=user["username"],
        company_id=user.get("company_id"),
        full_name=user.get("full_name"),
        avatar_url=_avatar_public_url(user.get("avatar_filename")),
        company_access=ca,
        department=dept,
        managed_company_ids=managed,
        companies=companies,
    )


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    company_name = None
    if user.get("company_id"):
        c = await companies_collection.find_one({"_id": user["company_id"]})
        if c:
            company_name = c.get("name")
    managed: list[str] = []
    companies: list[dict] = []
    if user.get("role") == "company":
        managed = managed_company_ids_from_doc(user)
        for cid in managed:
            c = await companies_collection.find_one({"_id": cid})
            companies.append({"id": cid, "name": (c.get("name") if c else "") or ""})
    return {
        "username": user["username"],
        "role": user["role"],
        "company_id": user.get("company_id"),
        "company_name": company_name,
        "managed_company_ids": managed if user.get("role") == "company" else None,
        "companies": companies if user.get("role") == "company" else None,
        "full_name": user.get("full_name"),
        "email": user.get("email"),
        "phone": user.get("phone") or "",
        "department": user.get("department"),
        "company_access": user.get("company_access") if user["role"] == "company" else None,
        "avatar_url": _avatar_public_url(user.get("avatar_filename")),
        "kvkk_accepted_at": user.get("kvkk_accepted_at"),
        "kvkk_revoked_at": user.get("kvkk_revoked_at"),
        "notify_email": user.get("notify_email", True),
    }


class ProfilePatchBody(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., min_length=3, max_length=120)
    phone: str = Field(..., min_length=8, max_length=40)
    department: str | None = Field(None, max_length=120)
    company_name: str | None = Field(None, max_length=200)
    notify_email: bool | None = None


class PasswordChangeBody(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=6, max_length=128)
    new_password_confirm: str = Field(..., min_length=6, max_length=128)


@router.patch("/me", response_model=dict)
async def patch_me_profile(body: ProfilePatchBody, user: dict = Depends(get_current_user)):
    role = user["role"]
    if role != "company":
        if body.department is not None and str(body.department).strip():
            raise HTTPException(400, "Departman yalnızca şirket hesabında düzenlenebilir.")
        if body.company_name is not None and str(body.company_name).strip():
            raise HTTPException(400, "Şirket unvanı yalnızca şirket hesabında düzenlenebilir.")

    fn = body.full_name.strip()
    em = body.email.strip()
    if not _EMAIL_RE.match(em):
        raise HTTPException(400, "Geçerli bir e-posta girin.")

    updates: dict = {
        "full_name": fn,
        "email": em,
        "phone": body.phone.strip() if body.phone else "",
    }
    if body.notify_email is not None:
        updates["notify_email"] = bool(body.notify_email)
    if role == "company":
        access = user.get("company_access") or "hr"
        if access == "hr":
            updates["department"] = (body.department or "").strip() or None

    await users_collection.update_one({"username": user["username"]}, {"$set": updates})

    if role == "company" and user.get("company_id") and body.company_name is not None:
        nm = body.company_name.strip()
        if len(nm) < 2:
            raise HTTPException(400, "Şirket unvanı en az 2 karakter olmalıdır.")
        await companies_collection.update_one(
            {"_id": user["company_id"]},
            {"$set": {"name": nm}},
        )

    return {"message": "Profil güncellendi."}


@router.post("/password", response_model=dict)
async def change_password(body: PasswordChangeBody, user: dict = Depends(get_current_user)):
    if body.new_password != body.new_password_confirm:
        raise HTTPException(400, "Yeni şifreler eşleşmiyor.")
    doc = await users_collection.find_one({"username": user["username"]})
    if not doc:
        raise HTTPException(401, "Kullanıcı bulunamadı.")
    if not verify_password(body.current_password, doc["password_hash"]):
        raise HTTPException(400, "Mevcut şifre hatalı.")
    await users_collection.update_one(
        {"username": user["username"]},
        {"$set": {"password_hash": hash_password(body.new_password)}},
    )
    return {"message": "Şifre güncellendi. Yeni şifreyle tekrar giriş yapabilirsiniz."}


@router.post("/avatar", response_model=dict)
async def upload_avatar(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    ct = (file.content_type or "").split(";")[0].strip().lower()
    if ct not in _AVATAR_CT_EXT:
        raise HTTPException(400, "Yalnızca JPEG, PNG veya WebP yükleyin.")
    raw = await file.read()
    if len(raw) > _MAX_AVATAR_BYTES:
        raise HTTPException(400, "Dosya en fazla 1,5 MB olabilir.")
    if ct == "image/jpeg" and not raw.startswith(b"\xff\xd8\xff"):
        raise HTTPException(400, "Geçersiz görsel dosyası.")
    if ct == "image/png" and not raw.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(400, "Geçersiz görsel dosyası.")
    if ct == "image/webp" and (not raw.startswith(b"RIFF") or b"WEBP" not in raw[:16]):
        raise HTTPException(400, "Geçersiz görsel dosyası.")

    doc = await users_collection.find_one({"username": user["username"]})
    if not doc:
        raise HTTPException(401, "Kullanıcı bulunamadı.")
    prev = doc.get("avatar_filename")

    os.makedirs(_AVATAR_DIR, exist_ok=True)
    if prev:
        try:
            old_abs = os.path.normpath(os.path.join(_UPLOADS_ROOT, str(prev).replace("\\", "/").lstrip("/")))
            root_norm = os.path.normpath(_UPLOADS_ROOT) + os.sep
            if old_abs.startswith(root_norm) and os.path.isfile(old_abs):
                os.remove(old_abs)
        except OSError:
            pass

    ext = _AVATAR_CT_EXT[ct]
    fname = f"{uuid.uuid4().hex}{ext}"
    rel_path = f"avatars/{fname}"
    dest = os.path.join(_AVATAR_DIR, fname)
    with open(dest, "wb") as f:
        f.write(raw)

    await users_collection.update_one(
        {"username": user["username"]},
        {"$set": {"avatar_filename": rel_path}},
    )
    return {"avatar_url": _avatar_public_url(rel_path)}


@router.delete("/avatar")
async def delete_avatar(user: dict = Depends(get_current_user)):
    doc = await users_collection.find_one({"username": user["username"]})
    if not doc:
        raise HTTPException(401, "Kullanıcı bulunamadı.")
    prev = doc.get("avatar_filename")
    if prev:
        try:
            old_abs = os.path.normpath(os.path.join(_UPLOADS_ROOT, str(prev).replace("\\", "/").lstrip("/")))
            root_norm = os.path.normpath(_UPLOADS_ROOT) + os.sep
            if old_abs.startswith(root_norm) and os.path.isfile(old_abs):
                os.remove(old_abs)
        except OSError:
            pass
    await users_collection.update_one(
        {"username": user["username"]},
        {"$unset": {"avatar_filename": ""}},
    )
    return {"message": "Profil fotoğrafı kaldırıldı.", "avatar_url": None}


@router.post("/logout")
async def logout(request: Request, user: dict = Depends(get_current_user)):
    await log_audit("logout", username=user["username"], role=user["role"], ip=_client_ip(request))
    return {"message": "Çıkış yapıldı."}


@router.delete("/me")
async def delete_my_account(request: Request, user: dict = Depends(get_current_user)):
    role = user["role"]
    if role == "admin":
        raise HTTPException(403, detail="Sistem yöneticisi hesabı bu ekrandan silinemez.")
    username = user["username"]
    if role == "employee":
        await delete_employee_account(username)
    else:
        await delete_company_account(username)
    await log_audit(
        "account_deleted",
        username=username,
        role=role,
        ip=_client_ip(request),
    )
    return {"message": "Hesabınız ve ilişkili verileriniz silindi."}


class PasswordResetRequestBody(BaseModel):
    email: str = Field(..., min_length=3, max_length=120)


class PasswordResetConfirmBody(BaseModel):
    token: str = Field(..., min_length=20, max_length=256)
    new_password: str = Field(..., min_length=6, max_length=128)
    new_password_confirm: str = Field(..., min_length=6, max_length=128)


@router.post("/password-reset-request")
async def password_reset_request(body: PasswordResetRequestBody):
    em = body.email.strip().lower()
    user = await users_collection.find_one({"email": {"$regex": f"^{re.escape(em)}$", "$options": "i"}})
    generic = {
        "message": "Şifre sıfırlama talebiniz alındı. E-posta kutunuzu kontrol edin."
    }
    if not user:
        return generic

    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES)
    await password_reset_collection.delete_many({"username": user["username"]})
    await password_reset_collection.insert_one(
        {
            "username": user["username"],
            "token_hash": _hash_reset_token(token),
            "expires_at": expires,
            "created_at": datetime.utcnow().isoformat(),
        }
    )
    reset_url = f"{settings.APP_PUBLIC_URL.rstrip('/')}/#password-reset?token={token}"
    body_text = f"CVMatch şifre sıfırlama bağlantınız:\n{reset_url}\n\nBağlantı {settings.PASSWORD_RESET_EXPIRE_MINUTES} dakika geçerlidir."
    sent = send_email(user.get("email") or em, "CVMatch — Şifre sıfırlama", body_text)
    await log_audit("password_reset_requested", username=user["username"])
    if settings.is_development and not sent:
        return {**generic, "dev_reset_token": token, "dev_reset_url": reset_url}
    return generic


@router.post("/password-reset-confirm")
async def password_reset_confirm(body: PasswordResetConfirmBody):
    if body.new_password != body.new_password_confirm:
        raise HTTPException(400, detail="Yeni şifreler eşleşmiyor.")
    th = _hash_reset_token(body.token.strip())
    doc = await password_reset_collection.find_one({"token_hash": th})
    if not doc:
        raise HTTPException(400, detail="Geçersiz veya süresi dolmuş bağlantı.")
    exp = doc.get("expires_at")
    if exp and isinstance(exp, datetime) and exp.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        await password_reset_collection.delete_one({"_id": doc["_id"]})
        raise HTTPException(400, detail="Geçersiz veya süresi dolmuş bağlantı.")
    await users_collection.update_one(
        {"username": doc["username"]},
        {"$set": {"password_hash": hash_password(body.new_password)}},
    )
    await password_reset_collection.delete_many({"username": doc["username"]})
    await log_audit("password_reset_completed", username=doc["username"])
    return {"message": "Şifreniz güncellendi. Yeni şifreyle giriş yapabilirsiniz."}


class KvkkAcceptBody(BaseModel):
    kvkk_accepted: bool
    kvkk_version: str = Field(..., min_length=1)


@router.post("/kvkk-accept")
async def accept_kvkk(body: KvkkAcceptBody, user: dict = Depends(get_current_user)):
    if user["role"] != "employee":
        raise HTTPException(403, detail="KVKK onayı yalnızca aday hesapları için geçerlidir.")
    if not body.kvkk_accepted:
        raise HTTPException(400, detail="Onay kutusunu işaretlemelisiniz.")
    ver = await _published_kvkk_version()
    if body.kvkk_version != ver:
        raise HTTPException(400, detail="KVKK metni güncellenmiş. Sayfayı yenileyip tekrar onaylayın.")
    now = datetime.utcnow().isoformat()
    await users_collection.update_one(
        {"username": user["username"]},
        {"$set": {"kvkk_accepted_at": now, "kvkk_version": ver}, "$unset": {"kvkk_revoked_at": ""}},
    )
    await log_audit("kvkk_accepted", username=user["username"], role=user["role"])
    return {"message": "KVKK onayı kaydedildi.", "kvkk_version": ver}


@router.post("/kvkk-revoke")
async def revoke_kvkk_consent(user: dict = Depends(get_current_user)):
    if user["role"] != "employee":
        raise HTTPException(403, detail="KVKK rızası geri çekme yalnızca aday hesapları içindir.")
    now = datetime.utcnow().isoformat()
    await users_collection.update_one(
        {"username": user["username"]},
        {"$set": {"kvkk_revoked_at": now}, "$unset": {"kvkk_accepted_at": ""}},
    )
    await log_audit("kvkk_revoked", username=user["username"], role=user["role"])
    return {"message": "KVKK onayınız geri çekildi. CV işlemleri için tekrar onay gerekir."}
