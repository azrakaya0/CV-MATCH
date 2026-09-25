import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from database import applications_collection, companies_collection, job_collection, users_collection
from deps import get_user_for_job_detail, get_user_for_job_list, require_company_scoped, require_employee
from services.company_scope import company_has_hr_scope, job_visible_to_company_user, normalize_dept
from models import CompanyProfile, JobCreate, JobResponse, JobRequirements
from services.company_profile import company_profile_map, profile_from_company_doc
from services.job_analyzer import analyze_job

router = APIRouter(prefix="/api/job", tags=["İş İlanı"])


class JobStatusBody(BaseModel):
    status: str = Field(..., pattern="^(open|closed)$")


class JobAnalyticsResponse(BaseModel):
    job_id: str
    views: int
    unique_views: int
    applications: int
    avg_match_score: float | None
    conversion_rate: float
    last_viewed_at: str | None
    daily_stats: list[dict]


@router.patch("/{job_id}/status", response_model=JobResponse)
async def set_job_status(job_id: str, body: JobStatusBody, user: dict = Depends(require_company_scoped)):
    doc = await job_collection.find_one({"_id": job_id})
    if not doc or doc.get("company_id") != user["effective_company_id"]:
        raise HTTPException(404, "İş ilanı bulunamadı.")
    if not job_visible_to_company_user(doc, user):
        raise HTTPException(403, "Bu ilanın durumunu değiştiremezsiniz.")

    await job_collection.update_one({"_id": job_id}, {"$set": {"status": body.status}})
    updated = await job_collection.find_one({"_id": job_id})
    return _doc_to_job_response(updated)


@router.post("/create", response_model=JobResponse)
async def create_job(job: JobCreate, user: dict = Depends(require_company_scoped)):
    if not company_has_hr_scope(user):
        raise HTTPException(
            status_code=403,
            detail="İlan oluşturma yalnızca İK (tam şirket) hesabı içindir. Departman hesapları mevcut ilanları yönetir.",
        )
    auto = analyze_job(job.description)

    requirements = JobRequirements(
        required_skills=job.required_skills if job.required_skills else auto.required_skills,
        preferred_skills=job.preferred_skills if job.preferred_skills else auto.preferred_skills,
        min_education=job.min_education if job.min_education else auto.min_education,
        experience_years=job.experience_years if job.experience_years is not None else auto.experience_years,
        languages=job.languages if job.languages else auto.languages,
    )

    dept_val = (job.department or "").strip() or None

    company_label = (job.company or "").strip() or None
    if not company_label:
        cdoc = await companies_collection.find_one({"_id": user["effective_company_id"]})
        if cdoc:
            company_label = (cdoc.get("name") or "").strip() or None

    job_id = str(uuid.uuid4())
    doc = {
        "_id": job_id,
        "title": job.title,
        "company": company_label,
        "description": job.description,
        "experience_type": job.experience_type,
        "requirements": requirements.model_dump(),
        "created_at": datetime.utcnow().isoformat(),
        "company_id": user["effective_company_id"],
        "created_by_username": user["username"],
        "status": "open",
        "department": dept_val,
        "location": (job.location or "").strip() or None,
        "workplace_type": job.workplace_type,
        "analytics": {
            "views": 0,
            "unique_views": 0,
            "applications": 0,
            "avg_match_score": None,
            "last_viewed_at": None,
            "daily_stats": []
        },
        "expires_at": (datetime.utcnow() + timedelta(days=30)).isoformat(),
        "auto_renew": False,
    }
    await job_collection.insert_one(doc)

    return JobResponse(
        id=job_id,
        title=job.title,
        company=job.company,
        description=job.description,
        requirements=requirements,
        created_at=doc["created_at"],
        company_id=user["effective_company_id"],
        status="open",
        department=doc.get("department"),
        location=doc.get("location"),
        workplace_type=doc.get("workplace_type"),
    )


@router.get("/browse", response_model=list[JobResponse])
async def browse_jobs_open(user: dict = Depends(require_employee)):
    udoc = await users_collection.find_one({"username": user["username"]})
    favs = set(udoc.get("favorite_job_ids") or []) if udoc else set()
    jobs = []
    query = {"status": {"$ne": "closed"}}
    docs = [doc async for doc in job_collection.find(query).sort("created_at", -1)]
    cids = {str(d.get("company_id")) for d in docs if d.get("company_id")}
    cnames = await _company_name_map(cids)
    cprofiles = await company_profile_map(companies_collection, cids)
    jobs = []
    for doc in docs:
        cid = str(doc.get("company_id") or "")
        jobs.append(
            _doc_to_job_response(
                doc,
                favorited=doc["_id"] in favs,
                company_legal_name=cnames.get(cid) if cid else None,
                company_profile=cprofiles.get(cid) if cid else None,
            )
        )
    return jobs


