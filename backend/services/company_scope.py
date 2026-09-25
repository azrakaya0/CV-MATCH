from services.cv_analyzer import turkish_lower


def normalize_dept(value: str | None) -> str:
    return turkish_lower((value or "").strip())


def company_has_hr_scope(user: dict) -> bool:
    if user.get("role") != "company":
        return False
    return (user.get("company_access") or "hr") in ("hr", "consultant")


def job_visible_to_company_user(job_doc: dict, user: dict) -> bool:
    if user.get("role") != "company":
        return True
    if company_has_hr_scope(user):
        return True
    jd = job_doc.get("department")
    if jd is None or (isinstance(jd, str) and not str(jd).strip()):
        return False
    ud = user.get("department")
    if ud is None or (isinstance(ud, str) and not str(ud).strip()):
        return False
    return normalize_dept(jd) == normalize_dept(ud)
