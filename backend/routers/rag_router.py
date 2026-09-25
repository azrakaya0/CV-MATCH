from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from config import settings
from database import applications_collection, job_collection
from rate_limit import check_rate_limit
from deps import require_company_scoped
from services.company_scope import company_has_hr_scope, job_visible_to_company_user
from services.rag_service import ask_selected_cvs, ask_single_cv

router = APIRouter(prefix="/api/rag", tags=["Soru-Cevap (RAG)"])


class RAGRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=2000)
    mode: str = "single"
    cv_id: Optional[str] = None
    cv_ids: Optional[List[str]] = None
    job_id: Optional[str] = None


class RAGSource(BaseModel):
    cv_name: str
    cv_id: str
    text: str
    similarity: float


class RAGResponse(BaseModel):
    answer: str
    sources: list[RAGSource] = []


async def _applicant_cv_ids_for_company_job(job_id: str, user: dict) -> list[str]:
    job = await job_collection.find_one({"_id": job_id})
    if not job or job.get("company_id") != user["effective_company_id"]:
        return []
    if not job_visible_to_company_user(job, user):
        return []
    ids: list[str] = []
    async for a in applications_collection.find({"job_id": job_id}):
        ids.append(a["cv_id"])
    return list(dict.fromkeys(ids))


async def _scoped_applicant_cv_ids_company(user: dict) -> set[str]:
    job_ids: list[str] = []
    async for j in job_collection.find({"company_id": user["company_id"]}):
        if job_visible_to_company_user(j, user):
            job_ids.append(j["_id"])
    if not job_ids:
        return set()
    out: set[str] = set()
    async for a in applications_collection.find({"job_id": {"$in": job_ids}}):
        out.add(a["cv_id"])
    return out


@router.post("/ask", response_model=RAGResponse)
async def ask_question(
    req: RAGRequest,
    request: Request,
    user: dict = Depends(require_company_scoped),
):
    ip = request.client.host if request.client else "unknown"
    key = f"rag:{user['username']}:{ip}"
    if not check_rate_limit(key, settings.RAG_RATE_LIMIT, settings.RAG_RATE_WINDOW_SECONDS):
        raise HTTPException(429, detail="Çok fazla soru gönderdiniz. Lütfen kısa süre sonra tekrar deneyin.")
    if not req.question.strip():
        raise HTTPException(400, "Soru boş olamaz.")

    if req.mode == "single":
        if not req.cv_id:
            raise HTTPException(400, "Tek CV modunda cv_id gereklidir.")
        # cv must belong to an application to one of our jobs
        ok = False
        async for a in applications_collection.find({"cv_id": req.cv_id}):
            j = await job_collection.find_one({"_id": a["job_id"]})
            if j and j.get("company_id") == user["effective_company_id"] and job_visible_to_company_user(j, user):
                ok = True
                break
        if not ok:
            raise HTTPException(403, "Bu CV'ye soru sorma yetkiniz yok.")
        result = await ask_single_cv(req.cv_id, req.question)
    elif req.mode == "selected":
        if not req.cv_ids or len(req.cv_ids) < 1:
            raise HTTPException(400, "Seçili mod için en az bir CV gereklidir.")
        if req.job_id:
            allowed = set(await _applicant_cv_ids_for_company_job(req.job_id, user))
            if not allowed:
                raise HTTPException(404, "İlan veya başvuru bulunamadı.")
        else:
            if not company_has_hr_scope(user):
                raise HTTPException(
                    400,
                    "Departman yetkilisi olarak çoklu CV sorusu için ilan seçmelisiniz.",
                )
            allowed = await _scoped_applicant_cv_ids_company(user)
        for cid in req.cv_ids:
            if cid not in allowed:
                raise HTTPException(400, "Seçilen CV'ler şirketinizin ilan başvuruları arasında olmalıdır.")
        if len(req.cv_ids) == 1:
            result = await ask_single_cv(req.cv_ids[0], req.question)
        else:
            result = await ask_selected_cvs(req.cv_ids, req.question)
    elif req.mode == "job":
        if not req.job_id:
            raise HTTPException(400, "job modunda job_id gereklidir.")
        cv_ids = await _applicant_cv_ids_for_company_job(req.job_id, user)
        if not cv_ids:
            return RAGResponse(answer="Bu ilana henüz başvuru yok.", sources=[])
        if len(cv_ids) == 1:
            result = await ask_single_cv(cv_ids[0], req.question)
        else:
            result = await ask_selected_cvs(cv_ids, req.question)
    elif req.mode == "all":
        raise HTTPException(
            400,
            "Tüm CV modu devre dışı. Lütfen ilan seçerek 'job' modunu kullanın.",
        )
    else:
        raise HTTPException(400, "Geçersiz mod.")

    return RAGResponse(**result)
