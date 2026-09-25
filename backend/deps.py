from typing import Annotated

from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from database import users_collection
from services.auth_service import payload_from_token
from services.company_scope import company_has_hr_scope
from services.user_company import managed_company_ids_from_doc
from services.company_departments import account_is_active

security = HTTPBearer(auto_error=False)

VALID_ROLES = frozenset({"admin", "company", "employee"})


def _normalize_role(role: str | None) -> str:
    if role == "manager":
        return "company"
    return role or "employee"


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Giriş yapmanız gerekir.")
    payload = payload_from_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=401, detail="Oturum süresi dolmuş veya geçersiz.")
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Geçersiz oturum.")

    doc = await users_collection.find_one({"username": username})
    if not doc:
        raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı.")

    role = _normalize_role(doc.get("role"))
    if role not in VALID_ROLES:
        raise HTTPException(status_code=401, detail="Geçersiz hesap rolü.")
    if role == "company" and not account_is_active(doc):
        raise HTTPException(status_code=403, detail="Hesabınız henüz onaylanmadı.")

    company_access = None
    managed_ids: list[str] | None = None
    if role == "company":
        company_access = doc.get("company_access") or "hr"
        managed_ids = managed_company_ids_from_doc(doc)

    return {
        "username": doc["username"],
        "role": role,
        "company_id": doc.get("company_id"),
        "managed_company_ids": managed_ids,
        "full_name": doc.get("full_name"),
        "email": doc.get("email"),
        "phone": doc.get("phone") or "",
        "department": doc.get("department"),
        "company_access": company_access,
        "avatar_filename": doc.get("avatar_filename"),
        "kvkk_accepted_at": doc.get("kvkk_accepted_at"),
        "kvkk_revoked_at": doc.get("kvkk_revoked_at"),
        "_user_doc": doc,
    }


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yönetici (admin) yetkisi gerekir.")
    return user


async def require_company(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "company":
        raise HTTPException(status_code=403, detail="Bu işlem için şirket hesabı gerekir.")
    managed = list(user.get("managed_company_ids") or [])
    if not managed and user.get("company_id"):
        user = {**user, "managed_company_ids": [user["company_id"]]}
        managed = user["managed_company_ids"]
    if company_has_hr_scope(user):
        if not managed:
            raise HTTPException(status_code=403, detail="Yönetilen şirket tanımlı değil.")
    elif not user.get("company_id"):
        raise HTTPException(status_code=403, detail="Şirket kaydı tamamlanmamış.")
    return user


async def resolve_company_scoped_user(user: dict, x_company_id: str | None) -> dict:
    managed = list(user.get("managed_company_ids") or [])
    if not managed and user.get("company_id"):
        managed = [user["company_id"]]
    if company_has_hr_scope(user):
        if not managed:
            raise HTTPException(status_code=403, detail="Yönetilen şirket tanımlı değil.")
        h = (x_company_id or "").strip() or None
        if h:
            if h not in managed:
                raise HTTPException(status_code=403, detail="Bu şirkete erişiminiz yok.")
            eff = h
        elif len(managed) == 1:
            eff = managed[0]
        else:
            raise HTTPException(
                status_code=400,
                detail="Birden fazla şirket erişiminiz var. İstekte X-Company-Id başlığı gönderin.",
            )
    else:
        eff = user.get("company_id")
        if not eff:
            raise HTTPException(status_code=403, detail="Şirket kaydı tamamlanmamış.")
        if (x_company_id or "").strip() and (x_company_id or "").strip() != eff:
            raise HTTPException(status_code=403, detail="Geçersiz şirket seçimi.")
    return {**user, "effective_company_id": eff}


async def require_company_scoped(
    user: dict = Depends(require_company),
    x_company_id: Annotated[str | None, Header(alias="X-Company-Id")] = None,
) -> dict:
    return await resolve_company_scoped_user(user, x_company_id)


def ensure_company_registration_dict(user: dict) -> dict:
    if user.get("role") != "company":
        return user
    managed = list(user.get("managed_company_ids") or [])
    if not managed and user.get("company_id"):
        user = {**user, "managed_company_ids": [user["company_id"]]}
        managed = user["managed_company_ids"]
    if company_has_hr_scope(user):
        if not managed:
            raise HTTPException(status_code=403, detail="Yönetilen şirket tanımlı değil.")
    elif not user.get("company_id"):
        raise HTTPException(status_code=403, detail="Şirket kaydı tamamlanmamış.")
    return user


async def get_user_for_job_list(
    user: dict = Depends(get_current_user),
    x_company_id: Annotated[str | None, Header(alias="X-Company-Id")] = None,
) -> dict:
    if user["role"] == "admin":
        return user
    if user["role"] != "company":
        raise HTTPException(status_code=403, detail="Yetkisiz.")
    user = ensure_company_registration_dict(user)
    return await resolve_company_scoped_user(user, x_company_id)


async def get_user_for_job_detail(
    user: dict = Depends(get_current_user),
    x_company_id: Annotated[str | None, Header(alias="X-Company-Id")] = None,
) -> dict:
    if user["role"] in ("admin", "employee"):
        return user
    if user["role"] != "company":
        raise HTTPException(status_code=403, detail="Yetkisiz.")
    user = ensure_company_registration_dict(user)
    return await resolve_company_scoped_user(user, x_company_id)


async def get_user_for_cv_access(
    user: dict = Depends(get_current_user),
    x_company_id: Annotated[str | None, Header(alias="X-Company-Id")] = None,
) -> dict:
    if user["role"] != "company":
        return user
    u = ensure_company_registration_dict(dict(user))
    return await resolve_company_scoped_user(u, x_company_id)


async def require_company_hr(user: dict = Depends(require_company_scoped)) -> dict:
    if not company_has_hr_scope(user):
        raise HTTPException(
            status_code=403,
            detail="Bu işlem yalnızca İK (tam şirket görünümü) yetkisi gerektirir.",
        )
    return user


async def require_employee(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "employee":
        raise HTTPException(status_code=403, detail="Bu işlem için aday (çalışan) hesabı gerekir.")
    return user


async def require_company_or_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] not in ("company", "admin"):
        raise HTTPException(status_code=403, detail="Yetkiniz yok.")
    return user
