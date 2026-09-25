import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from config import settings
from database import applications_collection, cv_collection, job_collection
from deps import get_current_user, get_user_for_cv_access, require_company_scoped, require_employee
from services.company_scope import job_visible_to_company_user
from models import CVData, CVResponse, EmployeeCvFormPayload
from services.counter_service import ensure_cv_display_ids, get_next_cv_display_id
from services.cv_analyzer import analyze_cv, calculate_completion_score
from services.kvkk_check import require_kvkk_consent
from services.pdf_parser import extract_text_from_pdf

router = APIRouter(prefix="/api/cv", tags=["CV"])


class CVCompletionScoreResponse(BaseModel):
    score: int
    missing: list[str]
    level: str
    level_color: str
    total_fields: int
    completed_fields: int


async def _cv_ids_visible_to_company_user(user: dict) -> set[str]:
    cid = user.get("effective_company_id") or user.get("company_id")
    if not cid:
        return set()
    job_ids: list[str] = []
    async for j in job_collection.find({"company_id": cid}):
        if job_visible_to_company_user(j, user):
            job_ids.append(j["_id"])
    if not job_ids:
        return set()
    out: set[str] = set()
    async for a in applications_collection.find({"job_id": {"$in": job_ids}}):
        out.add(a["cv_id"])
    return out


async def _can_access_cv(doc: dict, user: dict) -> bool:
    if user["role"] == "admin":
        return True
    if user["role"] == "employee":
        return doc.get("owner_username") == user["username"]
    if user["role"] == "company" and (user.get("effective_company_id") or user.get("company_id")):
        visible = await _cv_ids_visible_to_company_user(user)
        return doc["_id"] in visible
    return False


def _merge_form_into_cv_data(cv_data: CVData, payload: EmployeeCvFormPayload) -> dict:
    d = cv_data.model_dump()
    if payload.full_name.strip():
        d["name"] = payload.full_name.strip()
    if payload.email.strip():
        d["email"] = payload.email.strip()
    if payload.phone.strip():
        d["phone"] = payload.phone.strip()
    if payload.city.strip():
        d["city"] = payload.city.strip()
    if payload.district.strip():
        d["district"] = payload.district.strip()
    d["references"] = [r.model_dump() for r in (payload.references or [])]
    d["certifications"] = [s.strip() for s in (payload.certifications or []) if s and str(s).strip()]
    return d


def _apply_blind_mode(doc: dict) -> dict:
    """Mask personal information for blind recruitment (bias prevention)."""
    doc_copy = doc.copy()
    data = doc_copy.get("data", {}).copy()
    
    # Mask personal information that could lead to bias
    data["name"] = None
    data["email"] = None
    data["phone"] = None
    data["city"] = None
    data["district"] = None
    
    # Mask education institution names (school bias)
    if "education" in data:
        for edu in data["education"]:
            if isinstance(edu, dict):
                edu["institution"] = "[Mezun Olunan Okul Gizli]"
    
    # Keep skills, experience duration, languages, certifications visible
    # These are job-relevant and less likely to cause bias
    
    doc_copy["data"] = data
    return doc_copy


def _doc_to_response(doc: dict) -> CVResponse:
    return CVResponse(
        id=doc["_id"],
        filename=doc.get("filename", ""),
        data=CVData(**doc["data"]),
        created_at=doc["created_at"],
        display_id=doc.get("display_id"),
        kvkk_consent_at=doc.get("kvkk_consent_at"),
        kvkk_version=doc.get("kvkk_version"),
        owner_username=doc.get("owner_username"),
        submission_type=doc.get("submission_type"),
        employee_form=doc.get("employee_form"),
    )


