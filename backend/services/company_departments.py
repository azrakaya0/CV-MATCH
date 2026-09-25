from database import companies_collection, job_collection, users_collection
from services.company_scope import normalize_dept


async def find_company_by_name(name: str) -> dict | None:
    nm = (name or "").strip()
    if not nm:
        return None
    target = nm.casefold()
    async for c in companies_collection.find({}):
        if (c.get("name") or "").strip().casefold() == target:
            return c
    return None


async def company_has_hr_user(company_id: str) -> bool:
    async for u in users_collection.find(
        {
            "role": "company",
            "company_access": "hr",
            "$or": [{"company_id": company_id}, {"managed_company_ids": company_id}],
        }
    ):
        if (u.get("account_status") or "active") == "active":
            return True
    return False


async def hr_usernames_for_company(company_id: str) -> list[str]:
    names: set[str] = set()
    async for u in users_collection.find({"role": "company", "company_access": "hr"}):
        if (u.get("account_status") or "active") != "active":
            continue
        cid = u.get("company_id")
        managed = u.get("managed_company_ids") or []
        if cid == company_id or company_id in managed:
            names.add(u["username"])
    return sorted(names)


async def known_departments_for_company(company_id: str) -> set[str]:
    depts: set[str] = set()
    async for j in job_collection.find({"company_id": company_id}):
        d = normalize_dept(j.get("department"))
        if d:
            depts.add(d)
    async for u in users_collection.find(
        {
            "role": "company",
            "company_id": company_id,
            "company_access": "department",
        }
    ):
        if not account_is_active(u):
            continue
        d = normalize_dept(u.get("department"))
        if d:
            depts.add(d)
    return depts


def account_is_active(user: dict) -> bool:
    return (user.get("account_status") or "active") == "active"
