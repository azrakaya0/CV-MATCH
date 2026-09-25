import logging
from datetime import datetime
from typing import List, Optional

from database import (
    applications_collection,
    candidate_pipelines_collection,
    companies_collection,
    interviews_collection,
    job_collection,
)
from models import (
    ApplicationStatusHistory,
    ApplicationTrackingResponse,
    InterviewResponse,
)

logger = logging.getLogger(__name__)


async def get_application_tracking(
    application_id: str,
    applicant_username: Optional[str] = None,
) -> Optional[ApplicationTrackingResponse]:
    """Get detailed tracking information for an application"""
    application = await applications_collection.find_one({"_id": application_id})
    if not application:
        return None
    
    # Verify ownership if username is provided
    if applicant_username and application.get("applicant_username") != applicant_username:
        return None
    
    # Get job details
    job = await job_collection.find_one({"_id": application.get("job_id")})
    job_title = job.get("title") if job else "Bilinmeyen İlan"
    
    # Get company details
    company_id = application.get("company_id") or (job.get("company_id") if job else None)
    company_name = None
    if company_id:
        company = await companies_collection.find_one({"_id": company_id})
        company_name = company.get("name") if company else None
    
    # Get pipeline status
    pipeline = await candidate_pipelines_collection.find_one({"application_id": application_id})
    current_stage = pipeline.get("stage") if pipeline else "applied"
    stage_order = pipeline.get("stage_order") if pipeline else 1
    
    # Get status history from pipeline notes and movements
    status_history = []
    if pipeline:
        status_history.append(
            ApplicationStatusHistory(
                stage=current_stage,
                changed_at=pipeline.get("moved_at", application.get("created_at")),
                changed_by=pipeline.get("moved_by"),
                notes=pipeline.get("notes"),
            )
        )
    
    # Get interviews
    interviews = []
    async for interview in interviews_collection.find({"application_id": application_id}).sort(
        "scheduled_date", 1
    ):
        interviews.append(
            InterviewResponse(
                id=interview["_id"],
                application_id=interview.get("application_id"),
                job_id=interview.get("job_id"),
                applicant_username=interview.get("applicant_username"),
                company_id=interview.get("company_id"),
                scheduled_date=interview.get("scheduled_date"),
                scheduled_time=interview.get("scheduled_time"),
                duration_minutes=interview.get("duration_minutes"),
                interview_type=interview.get("interview_type"),
                location=interview.get("location"),
                meeting_link=interview.get("meeting_link"),
                notes=interview.get("notes"),
                status=interview.get("status"),
                created_at=interview.get("created_at"),
                created_by=interview.get("created_by"),
            )
        )
    
    # Check if favorite
    is_favorite = bool(application.get("company_favorite", False))
    
    return ApplicationTrackingResponse(
        id=application["_id"],
        job_id=application.get("job_id"),
        job_title=job_title,
        company_name=company_name,
        company_id=company_id or "",
        cv_id=application.get("cv_id"),
        current_stage=current_stage,
        stage_order=stage_order,
        created_at=application.get("created_at"),
        updated_at=pipeline.get("moved_at") if pipeline else application.get("created_at"),
        status_history=status_history,
        interviews=interviews,
        is_favorite=is_favorite,
    )


async def get_all_applications_tracking(
    applicant_username: str,
) -> List[ApplicationTrackingResponse]:
    """Get tracking information for all applications of a candidate"""
    applications = []
    async for app in applications_collection.find(
        {"applicant_username": applicant_username}
    ).sort("created_at", -1):
        tracking = await get_application_tracking(app["_id"], applicant_username)
        if tracking:
            applications.append(tracking)
    return applications


async def get_application_status_summary(
    applicant_username: str,
) -> dict:
    """Get a summary of application statuses for a candidate"""
    applications = await get_all_applications_tracking(applicant_username)
    
    summary = {
        "total": len(applications),
        "by_stage": {},
        "by_status": {
            "pending": 0,
            "interview_scheduled": 0,
            "offer": 0,
            "rejected": 0,
            "other": 0,
        },
        "upcoming_interviews": 0,
    }
    
    today = datetime.utcnow().strftime("%Y-%m-%d")
    
    for app in applications:
        # Count by stage
        stage = app.current_stage
        summary["by_stage"][stage] = summary["by_stage"].get(stage, 0) + 1
        
        # Count by status category
        if stage in ["applied", "screening"]:
            summary["by_status"]["pending"] += 1
        elif stage in ["technical_interview", "hr_interview"]:
            summary["by_status"]["interview_scheduled"] += 1
        elif stage == "offer":
            summary["by_status"]["offer"] += 1
        elif stage == "rejected":
            summary["by_status"]["rejected"] += 1
        else:
            summary["by_status"]["other"] += 1
        
        # Count upcoming interviews
        for interview in app.interviews:
            if interview.status == "scheduled" and interview.scheduled_date >= today:
                summary["upcoming_interviews"] += 1
    
    return summary