def _build_structured_raw_text(p: EmployeeCvFormPayload) -> str:
    blocks: list[str] = []
    if p.summary.strip():
        blocks.append(f"ÖZET / PROFİL:\n{p.summary.strip()}")
    contact = []
    if p.full_name.strip():
        contact.append(f"AD SOYAD: {p.full_name.strip()}")
    if p.email.strip():
        contact.append(f"E-POSTA: {p.email.strip()}")
    if p.phone.strip():
        contact.append(f"TELEFON: {p.phone.strip()}")
    if p.city.strip():
        contact.append(f"ŞEHİR: {p.city.strip()}")
    if p.district.strip():
        contact.append(f"İLÇE: {p.district.strip()}")
    if contact:
        blocks.append("\n".join(contact))

    exp_lines: list[str] = []
    for ex in p.experiences:
        title = ex.title.strip()
        company = ex.company.strip()
        desc = ex.description.strip()
        if ex.current:
            period = f"{ex.start.strip()} — Devam ediyor" if ex.start.strip() else "Devam ediyor"
        else:
            start, end = ex.start.strip(), ex.end.strip()
            period = " — ".join(x for x in (start, end) if x) if (start or end) else ""
        if not any([title, company, desc, period]):
            continue
        head_parts = [title] if title else []
        if company:
            head_parts.append(company)
        if period:
            head_parts.append(period)
        exp_lines.append(" | ".join(head_parts) if head_parts else "İş deneyimi")
        if desc:
            exp_lines.append(desc)
        exp_lines.append("")
    if exp_lines:
        blocks.append("İŞ DENEYİMİ:\n" + "\n".join(exp_lines).rstrip())

    edu_lines: list[str] = []
    for ed in p.educations:
        inst = ed.institution.strip()
        field = ed.field.strip()
        deg = ed.degree.strip()
        yr = ed.year.strip()
        if not any([inst, field, deg, yr]):
            continue
        parts = [x for x in [inst, field, deg, yr] if x]
        edu_lines.append(" | ".join(parts))
    if edu_lines:
        blocks.append("EĞİTİM:\n" + "\n".join(edu_lines))

    skills_clean = [s.strip() for s in p.skills if s and str(s).strip()]
    if skills_clean:
        blocks.append("BECERİLER:\n" + ", ".join(skills_clean))

    lang_lines: list[str] = []
    for lg in p.languages:
        n, lv = lg.name.strip(), lg.level.strip()
        if not n and not lv:
            continue
        lang_lines.append(f"{n}: {lv}".strip(": ").strip())
    if lang_lines:
        blocks.append("YABANCI DİLLER:\n" + "\n".join(lang_lines))

    cert_clean = [s.strip() for s in (p.certifications or []) if s and str(s).strip()]
    if cert_clean:
        blocks.append("SERTİFİKALAR:\n" + ", ".join(cert_clean))

    ref_lines: list[str] = []
    for rf in p.references or []:
        parts = [x for x in [rf.name.strip(), rf.title.strip(), rf.company.strip()] if x]
        contact = " / ".join(x for x in [rf.phone.strip(), rf.email.strip()] if x)
        if not parts and not contact:
            continue
        line = " — ".join(parts) if parts else "Referans"
        if contact:
            line += f" ({contact})"
        ref_lines.append(line)
    if ref_lines:
        blocks.append("REFERANSLAR:\n" + "\n".join(ref_lines))

    return "\n\n".join(blocks) if blocks else ""


@router.post("/upload", response_model=CVResponse)
async def upload_cv(
    file: UploadFile = File(...),
    kvkk_accepted: str = Form("false"),
    user: dict = Depends(require_company_scoped),
):
    if str(kvkk_accepted).lower() not in ("true", "1", "on", "yes"):
        raise HTTPException(
            status_code=400,
            detail="CV verilerinin işlenmesi için KVKK aydınlatma metnini onaylamanız gerekir.",
        )
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Sadece PDF dosyaları kabul edilmektedir.")

    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE:
        raise HTTPException(400, "Dosya boyutu çok büyük (max 10MB).")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_id = str(uuid.uuid4())
    file_path = os.path.join(settings.UPLOAD_DIR, f"{file_id}.pdf")
    display_id = await get_next_cv_display_id()

    with open(file_path, "wb") as f:
        f.write(content)

    try:
        raw_text = extract_text_from_pdf(file_path)
        cv_data = analyze_cv(raw_text, file_path=file_path)
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(500, f"PDF analiz hatası: {str(e)}") from e

    now = datetime.utcnow().isoformat()
    doc = {
        "_id": file_id,
        "filename": file.filename,
        "file_path": file_path,
        "data": cv_data.model_dump(),
        "created_at": now,
        "display_id": display_id,
        "kvkk_consent_at": now,
        "kvkk_version": settings.KVKK_POLICY_VERSION,
        "owner_username": None,
        "submission_type": "pdf",
    }
    await cv_collection.insert_one(doc)
    return _doc_to_response(doc)


