import uuid
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from database import applications_collection, cv_collection, job_collection, match_collection
from deps import require_company_scoped
from services.company_scope import job_visible_to_company_user
from models import CVData, CompareRequest, JobRequirements, MatchDetail, MatchResult, MatchScores
from services.counter_service import cv_label_for_match
from services.matcher import match_cv_job
from services.report_generator import generate_match_report
from services.audit_service import log_audit
from services.suggestion import generate_suggestions

router = APIRouter(prefix="/api/match", tags=["Eşleştirme"])


async def _company_job_for_match(job_id: str, user: dict) -> dict | None:
    doc = await job_collection.find_one({"_id": job_id})
    if not doc or doc.get("company_id") != user["effective_company_id"]:
        return None
    if not job_visible_to_company_user(doc, user):
        return None
    return doc


async def _applicant_cv_ids(job_id: str) -> set[str]:
    s: set[str] = set()
    async for a in applications_collection.find({"job_id": job_id}):
        s.add(a["cv_id"])
    return s


async def _company_can_match_cv(job_id: str, cv_id: str, user: dict) -> bool:
    if not await _company_job_for_match(job_id, user):
        return False
    apps = await _applicant_cv_ids(job_id)
    return cv_id in apps


@router.post("/run/{cv_id}/{job_id}", response_model=MatchResult)
async def run_match(
    cv_id: str,
    job_id: str,
    user: dict = Depends(require_company_scoped),
):
    if not await _company_can_match_cv(job_id, cv_id, user):
        raise HTTPException(403, "Bu ilan veya CV için eşleştirme yapılamaz.")

    cv_doc = await cv_collection.find_one({"_id": cv_id})
    if not cv_doc:
        raise HTTPException(404, "CV bulunamadı.")

    job_doc = await job_collection.find_one({"_id": job_id})
    if not job_doc:
        raise HTTPException(404, "İş ilanı bulunamadı.")

    cv_data = CVData(**cv_doc["data"])
    job_req = JobRequirements(**job_doc["requirements"])
    cv_label = cv_label_for_match(cv_doc, cv_data.name)

    scores, matched, missing, detail = match_cv_job(cv_data, job_req)
    suggestions = generate_suggestions(scores, missing, matched)

    match_id = str(uuid.uuid4())
    doc = {
        "_id": match_id,
        "cv_id": cv_id,
        "job_id": job_id,
        "cv_name": cv_label,
        "scores": scores.model_dump(),
        "matched_skills": matched,
        "missing_skills": missing,
        "detail": detail,
        "suggestions": suggestions,
        "created_at": datetime.utcnow().isoformat(),
    }
    await match_collection.insert_one(doc)
    await log_audit(
        "match_run",
        username=user["username"],
        role=user["role"],
        resource_type="match",
        resource_id=match_id,
        company_id=user.get("effective_company_id"),
        meta={"cv_id": cv_id, "job_id": job_id, "score": scores.overall},
    )

    return MatchResult(
        id=match_id,
        cv_id=cv_id,
        job_id=job_id,
        cv_name=cv_label,
        scores=scores,
        matched_skills=matched,
        missing_skills=missing,
        detail=MatchDetail(**detail),
        suggestions=suggestions,
        created_at=doc["created_at"],
    )


