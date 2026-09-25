from fastapi import HTTPException


def require_kvkk_consent(user: dict) -> None:
    if user.get("role") != "employee":
        return
    if user.get("kvkk_revoked_at"):
        raise HTTPException(
            403,
            detail="KVKK onayınız geri çekilmiş. CV işlemleri için ayarlardan metni tekrar onaylamanız gerekir.",
        )
    if not user.get("kvkk_accepted_at"):
        raise HTTPException(403, detail="KVKK onayı gerekli. Kayıt sırasında onay vermelisiniz.")
