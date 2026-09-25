import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import applications_collection, candidate_pipelines_collection
from deps import get_current_user, require_company_scoped
from models import PipelineStage, PipelineUpdate
from services.ats_service import (
    ensure_default_pipeline_stages,
    get_all_candidates_pipeline,
    get_candidate_pipeline,
    get_pipeline_stages,
    initialize_candidate_pipeline,
    update_candidate_stage,
)

router = APIRouter(prefix="/api/ats", tags=["ATS / Kanban Board"])
logger = logging.getLogger(__name__)


class StageCreate(BaseModel):
    name: str
    order: int
    color: str


class PipelineWithCandidates(BaseModel):
    stage: PipelineStage
    candidates: list


@router.get("/stages")
async def get_stages(user: dict = Depends(require_company_scoped)):
    """Get all pipeline stages for the company"""
    company_id = user.get("effective_company_id") or user.get("company_id")
    stages = await get_pipeline_stages(company_id)
    if not stages:
        stages = await ensure_default_pipeline_stages(company_id)
    return stages


@router.post("/stages")
async def create_stage(stage: StageCreate, user: dict = Depends(require_company_scoped)):
    """Create a new pipeline stage"""
    company_id = user.get("effective_company_id") or user.get("company_id")
    stage_id = f"{company_id}_{stage.name.lower().replace(' ', '_')}"
    
    from database import pipeline_stages_collection
    
    existing = await pipeline_stages_collection.find_one({"_id": stage_id})
    if existing:
        raise HTTPException(400, "Bu aşama zaten mevcut.")
    
    now = datetime.utcnow().isoformat()
    await pipeline_stages_collection.insert_one(
        {
            "_id": stage_id,
            "company_id": company_id,
            "name": stage.name,
            "order": stage.order,
            "color": stage.color,
            "created_at": now,
        }
    )
    
    return {"id": stage_id, "message": "Aşama oluşturuldu."}


@router.get("/pipeline")
async def get_pipeline(user: dict = Depends(require_company_scoped)):
    """Get all candidates grouped by pipeline stage (Kanban board view)"""
    company_id = user.get("effective_company_id") or user.get("company_id")
    pipeline = await get_all_candidates_pipeline(company_id)
    return pipeline


@router.get("/application/{application_id}")
async def get_application_pipeline(
    application_id: str,
    user: dict = Depends(require_company_scoped),
):
    """Get pipeline status for a specific application"""
    application = await applications_collection.find_one({"_id": application_id})
    if not application:
        raise HTTPException(404, "Başvuru bulunamadı.")
    
    company_id = user.get("effective_company_id") or user.get("company_id")
    if application.get("company_id") != company_id:
        raise HTTPException(403, "Bu başvuruya erişiminiz yok.")
    
    pipeline = await get_candidate_pipeline(application_id)
    if not pipeline:
        # Initialize pipeline if not exists
        pipeline = await initialize_candidate_pipeline(
            application_id, company_id, user.get("username")
        )
    
    return pipeline


@router.post("/application/{application_id}/initialize")
async def initialize_pipeline(
    application_id: str,
    user: dict = Depends(require_company_scoped),
):
    """Initialize pipeline for an application"""
    application = await applications_collection.find_one({"_id": application_id})
    if not application:
        raise HTTPException(404, "Başvuru bulunamadı.")
    
    company_id = user.get("effective_company_id") or user.get("company_id")
    if application.get("company_id") != company_id:
        raise HTTPException(403, "Bu başvuruya erişiminiz yok.")
    
    existing = await get_candidate_pipeline(application_id)
    if existing:
        raise HTTPException(400, "Bu başvuru zaten pipeline'da.")
    
    pipeline = await initialize_candidate_pipeline(
        application_id, company_id, user.get("username")
    )
    return pipeline


@router.patch("/application/{application_id}/stage")
async def update_stage(
    application_id: str,
    update: PipelineUpdate,
    user: dict = Depends(require_company_scoped),
):
    """Update the stage of an application in the pipeline"""
    application = await applications_collection.find_one({"_id": application_id})
    if not application:
        raise HTTPException(404, "Başvuru bulunamadı.")
    
    company_id = user.get("effective_company_id") or user.get("company_id")
    if application.get("company_id") != company_id:
        raise HTTPException(403, "Bu başvuruya erişiminiz yok.")
    
    # Validate stage exists
    stages = await get_pipeline_stages(company_id)
    stage_ids = [s.id for s in stages]
    if update.stage not in stage_ids:
        raise HTTPException(400, "Geçersiz aşama.")
    
    pipeline = await update_candidate_stage(
        application_id, update.stage, user.get("username"), update.notes
    )
    
    return pipeline


@router.delete("/application/{application_id}")
async def remove_from_pipeline(
    application_id: str,
    user: dict = Depends(require_company_scoped),
):
    """Remove an application from the pipeline"""
    application = await applications_collection.find_one({"_id": application_id})
    if not application:
        raise HTTPException(404, "Başvuru bulunamadı.")
    
    company_id = user.get("effective_company_id") or user.get("company_id")
    if application.get("company_id") != company_id:
        raise HTTPException(403, "Bu başvuruya erişiminiz yok.")
    
    await candidate_pipelines_collection.delete_one({"application_id": application_id})
    return {"message": "Başvuru pipeline'dan kaldırıldı."}


@router.get("/job/{job_id}/pipeline")
async def get_job_pipeline(
    job_id: str,
    user: dict = Depends(require_company_scoped),
):
    """Get pipeline view for a specific job"""
    from database import job_collection
    from services.company_scope import job_visible_to_company_user
    
    job = await job_collection.find_one({"_id": job_id})
    if not job:
        raise HTTPException(404, "İlan bulunamadı.")
    
    company_id = user.get("effective_company_id") or user.get("company_id")
    if job.get("company_id") != company_id:
        raise HTTPException(403, "Bu ilana erişiminiz yok.")
    
    if not job_visible_to_company_user(job, user):
        raise HTTPException(403, "Bu ilana erişiminiz yok.")
    
    # Get all applications for this job
    application_ids = []
    async for app in applications_collection.find({"job_id": job_id}):
        application_ids.append(app["_id"])
    
    # Get pipeline data for these applications
    stages = await get_pipeline_stages(company_id)
    if not stages:
        stages = await ensure_default_pipeline_stages(company_id)
    
    result = {}
    for stage in stages:
        candidates = []
        async for pipeline in candidate_pipelines_collection.find(
            {"application_id": {"$in": application_ids}, "stage": stage.id}
        ):
            application = await applications_collection.find_one({"_id": pipeline["application_id"]})
            if application:
                from database import cv_collection
                cv = await cv_collection.find_one({"_id": application.get("cv_id")})
                candidates.append(
                    {
                        "application_id": application["_id"],
                        "job_id": application.get("job_id"),
                        "applicant_username": application.get("applicant_username"),
                        "cv_id": application.get("cv_id"),
                        "cv_display_id": cv.get("display_id") if cv else None,
                        "stage": pipeline.get("stage"),
                        "stage_order": pipeline.get("stage_order"),
                        "moved_at": pipeline.get("moved_at"),
                        "moved_by": pipeline.get("moved_by"),
                        "notes": pipeline.get("notes"),
                        "created_at": application.get("created_at"),
                    }
                )
        result[stage.id] = {
            "stage": stage.model_dump(),
            "candidates": candidates,
        }
    
    return result
