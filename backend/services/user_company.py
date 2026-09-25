def managed_company_ids_from_doc(doc: dict) -> list[str]:
    cid = doc.get("company_id")
    if not cid:
        cid = None
    raw = doc.get("managed_company_ids")
    if raw is None:
        return [str(cid)] if cid else []
    if isinstance(raw, str):
        raw = [raw]
    out: list[str] = []
    seen: set[str] = set()
    for x in raw:
        if not x:
            continue
        s = str(x).strip()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    if cid and str(cid).strip() not in seen:
        out.insert(0, str(cid).strip())
    return out