@router.post("/employee-submit", response_model=CVResponse)
async def employee_submit_cv(
    kvkk_accepted: str = Form("false"),
    cv_payload: str = Form("{}"),
    file: UploadFile | None = File(None),
    user: dict = Depends(require_employee),
):
    require_kvkk_consent(user)
    if str(kvkk_accepted).lower() not in ("true", "1", "on", "yes"):
        raise HTTPException(
            status_code=400,
            detail="Kişisel verilerin işlenmesi için KVKK onayı zorunludur.",
        )

    try:
        payload = EmployeeCvFormPayload.model_validate_json(cv_payload or "{}")
    except Exception:
        raise HTTPException(status_code=400, detail="Geçersiz CV formu (cv_payload).") from None

    form_text = _build_structured_raw_text(payload)
    has_pdf = file and file.filename and file.filename.lower().endswith(".pdf")

    if not form_text.strip() and not has_pdf:
        raise HTTPException(
            400,
            "Lütfen en az bir alan doldurun veya PDF CV yükleyin.",
        )

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_id = str(uuid.uuid4())
    file_path = ""
    raw_text = form_text
    submission_type = "form"
    pdf_path_for_analyze: str | None = None

    if has_pdf:
        content = await file.read()
        if len(content) > settings.MAX_FILE_SIZE:
            raise HTTPException(400, "PDF boyutu çok büyük (max 10MB).")
        file_path = os.path.join(settings.UPLOAD_DIR, f"{file_id}.pdf")
        with open(file_path, "wb") as f:
            f.write(content)
        try:
            pdf_text = extract_text_from_pdf(file_path)
        except Exception as e:
            os.remove(file_path)
            raise HTTPException(500, f"PDF okuma hatası: {str(e)}") from e
        if form_text.strip():
            raw_text = f"{form_text}\n\n--- YÜKLENEN PDF METNİ ---\n{pdf_text}"
        else:
            raw_text = pdf_text
        pdf_path_for_analyze = file_path
        submission_type = "form_pdf" if form_text.strip() else "pdf"

    try:
        cv_data = analyze_cv(raw_text, file_path=pdf_path_for_analyze)
    except Exception as e:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(500, f"CV analiz hatası: {str(e)}") from e

    display_id = await get_next_cv_display_id()
    now = datetime.utcnow().isoformat()
    form_snap = payload.model_dump()
    doc = {
        "_id": file_id,
        "filename": f"CV_{display_id}.pdf" if has_pdf else f"CV_{display_id}_form.txt",
        "file_path": file_path,
        "data": _merge_form_into_cv_data(cv_data, payload),
        "employee_form": form_snap,
        "created_at": now,
        "display_id": display_id,
        "kvkk_consent_at": now,
        "kvkk_version": settings.KVKK_POLICY_VERSION,
        "owner_username": user["username"],
        "submission_type": submission_type,
    }
    await cv_collection.insert_one(doc)
    return _doc_to_response(doc)


@router.put("/employee/{cv_id}", response_model=CVResponse)
async def employee_update_cv(
    cv_id: str,
    kvkk_accepted: str = Form("false"),
    cv_payload: str = Form("{}"),
    file: UploadFile | None = File(None),
    user: dict = Depends(require_employee),
):
    require_kvkk_consent(user)
    if str(kvkk_accepted).lower() not in ("true", "1", "on", "yes"):
        raise HTTPException(
            status_code=400,
            detail="Kişisel verilerin işlenmesi için KVKK onayı zorunludur.",
        )
    existing = await cv_collection.find_one({"_id": cv_id})
    if not existing or existing.get("owner_username") != user["username"]:
        raise HTTPException(404, "CV bulunamadı.")

    try:
        payload = EmployeeCvFormPayload.model_validate_json(cv_payload or "{}")
    except Exception:
        raise HTTPException(status_code=400, detail="Geçersiz CV formu (cv_payload).") from None

    form_text = _build_structured_raw_text(payload)
    has_new_pdf = file and file.filename and file.filename.lower().endswith(".pdf")
    old_path = existing.get("file_path") or ""

    if not form_text.strip() and not has_new_pdf and not (old_path and os.path.exists(old_path)):
        raise HTTPException(400, "Güncelleme için form veya PDF gerekir.")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_path = old_path if (old_path and os.path.exists(old_path)) else ""
    raw_text = form_text
    submission_type = "form"
    pdf_path_for_analyze: str | None = None

    if has_new_pdf:
        if old_path and os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass
        content = await file.read()
        if len(content) > settings.MAX_FILE_SIZE:
            raise HTTPException(400, "PDF boyutu çok büyük (max 10MB).")
        file_path = os.path.join(settings.UPLOAD_DIR, f"{cv_id}.pdf")
        with open(file_path, "wb") as f:
            f.write(content)
        try:
            pdf_text = extract_text_from_pdf(file_path)
        except Exception as e:
            if os.path.exists(file_path):
                os.remove(file_path)
            raise HTTPException(500, f"PDF okuma hatası: {str(e)}") from e
        if form_text.strip():
            raw_text = f"{form_text}\n\n--- YÜKLENEN PDF METNİ ---\n{pdf_text}"
        else:
            raw_text = pdf_text
        pdf_path_for_analyze = file_path
        submission_type = "form_pdf" if form_text.strip() else "pdf"
    elif file_path and os.path.exists(file_path) and file_path.lower().endswith(".pdf"):
        try:
            pdf_text = extract_text_from_pdf(file_path)
        except Exception:
            pdf_text = ""
        if form_text.strip() and pdf_text:
            raw_text = f"{form_text}\n\n--- MEVCUT PDF METNİ ---\n{pdf_text}"
        elif pdf_text:
            raw_text = pdf_text
        pdf_path_for_analyze = file_path
        submission_type = "form_pdf" if form_text.strip() else "pdf"
    else:
        raw_text = form_text
        submission_type = "form"

    try:
        cv_data = analyze_cv(raw_text, file_path=pdf_path_for_analyze)
    except Exception as e:
        raise HTTPException(500, f"CV analiz hatası: {str(e)}") from e

    did = existing.get("display_id")
    now = datetime.utcnow().isoformat()
    fname = f"CV_{did}.pdf" if (file_path and file_path.endswith(".pdf")) else f"CV_{did}_form.txt" if did else existing.get("filename", "cv.txt")
    form_snap = payload.model_dump()

    await cv_collection.update_one(
        {"_id": cv_id},
        {
            "$set": {
                "filename": fname,
                "file_path": file_path,
                "data": _merge_form_into_cv_data(cv_data, payload),
                "employee_form": form_snap,
                "kvkk_consent_at": now,
                "kvkk_version": settings.KVKK_POLICY_VERSION,
                "owner_username": user["username"],
                "submission_type": submission_type,
                "updated_at": now,
            }
        },
    )
    doc = await cv_collection.find_one({"_id": cv_id})
    return _doc_to_response(doc)


