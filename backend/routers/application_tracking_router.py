import logging
from fastapi import APIRouter, Depends, HTTPException

from database import applications_collection
from deps import get_current_user, require_employee
from models import ApplicationTrackingResponse
from services.application_tracking_service import (
    get_all_applications_tracking,
    get_application_status_summary,
    get_application_tracking,
)

router = APIRouter(prefix="/api/tracking", tags=["Başvuru Takip"])
logger = logging.getLogger(__name__)


@router.get("/my/applications")
async def get_my_applications_tracking(user: dict = Depends(require_employee)):
    """Get tracking information for all applications of the current candidate"""
    applications = await get_all_applications_tracking(user.get("username"))
    return applications


@router.get("/my/summary")
async def get_my_status_summary(user: dict = Depends(require_employee)):
    """Get a summary of application statuses for the current candidate"""
    summary = await get_application_status_summary(user.get("username"))
    return summary


@router.get("/application/{application_id}")
async def get_application_tracking_endpoint(
    application_id: str,
    user: dict = Depends(require_employee),
):
    """Get detailed tracking information for a specific application"""
    application = await applications_collection.find_one({"_id": application_id})
    if not application:
        raise HTTPException(404, "Başvuru bulunamadı.")
    
    if application.get("applicant_username") != user.get("username"):
        raise HTTPException(403, "Bu başvuruya erişiminiz yok.")
    
    tracking = await get_application_tracking(application_id, user.get("username"))
    if not tracking:
        raise HTTPException(404, "Takip bilgisi bulunamadı.")
    
    return tracking
