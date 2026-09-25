import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import applications_collection, interviews_collection
from deps import get_current_user, require_company_scoped, require_employee
from models import InterviewCreate, InterviewResponse, InterviewUpdate, InterviewEmployeeAction, InterviewRescheduleDecision
from services.interview_service import (
    cancel_interview,
    create_interview,
    employee_interview_action,
    generate_calendar_invite,
    get_interview,
    get_interviews_by_application,
    get_interviews_by_candidate,
    get_interviews_by_company,
    get_upcoming_interviews,
    handle_reschedule_decision,
    update_interview,
)

router = APIRouter(prefix="/api/interviews", tags=["Mülakat Planlayıcı"])
logger = logging.getLogger(__name__)


@router.post("/", response_model=InterviewResponse)
async def create_interview_endpoint(
    interview_data: InterviewCreate,
    user: dict = Depends(require_company_scoped),
):
    """Create a new interview for an application"""
    company_id = user.get("effective_company_id") or user.get("company_id")
    
    try:
        interview = await create_interview(interview_data, company_id, user.get("username"))
        return interview
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/my")
async def get_my_interviews(
    status: str | None = None,
    user: dict = Depends(require_employee),
):
    """Get interviews for the current candidate"""
    interviews = await get_interviews_by_candidate(user.get("username"), status)
    return interviews


@router.get("/{interview_id}", response_model=InterviewResponse)
async def get_interview_endpoint(
    interview_id: str,
    user: dict = Depends(get_current_user),
):
    """Get interview details"""
    interview = await get_interview(interview_id)
    if not interview:
        raise HTTPException(404, "Mülakat bulunamadı.")
    
    # Check access
    company_id = user.get("effective_company_id") or user.get("company_id")
    if user.get("role") == "company" and interview.company_id != company_id:
        raise HTTPException(403, "Bu mülakata erişiminiz yok.")
    if user.get("role") == "employee" and interview.applicant_username != user.get("username"):
        raise HTTPException(403, "Bu mülakata erişiminiz yok.")
    
    return interview


@router.patch("/{interview_id}", response_model=InterviewResponse)
async def update_interview_endpoint(
    interview_id: str,
    update_data: InterviewUpdate,
    user: dict = Depends(require_company_scoped),
):
    """Update interview details"""
    interview = await get_interview(interview_id)
    if not interview:
        raise HTTPException(404, "Mülakat bulunamadı.")
    
    company_id = user.get("effective_company_id") or user.get("company_id")
    if interview.company_id != company_id:
        raise HTTPException(403, "Bu mülakatı güncelleme yetkiniz yok.")
    
    try:
        interview = await update_interview(interview_id, update_data)
        return interview
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/{interview_id}/cancel", response_model=InterviewResponse)
async def cancel_interview_endpoint(
    interview_id: str,
    user: dict = Depends(require_company_scoped),
):
    """Cancel an interview"""
    interview = await get_interview(interview_id)
    if not interview:
        raise HTTPException(404, "Mülakat bulunamadı.")

    company_id = user.get("effective_company_id") or user.get("company_id")
    if interview.company_id != company_id:
        raise HTTPException(403, "Bu mülakatı iptal etme yetkiniz yok.")

    interview = await cancel_interview(interview_id)
    return interview


@router.delete("/{interview_id}")
async def delete_interview_endpoint(
    interview_id: str,
    user: dict = Depends(require_company_scoped),
):
    """Delete an interview permanently"""
    interview = await get_interview(interview_id)
    if not interview:
        raise HTTPException(404, "Mülakat bulunamadı.")

    company_id = user.get("effective_company_id") or user.get("company_id")
    if interview.company_id != company_id:
        raise HTTPException(403, "Bu mülakatı silme yetkiniz yok.")

    await interviews_collection.delete_one({"_id": interview_id})
    return {"message": "Mülakat silindi."}


@router.get("/application/{application_id}")
async def get_application_interviews(
    application_id: str,
    user: dict = Depends(get_current_user),
):
    """Get all interviews for an application"""
    application = await applications_collection.find_one({"_id": application_id})
    if not application:
        raise HTTPException(404, "Başvuru bulunamadı.")
    
    # Check access
    company_id = user.get("effective_company_id") or user.get("company_id")
    if user.get("role") == "company" and application.get("company_id") != company_id:
        raise HTTPException(403, "Bu başvuruya erişiminiz yok.")
    if user.get("role") == "employee" and application.get("applicant_username") != user.get("username"):
        raise HTTPException(403, "Bu başvuruya erişiminiz yok.")
    
    interviews = await get_interviews_by_application(application_id)
    return interviews


@router.get("/company/list")
async def get_company_interviews(
    status: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    user: dict = Depends(require_company_scoped),
):
    """Get interviews for the company with optional filters"""
    company_id = user.get("effective_company_id") or user.get("company_id")
    interviews = await get_interviews_by_company(company_id, status, date_from, date_to)
    return interviews


@router.get("/company/upcoming")
async def get_upcoming_interviews_endpoint(user: dict = Depends(require_company_scoped)):
    """Get upcoming scheduled interviews for the company"""
    company_id = user.get("effective_company_id") or user.get("company_id")
    interviews = await get_upcoming_interviews(company_id)
    return interviews


@router.get("/{interview_id}/calendar")
async def get_calendar_invite(
    interview_id: str,
    user: dict = Depends(get_current_user),
):
    """Generate calendar invite data for an interview"""
    interview = await get_interview(interview_id)
    if not interview:
        raise HTTPException(404, "Mülakat bulunamadı.")
    
    # Check access
    company_id = user.get("effective_company_id") or user.get("company_id")
    if user.get("role") == "company" and interview.company_id != company_id:
        raise HTTPException(403, "Bu mülakata erişiminiz yok.")
    if user.get("role") == "employee" and interview.applicant_username != user.get("username"):
        raise HTTPException(403, "Bu mülakata erişiminiz yok.")
    
    calendar_data = await generate_calendar_invite(interview)
    return calendar_data


@router.post("/{interview_id}/employee-action", response_model=InterviewResponse)
async def employee_interview_action_endpoint(
    interview_id: str,
    action_data: InterviewEmployeeAction,
    user: dict = Depends(require_employee),
):
    """Employee action on interview (accept, reject, request reschedule)"""
    try:
        interview = await employee_interview_action(
            interview_id=interview_id,
            action_data=action_data,
            applicant_username=user.get("username"),
        )
        return interview
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/{interview_id}/reschedule-decision", response_model=InterviewResponse)
async def reschedule_decision_endpoint(
    interview_id: str,
    decision_data: InterviewRescheduleDecision,
    user: dict = Depends(require_company_scoped),
):
    """HR decision on reschedule request (approve, reject)"""
    company_id = user.get("effective_company_id") or user.get("company_id")
    try:
        interview = await handle_reschedule_decision(
            interview_id=interview_id,
            decision_data=decision_data,
            company_id=company_id,
        )
        return interview
    except ValueError as e:
        raise HTTPException(400, str(e))