@router.post("/favorite/{job_id}")
async def toggle_job_favorite(job_id: str, user: dict = Depends(require_employee)):
    job = await job_collection.find_one({"_id": job_id})
    if not job or job.get("status") == "closed":
        raise HTTPException(404, "İlan bulunamadı veya kapalı.")
    udoc = await users_collection.find_one({"username": user["username"]})
    favs = list(udoc.get("favorite_job_ids") or []) if udoc else []
    if job_id in favs:
        favs = [x for x in favs if x != job_id]
        favorited = False
    else:
        favs.append(job_id)
        favorited = True
    await users_collection.update_one(
        {"username": user["username"]},
        {"$set": {"favorite_job_ids": favs}},
    )
    return {"job_id": job_id, "favorited": favorited}


@router.get("/list", response_model=list[JobResponse])
async def list_jobs(
    user: dict = Depends(get_user_for_job_list),
    company_id: str | None = Query(None, description="Yalnızca admin: şirket kimliği ile filtre"),
    department: str | None = Query(None, description="İK / admin: ilan departmanı (Türkçe büyük/küçük duyarsız)"),
    limit: int = Query(500, ge=1, le=500),
    skip: int = Query(0, ge=0),
):
    if user["role"] == "company":
        query = {"company_id": user["effective_company_id"]}
    elif user["role"] == "admin":
        query = {}
        if company_id and str(company_id).strip():
            query = {"company_id": str(company_id).strip()}
    else:
        raise HTTPException(403, "İlan listesi yalnızca şirket veya admin içindir.")
    dept_filter_norm = normalize_dept(department) if department and str(department).strip() else None
    docs: list[dict] = []
    async for doc in job_collection.find(query).sort("created_at", -1):
        if user["role"] == "company" and not job_visible_to_company_user(doc, user):
            continue
        if dept_filter_norm and normalize_dept(doc.get("department")) != dept_filter_norm:
            continue
        docs.append(doc)

    counts: dict[str, int] = {}
    if docs and user["role"] in ("company", "admin"):
        jids = [d["_id"] for d in docs]
        async for row in applications_collection.aggregate(
            [
                {"$match": {"job_id": {"$in": jids}}},
                {"$group": {"_id": "$job_id", "c": {"$sum": 1}}},
            ]
        ):
            counts[str(row["_id"])] = int(row["c"])

    cids = {str(d.get("company_id")) for d in docs if d.get("company_id")}
    cnames = await _company_name_map(cids)
    cprofiles = await company_profile_map(companies_collection, cids)
    jobs = []
    for doc in docs[skip : skip + limit]:
        ac = counts.get(str(doc["_id"]), 0) if user["role"] in ("company", "admin") else None
        cid = str(doc.get("company_id") or "")
        jobs.append(
            _doc_to_job_response(
                doc,
                application_count=ac,
                company_legal_name=cnames.get(cid) if cid else None,
                company_profile=cprofiles.get(cid) if cid else None,
            )
        )
    return jobs


async def _company_name_map(company_ids: set[str]) -> dict[str, str]:
    if not company_ids:
        return {}
    out: dict[str, str] = {}
    async for c in companies_collection.find({"_id": {"$in": list(company_ids)}}):
        out[str(c["_id"])] = c.get("name") or ""
    return out


