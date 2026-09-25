import re

from database import users_collection

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.çğıöşüÇĞİÖŞÜ-]{3,32}$")


def username_key(username: str) -> str:
    return (username or "").strip().casefold()


def validate_username_format(username: str) -> str | None:
    un = (username or "").strip()
    if not _USERNAME_RE.match(un):
        return "Kullanıcı adı 3–32 karakter; harf, rakam, _ . - kullanılabilir."
    return None


async def username_taken(username: str) -> bool:
    key = username_key(username)
    if not key:
        return True
    if await users_collection.find_one({"username_lc": key}):
        return True
    un = username.strip()
    legacy = await users_collection.find_one(
        {"username": {"$regex": f"^{re.escape(un)}$", "$options": "i"}}
    )
    return legacy is not None


def username_fields(username: str) -> dict[str, str]:
    un = username.strip()
    return {"username": un, "username_lc": username_key(un)}
