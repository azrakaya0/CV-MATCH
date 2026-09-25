from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt, JWTError

from config import settings


def hash_password(plain: str) -> str:
    pw = plain.encode("utf-8")
    if len(pw) > 72:
        pw = pw[:72]
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("ascii")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        pw = plain.encode("utf-8")
        if len(pw) > 72:
            pw = pw[:72]
        return bcrypt.checkpw(pw, hashed.encode("ascii"))
    except (ValueError, TypeError):
        return False


def create_access_token(username: str, role: str) -> str:
    if role == "manager":
        role = "company"
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {"sub": username, "role": role, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


def payload_from_token(token: str) -> dict | None:
    try:
        return decode_token(token)
    except JWTError:
        return None