def _doc_to_job_response(
    doc: dict,
    favorited: bool | None = None,
    application_count: int | None = None,
    company_legal_name: str | None = None,
    company_profile: dict | None = None,
) -> JobResponse:
    cp = CompanyProfile(**company_profile) if company_profile else None
    return JobResponse(
        id=doc["_id"],
        title=doc["title"],
        company=doc.get("company"),
        description=doc["description"],
        requirements=JobRequirements(**doc["requirements"]),
        created_at=doc["created_at"],
        company_id=doc.get("company_id"),
        status=doc.get("status", "open"),
        favorited=favorited,
        department=doc.get("department"),
        location=doc.get("location"),
        workplace_type=doc.get("workplace_type"),
        application_count=application_count,
        company_legal_name=company_legal_name,
        company_profile=cp,
    )


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, user: dict = Depends(get_user_for_job_detail)):
    doc = await job_collection.find_one({"_id": job_id})
    if not doc:
        raise HTTPException(404, "İş ilanı bulunamadı.")
    if user["role"] == "company":
        if doc.get("company_id") != user.get("effective_company_id"):
            raise HTTPException(403, "Bu ilana erişemezsiniz.")
        if not job_visible_to_company_user(doc, user):
            raise HTTPException(403, "Bu ilana erişemezsiniz.")
    elif user["role"] == "employee":
        if doc.get("status") == "closed":
            raise HTTPException(404, "İlan kapalı.")
        # View tracking for employees
        await job_collection.update_one(
            {"_id": job_id},
            {
                "$inc": {"analytics.views": 1},
                "$set": {"analytics.last_viewed_at": datetime.utcnow().isoformat()}
            }
        )
    elif user["role"] == "admin":
        pass
    else:
        raise HTTPException(403, "Yetkisiz.")
    cname = None
    cprof = None
    if doc.get("company_id"):
        c = await companies_collection.find_one({"_id": doc["company_id"]})
        if c:
            cname = c.get("name")
            cprof = profile_from_company_doc(c)
            if cname and cprof is not None and not cprof.get("name"):
                cprof = {**(cprof or {}), "name": cname}
    return _doc_to_job_response(doc, company_legal_name=cname, company_profile=cprof)


@router.put("/{job_id}", response_model=JobResponse)
async def update_job(job_id: str, job: JobCreate, user: dict = Depends(require_company_scoped)):
    if not company_has_hr_scope(user):
        raise HTTPException(403, "İlan düzenleme yalnızca İK (tam şirket) hesabı içindir. Departman hesapları mevcut ilanları görüntüler.")
    doc = await job_collection.find_one({"_id": job_id})
    if not doc or doc.get("company_id") != user["effective_company_id"]:
        raise HTTPException(404, "İş ilanı bulunamadı.")
    if not job_visible_to_company_user(doc, user):
        raise HTTPException(403, "Bu ilanı düzenleyemezsiniz.")

    auto = analyze_job(job.description)

    requirements = JobRequirements(
        required_skills=job.required_skills if job.required_skills else auto.required_skills,
        preferred_skills=job.preferred_skills if job.preferred_skills else auto.preferred_skills,
        min_education=job.min_education if job.min_education else auto.min_education,
        experience_years=job.experience_years if job.experience_years is not None else auto.experience_years,
        languages=job.languages if job.languages else auto.languages,
    )

    dept_val = (job.department or "").strip() or None
    if not company_has_hr_scope(user):
        ud = (user.get("department") or "").strip()
        if not ud:
            raise HTTPException(400, "Hesabınızda departman tanımlı değil.")
        dept_val = ud

    await job_collection.update_one(
        {"_id": job_id},
        {
            "$set": {
                "title": job.title,
                "company": job.company,
                "description": job.description,
                "experience_type": job.experience_type,
                "requirements": requirements.model_dump(),
                "department": dept_val,
                "location": (job.location or "").strip() or None,
                "workplace_type": job.workplace_type,
            }
        },
    )

    updated = await job_collection.find_one({"_id": job_id})
    return _doc_to_job_response(updated)


@router.delete("/{job_id}")
async def delete_job(job_id: str, user: dict = Depends(require_company_scoped)):
    if not company_has_hr_scope(user):
        raise HTTPException(403, "İlan silme yalnızca İK (tam şirket) hesabı içindir. Departman hesapları mevcut ilanları görüntüler.")
    doc = await job_collection.find_one({"_id": job_id})
    if not doc or doc.get("company_id") != user["effective_company_id"]:
        raise HTTPException(404, "İş ilanı bulunamadı.")
    if not job_visible_to_company_user(doc, user):
        raise HTTPException(403, "Bu ilanı silemezsiniz.")

    await job_collection.delete_one({"_id": job_id})
    return {"message": "İş ilanı silindi."}


