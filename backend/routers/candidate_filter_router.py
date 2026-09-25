import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import applications_collection
from deps import get_current_user, require_company_scoped
from models import CandidateFilterRequest, CandidateFilterResponse
from services.candidate_filter_service import filter_candidates

router = APIRouter(prefix="/api/candidates", tags=["Aday Filtreleme"])
logger = logging.getLogger(__name__)


class FilterStats(BaseModel):
    total_candidates: int
    filtered_count: int
    avg_match_score: float | None = None


@router.post("/filter", response_model=list[CandidateFilterResponse])
async def filter_candidates_endpoint(
    filter_request: CandidateFilterRequest,
    user: dict = Depends(require_company_scoped),
):
    """Filter candidates based on skills, location, experience, and education"""
    company_id = user.get("effective_company_id") or user.get("company_id")
    
    # If job_id is provided, verify the job belongs to the company
    if filter_request.job_id:
        from database import job_collection
        from services.company_scope import job_visible_to_company_user
        
        job = await job_collection.find_one({"_id": filter_request.job_id})
        if not job:
            raise HTTPException(404, "İş ilanı bulunamadı.")
        if job.get("company_id") != company_id:
            raise HTTPException(403, "Bu ilana erişiminiz yok.")
        if not job_visible_to_company_user(job, user):
            raise HTTPException(403, "Bu ilana erişiminiz yok.")
    
    results = await filter_candidates(filter_request, company_id)
    return results


@router.get("/skills")
async def get_available_skills(user: dict = Depends(get_current_user)):
    """Get list of all available skills in the system"""
    from database import cv_collection
    
    skills = set()
    async for cv in cv_collection.find({}, {"data.skills": 1}):
        cv_skills = cv.get("data", {}).get("skills", [])
        for skill in cv_skills:
            if skill:
                skills.add(skill)
    
    return {"skills": sorted(list(skills))}


@router.get("/locations")
async def get_available_locations(user: dict = Depends(get_current_user)):
    """Get list of all available cities in the system"""
    from database import cv_collection
    
    cities = set()
    async for cv in cv_collection.find({}, {"data.city": 1}):
        city = cv.get("data", {}).get("city")
        if city:
            cities.add(city)
    
    return {"cities": sorted(list(cities))}


@router.get("/languages")
async def get_available_languages(user: dict = Depends(get_current_user)):
    """Get list of all available languages in the system"""
    from database import cv_collection
    
    languages = set()
    async for cv in cv_collection.find({}, {"data.languages": 1}):
        cv_languages = cv.get("data", {}).get("languages", [])
        for lang in cv_languages:
            if lang:
                languages.add(lang)
    
    return {"languages": sorted(list(languages))}