@router.get("/list", response_model=list[CVResponse])
async def list_cvs(
    user: dict = Depends(get_user_for_cv_access),
    limit: int = 500,
    skip: int = 0,
    blind_mode: bool = False,
):
    limit = min(max(limit, 1), 500)
    skip = max(skip, 0)
    if user["role"] == "admin":
        cvs = []
        async for doc in cv_collection.find({}).sort("created_at", -1).skip(skip).limit(limit):
            if blind_mode:
                doc = _apply_blind_mode(doc)
            cvs.append(_doc_to_response(doc))
        return cvs
    elif user["role"] == "company":
        await ensure_cv_display_ids()
        cv_ids = await _cv_ids_visible_to_company_user(user)
        query = {"_id": {"$in": list(cv_ids)}} if cv_ids else {"_id": {"$in": ["__none__"]}}
    else:
        query = {"owner_username": user["username"]}

    cvs = []
    sort_field = "display_id" if user["role"] == "company" else "created_at"
    sort_dir = 1 if user["role"] == "company" else -1
    cursor = cv_collection.find(query).sort(sort_field, sort_dir)
    async for doc in cursor:
        if blind_mode and user["role"] == "company":
            doc = _apply_blind_mode(doc)
        cvs.append(_doc_to_response(doc))
    return cvs


@router.post("/reanalyze-all")
async def reanalyze_all_cvs(user: dict = Depends(require_company_scoped)):
    cv_ids = await _cv_ids_visible_to_company_user(user)
    count = 0
    async for doc in cv_collection.find({"_id": {"$in": list(cv_ids)}} if cv_ids else {"_id": {"$in": ["__none__"]}}):
        file_path = doc.get("file_path", "")
        try:
            if os.path.exists(file_path):
                raw_text = extract_text_from_pdf(file_path)
                cv_data = analyze_cv(raw_text, file_path=file_path)
            else:
                raw_text = doc.get("data", {}).get("raw_text", "")
                if not raw_text.strip():
                    continue
                cv_data = analyze_cv(raw_text, file_path=None)
            await cv_collection.update_one(
                {"_id": doc["_id"]},
                {"$set": {"data": cv_data.model_dump()}},
            )
            count += 1
        except Exception:
            continue
    return {"message": f"{count} CV yeniden analiz edildi."}


@router.get("/{cv_id}", response_model=CVResponse)
async def get_cv(cv_id: str, blind_mode: bool = False, user: dict = Depends(get_user_for_cv_access)):
    doc = await cv_collection.find_one({"_id": cv_id})
    if not doc:
        raise HTTPException(404, "CV bulunamadı.")
    if not await _can_access_cv(doc, user):
        raise HTTPException(403, "Bu CV'ye erişim yetkiniz yok.")
    
    # Apply blind mode for HR users
    if blind_mode and user["role"] == "company":
        doc = _apply_blind_mode(doc)
    
    return _doc_to_response(doc)


