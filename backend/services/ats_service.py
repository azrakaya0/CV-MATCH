import logging
from datetime import datetime
from typing import List, Optional

from database import (
    applications_collection,
    candidate_pipelines_collection,
    pipeline_stages_collection,
)
from models import CandidatePipeline, PipelineStage

logger = logging.getLogger(__name__)


DEFAULT_PIPELINE_STAGES = [
    {"id": "applied", "name": "Başvurdu", "order": 1, "color": "#6366f1"},
    {"id": "screening", "name": "Ön Değerlendirme", "order": 2, "color": "#8b5cf6"},
    {"id": "technical_interview", "name": "Teknik Mülakat", "order": 3, "color": "#ec4899"},
    {"id": "hr_interview", "name": "İK Mülakatı", "order": 4, "color": "#f59e0b"},
    {"id": "offer", "name": "Teklif Yapıldı", "order": 5, "color": "#10b981"},
    {"id": "rejected", "name": "Reddedildi", "order": 6, "color": "#ef4444"},
]


async def ensure_default_pipeline_stages(company_id: str) -> List[PipelineStage]:
    """Ensure default pipeline stages exist for a company"""
    existing = []
    async for stage in pipeline_stages_collection.find({"company_id": company_id}).sort("order", 1):
        existing.append(PipelineStage(**stage))
    
    if existing:
        return existing
    
    # Create default stages
    now = datetime.utcnow().isoformat()
    for stage_data in DEFAULT_PIPELINE_STAGES:
        await pipeline_stages_collection.insert_one(
            {
                "_id": f"{company_id}_{stage_data['id']}",
                "company_id": company_id,
                **stage_data,
                "created_at": now,
            }
        )
    
    # Return the created stages
    stages = []
    async for stage in pipeline_stages_collection.find({"company_id": company_id}).sort("order", 1):
        stages.append(PipelineStage(**stage))
    
    return stages


async def get_pipeline_stages(company_id: str) -> List[PipelineStage]:
    """Get all pipeline stages for a company"""
    stages = []
    async for stage in pipeline_stages_collection.find({"company_id": company_id}).sort("order", 1):
        stages.append(PipelineStage(**stage))
    return stages


async def get_candidate_pipeline(application_id: str) -> Optional[CandidatePipeline]:
    """Get current pipeline stage for an application"""
    pipeline = await candidate_pipelines_collection.find_one({"application_id": application_id})
    if pipeline:
        return CandidatePipeline(**pipeline)
    return None


async def initialize_candidate_pipeline(
    application_id: str,
    company_id: str,
    username: Optional[str] = None,
) -> CandidatePipeline:
    """Initialize a candidate's pipeline to the first stage"""
    stages = await get_pipeline_stages(company_id)
    if not stages:
        stages = await ensure_default_pipeline_stages(company_id)
    
    first_stage = stages[0] if stages else DEFAULT_PIPELINE_STAGES[0]
    
    now = datetime.utcnow().isoformat()
    pipeline = CandidatePipeline(
        application_id=application_id,
        stage=first_stage.id,
        stage_order=first_stage.order,
        moved_at=now,
        moved_by=username,
        notes=None,
    )
    
    await candidate_pipelines_collection.insert_one(pipeline.model_dump())
    return pipeline


async def update_candidate_stage(
    application_id: str,
    new_stage: str,
    username: Optional[str] = None,
    notes: Optional[str] = None,
) -> CandidatePipeline:
    """Update a candidate's pipeline stage"""
    # Get the stage order
    stages = await get_pipeline_stages_by_ids([new_stage])
    stage_order = stages[0].order if stages else 0
    
    now = datetime.utcnow().isoformat()
    
    await candidate_pipelines_collection.update_one(
        {"application_id": application_id},
        {
            "$set": {
                "stage": new_stage,
                "stage_order": stage_order,
                "moved_at": now,
                "moved_by": username,
                "notes": notes,
            }
        },
        upsert=True,
    )
    
    pipeline = await candidate_pipelines_collection.find_one({"application_id": application_id})
    return CandidatePipeline(**pipeline)


async def get_pipeline_stages_by_ids(stage_ids: List[str]) -> List[PipelineStage]:
    """Get pipeline stages by their IDs"""
    stages = []
    async for stage in pipeline_stages_collection.find({"_id": {"$in": stage_ids}}):
        stages.append(PipelineStage(**stage))
    return stages


async def get_candidates_by_stage(
    company_id: str,
    stage_id: str,
) -> List[dict]:
    """Get all candidates in a specific pipeline stage"""
    candidates = []
    async for pipeline in candidate_pipelines_collection.find(
        {"company_id": company_id, "stage": stage_id}
    ):
        application = await applications_collection.find_one({"_id": pipeline["application_id"]})
        if application:
            candidates.append(
                {
                    "application_id": application["_id"],
                    "job_id": application.get("job_id"),
                    "applicant_username": application.get("applicant_username"),
                    "cv_id": application.get("cv_id"),
                    "stage": pipeline.get("stage"),
                    "stage_order": pipeline.get("stage_order"),
                    "moved_at": pipeline.get("moved_at"),
                    "moved_by": pipeline.get("moved_by"),
                    "notes": pipeline.get("notes"),
                    "created_at": application.get("created_at"),
                }
            )
    return candidates


async def get_all_candidates_pipeline(company_id: str) -> dict:
    """Get all candidates grouped by pipeline stage"""
    stages = await get_pipeline_stages(company_id)
    if not stages:
        stages = await ensure_default_pipeline_stages(company_id)
    
    result = {}
    for stage in stages:
        candidates = await get_candidates_by_stage(company_id, stage.id)
        result[stage.id] = {
            "stage": stage.model_dump(),
            "candidates": candidates,
        }
    
    return result