@router.post("/compare", response_model=list[MatchResult])
async def compare_cvs(request: CompareRequest, user: dict = Depends(require_company_scoped)):
    job_doc = await _company_job_for_match(request.job_id, user)
    if not job_doc:
        raise HTTPException(404, "İş ilanı bulunamadı veya erişiminiz yok.")

    allowed = await _applicant_cv_ids(request.job_id)
    if not request.cv_ids or len(request.cv_ids) < 2:
        raise HTTPException(400, "Karşılaştırma için en az 2 CV seçin.")
    for cid in request.cv_ids:
        if cid not in allowed:
            raise HTTPException(400, "Seçilen CV'ler bu ilanın başvuruları arasında olmalıdır.")

    job_req = JobRequirements(**job_doc["requirements"])
    results = []

    for cv_id in request.cv_ids:
        cv_doc = await cv_collection.find_one({"_id": cv_id})
        if not cv_doc:
            continue

        cv_data = CVData(**cv_doc["data"])
        cv_label = cv_label_for_match(cv_doc, cv_data.name)
        scores, matched, missing, detail = match_cv_job(cv_data, job_req)
        suggestions = generate_suggestions(scores, missing, matched)

        match_id = str(uuid.uuid4())
        doc = {
            "_id": match_id,
            "cv_id": cv_id,
            "job_id": request.job_id,
            "cv_name": cv_label,
            "scores": scores.model_dump(),
            "matched_skills": matched,
            "missing_skills": missing,
            "detail": detail,
            "suggestions": suggestions,
            "created_at": datetime.utcnow().isoformat(),
        }
        await match_collection.insert_one(doc)

        results.append(
            MatchResult(
                id=match_id,
                cv_id=cv_id,
                job_id=request.job_id,
                cv_name=cv_label,
                scores=scores,
                matched_skills=matched,
                missing_skills=missing,
                detail=MatchDetail(**detail),
                suggestions=suggestions,
                created_at=doc["created_at"],
            )
        )

    results.sort(key=lambda x: x.scores.overall, reverse=True)
    return results


@router.get("/history", response_model=list[MatchResult])
async def match_history(user: dict = Depends(require_company_scoped)):
    job_ids: list[str] = []
    async for j in job_collection.find({"company_id": user["effective_company_id"]}):
        if job_visible_to_company_user(j, user):
            job_ids.append(j["_id"])
    results = []
    query = {"job_id": {"$in": job_ids}} if job_ids else {"job_id": "__none__"}
    async for doc in match_collection.find(query).sort("created_at", -1).limit(80):
        detail_data = doc.get("detail")
        results.append(
            MatchResult(
                id=doc["_id"],
                cv_id=doc["cv_id"],
                job_id=doc["job_id"],
                cv_name=doc.get("cv_name"),
                scores=MatchScores(**doc["scores"]),
                matched_skills=doc["matched_skills"],
                missing_skills=doc["missing_skills"],
                detail=MatchDetail(**detail_data) if detail_data else None,
                suggestions=doc["suggestions"],
                created_at=doc["created_at"],
            )
        )
    return results


@router.get("/report/{match_id}")
async def download_report(match_id: str, user: dict = Depends(require_company_scoped)):
    match_doc = await match_collection.find_one({"_id": match_id})
    if not match_doc:
        raise HTTPException(404, "Eşleştirme bulunamadı.")
    job_doc = await job_collection.find_one({"_id": match_doc["job_id"]})
    if not job_doc or job_doc.get("company_id") != user["effective_company_id"]:
        raise HTTPException(403, "Rapor indirilemez.")
    if not job_visible_to_company_user(job_doc, user):
        raise HTTPException(403, "Rapor indirilemez.")

    job_data = {"title": "Bilinmiyor", "company": None}
    if job_doc:
        job_data = {"title": job_doc["title"], "company": job_doc.get("company")}

    cv_doc = await cv_collection.find_one({"_id": match_doc["cv_id"]})
    cv_data = {}
    if cv_doc:
        cv_data = cv_doc.get("data", {})

    pdf_bytes = generate_match_report(match_doc, cv_data, job_data)

    slug = str(match_doc.get("cv_name") or "CV").strip()
    for ch in '\\/:*?"<>|\r\n\x00':
        slug = slug.replace(ch, "_")
    slug = slug.strip("._ ") or "CV"
    slug = slug[:80]
    utf8_name = f"CVMatch_Rapor_{slug}.pdf"
    ascii_fallback = "CVMatch_Rapor.pdf"
    filename_star = quote(utf8_name.encode("utf-8"))
    cd = f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{filename_star}"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": cd},
    )