@router.get("/{cv_id}/raw-text")
async def get_raw_text(cv_id: str, user: dict = Depends(get_user_for_cv_access)):
    doc = await cv_collection.find_one({"_id": cv_id})
    if not doc:
        raise HTTPException(404, "CV bulunamadı.")
    if not await _can_access_cv(doc, user):
        raise HTTPException(403, "Bu CV'ye erişim yetkiniz yok.")
    file_path = doc.get("file_path", "")
    if os.path.exists(file_path):
        raw_text = extract_text_from_pdf(file_path)
        return {"raw_text": raw_text}
    rt = doc.get("data", {}).get("raw_text")
    if rt:
        return {"raw_text": rt}
    raise HTTPException(404, "Metin bulunamadı.")


@router.post("/{cv_id}/reanalyze", response_model=CVResponse)
async def reanalyze_cv(cv_id: str, user: dict = Depends(require_company_scoped)):
    doc = await cv_collection.find_one({"_id": cv_id})
    if not doc:
        raise HTTPException(404, "CV bulunamadı.")
    if not await _can_access_cv(doc, user):
        raise HTTPException(403, "Bu CV için işlem yapamazsınız.")

    file_path = doc.get("file_path", "")
    if os.path.exists(file_path):
        raw_text = extract_text_from_pdf(file_path)
        cv_data = analyze_cv(raw_text, file_path=file_path)
    else:
        raw_text = doc.get("data", {}).get("raw_text", "")
        if not raw_text.strip():
            raise HTTPException(400, "Yeniden analiz için kayıtlı metin yok.")
        cv_data = analyze_cv(raw_text, file_path=None)

    await cv_collection.update_one(
        {"_id": cv_id},
        {"$set": {"data": cv_data.model_dump()}},
    )
    doc = await cv_collection.find_one({"_id": cv_id})
    return _doc_to_response(doc)


@router.get("/{cv_id}/download")
async def download_cv(cv_id: str, user: dict = Depends(get_user_for_cv_access)):
    doc = await cv_collection.find_one({"_id": cv_id})
    if not doc:
        raise HTTPException(404, "CV bulunamadı.")
    if not await _can_access_cv(doc, user):
        raise HTTPException(403, "Bu CV'yi indirme yetkiniz yok.")

    file_path = doc.get("file_path", "")
    if not os.path.exists(file_path):
        raise HTTPException(404, "CV dosyası bulunmuyor (yalnızca form ile oluşturulmuş olabilir).")

    did = doc.get("display_id")
    download_name = f"CV_{did}.pdf" if did is not None else doc.get("filename", "cv.pdf")

    return FileResponse(
        path=file_path,
        filename=download_name,
        media_type="application/pdf",
    )


@router.delete("/{cv_id}")
async def delete_cv(cv_id: str, user: dict = Depends(get_current_user)):
    doc = await cv_collection.find_one({"_id": cv_id})
    if not doc:
        raise HTTPException(404, "CV bulunamadı.")
    if user["role"] == "admin":
        pass
    elif user["role"] == "employee":
        if doc.get("owner_username") != user["username"]:
            raise HTTPException(403, "Bu CV'yi silme yetkiniz yok.")
    else:
        raise HTTPException(403, "CV silme yalnızca sahibi veya sistem yöneticisi tarafından yapılabilir.")

    if os.path.exists(doc.get("file_path", "")):
        os.remove(doc["file_path"])
    await cv_collection.delete_one({"_id": cv_id})
    return {"message": "CV silindi."}


@router.get("/{cv_id}/completion-score", response_model=CVCompletionScoreResponse)
async def get_cv_completion_score(cv_id: str, user: dict = Depends(get_current_user)):
    """CV'nin tamamlanma puanını döndürür."""
    doc = await cv_collection.find_one({"_id": cv_id})
    if not doc:
        raise HTTPException(404, "CV bulunamadı.")
    
    # Sadece CV sahibi veya admin görebilir
    if user["role"] == "employee":
        if doc.get("owner_username") != user["username"]:
            raise HTTPException(403, "Bu CV'yi görme yetkiniz yok.")
    elif user["role"] != "admin":
        raise HTTPException(403, "Bu özelliği sadece adaylar ve admin kullanabilir.")
    
    cv_data = doc.get("data", {})
    completion_score = calculate_completion_score(cv_data)
    
    return CVCompletionScoreResponse(**completion_score)
