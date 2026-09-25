"""Şirket kaydı (companies koleksiyonu) iletişim ve unvan alanları."""


def profile_from_company_doc(doc: dict | None) -> dict | None:
    if not doc:
        return None
    name = (doc.get("name") or "").strip() or None
    email = (doc.get("email") or "").strip() or None
    phone = (doc.get("phone") or "").strip() or None
    address = (doc.get("address") or "").strip() or None
    website = (doc.get("website") or "").strip() or None
    if not any([name, email, phone, address, website]):
        return None
    return {
        "name": name,
        "email": email,
        "phone": phone,
        "address": address,
        "website": website,
    }


async def company_profile_map(collection, company_ids: set[str]) -> dict[str, dict]:
    if not company_ids:
        return {}
    out: dict[str, dict] = {}
    async for c in collection.find({"_id": {"$in": list(company_ids)}}):
        prof = profile_from_company_doc(c)
        if prof:
            out[str(c["_id"])] = prof
    return out