@router.get("/{job_id}/analytics", response_model=JobAnalyticsResponse)
async def get_job_analytics(job_id: str, days: int = Query(30, ge=1, le=365), user: dict = Depends(require_company_scoped)):
    doc = await job_collection.find_one({"_id": job_id})
    if not doc or doc.get("company_id") != user["effective_company_id"]:
        raise HTTPException(404, "İş ilanı bulunamadı.")
    if not job_visible_to_company_user(doc, user):
        raise HTTPException(403, "Bu ilana erişemezsiniz.")

    analytics = doc.get("analytics", {})
    
    # Get application count
    applications = await applications_collection.find({"job_id": job_id}).to_list(None)
    app_count = len(applications)
    
    # Calculate average match score
    avg_score = None
    if applications:
        from database import match_collection
        scores = []
        for app in applications:
            match = await match_collection.find_one({"cv_id": app["cv_id"], "job_id": job_id})
            if match and match.get("score") is not None:
                scores.append(match["score"])
        if scores:
            avg_score = sum(scores) / len(scores)
    
    # Calculate conversion rate
    views = analytics.get("views", 0)
    conversion_rate = (app_count / views * 100) if views > 0 else 0
    
    # Get daily stats for the requested period
    start_date = datetime.utcnow() - timedelta(days=days)
    daily_stats = analytics.get("daily_stats", [])
    daily_stats_filtered = [s for s in daily_stats if datetime.fromisoformat(s["date"]) >= start_date]
    
    return JobAnalyticsResponse(
        job_id=job_id,
        views=analytics.get("views", 0),
        unique_views=analytics.get("unique_views", 0),
        applications=app_count,
        avg_match_score=round(avg_score, 2) if avg_score else None,
        conversion_rate=round(conversion_rate, 2),
        last_viewed_at=analytics.get("last_viewed_at"),
        daily_stats=daily_stats_filtered
    )


class ApplicantInsightsResponse(BaseModel):
    total_applicants: int
    average_experience_years: float | None
    most_common_skills: list[str]
    applicant_percentile: float | None
    message: str


@router.get("/{job_id}/applicant-insights", response_model=ApplicantInsightsResponse)
async def get_applicant_insights(job_id: str, cv_id: str | None = None, user: dict = Depends(require_employee)):
    """Show competition analysis for candidates applying to a job."""
    job = await job_collection.find_one({"_id": job_id})
    if not job or job.get("status") == "closed":
        raise HTTPException(404, "İş ilanı bulunamadı veya kapalı.")
    
    # Get all applications for this job
    applications = await applications_collection.find({"job_id": job_id}).to_list(None)
    total_applicants = len(applications)
    
    if total_applicants == 0:
        return ApplicantInsightsResponse(
            total_applicants=0,
            average_experience_years=None,
            most_common_skills=[],
            applicant_percentile=None,
            message="Bu ilana henüz başvuru yok. İlk başvuran siz olabilirsiniz!"
        )
    
    # Get CV data for all applicants
    from database import cv_collection
    cv_ids = [app["cv_id"] for app in applications]
    cvs = await cv_collection.find({"_id": {"$in": cv_ids}}).to_list(None)
    
    # Calculate average experience years
    from services.cv_summary_service import _estimate_professional_years
    experience_years = []
    for cv in cvs:
        data = cv.get("data", {})
        raw_text = data.get("raw_text", "")
        exp = data.get("experience", [])
        years = _estimate_professional_years(exp, raw_text)
        if years is not None:
            experience_years.append(years)
    
    average_experience = sum(experience_years) / len(experience_years) if experience_years else None
    
    # Find most common skills
    from collections import Counter
    all_skills = []
    for cv in cvs:
        skills = cv.get("data", {}).get("skills", [])
        all_skills.extend([s.lower() for s in skills if s])
    
    skill_counts = Counter(all_skills)
    most_common_skills = [skill for skill, count in skill_counts.most_common(5)]
    
    # Calculate applicant percentile if cv_id is provided
    applicant_percentile = None
    if cv_id:
        applicant_cv = await cv_collection.find_one({"_id": cv_id})
        if applicant_cv:
            data = applicant_cv.get("data", {})
            raw_text = data.get("raw_text", "")
            exp = data.get("experience", [])
            applicant_years = _estimate_professional_years(exp, raw_text)
            
            if applicant_years is not None and experience_years:
                # Count how many applicants have less experience
                lower_count = sum(1 for y in experience_years if y < applicant_years)
                percentile = (lower_count / len(experience_years)) * 100
                applicant_percentile = round(percentile, 1)
    
    # Generate message
    message_parts = []
    message_parts.append(f"Bu ilana şu ana kadar {total_applicants} kişi başvurdu.")
    if average_experience is not None:
        message_parts.append(f"Başvuranların ortalama deneyim süresi {round(average_experience, 1)} yıl.")
    if most_common_skills:
        message_parts.append(f"En çok bilinen yetenek: {most_common_skills[0]}.")
    if applicant_percentile is not None:
        message_parts.append(f"Sen bu havuzda ilk %{applicant_percentile} dilimdesin.")
    
    message = " ".join(message_parts)
    
    return ApplicantInsightsResponse(
        total_applicants=total_applicants,
        average_experience_years=round(average_experience, 1) if average_experience else None,
        most_common_skills=most_common_skills,
        applicant_percentile=applicant_percentile,
        message=message
    )
