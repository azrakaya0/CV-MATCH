import logging
import uuid
from datetime import datetime
from typing import List, Optional

from database import (
    applications_collection,
    interviews_collection,
    job_collection,
    users_collection,
)
from models import InterviewCreate, InterviewResponse, InterviewUpdate, InterviewEmployeeAction, InterviewRescheduleDecision
from services.notification_service import notify_interview_scheduled, notify_interview_employee_response, notify_interview_reschedule_decision

logger = logging.getLogger(__name__)


async def create_interview(
    interview_data: InterviewCreate,
    company_id: str,
    created_by: str,
) -> InterviewResponse:
    """Create a new interview"""
    # Verify application exists and belongs to company
    application = await applications_collection.find_one({"_id": interview_data.application_id})
    if not application:
        raise ValueError("Başvuru bulunamadı.")
    
    if application.get("company_id") != company_id:
        raise ValueError("Bu başvuru bu şirkete ait değil.")
    
    job = await job_collection.find_one({"_id": application.get("job_id")})
    if not job:
        raise ValueError("İş ilanı bulunamadı.")
    
    interview_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    
    interview_doc = {
        "_id": interview_id,
        "application_id": interview_data.application_id,
        "job_id": application.get("job_id"),
        "applicant_username": application.get("applicant_username"),
        "company_id": company_id,
        "scheduled_date": interview_data.scheduled_date,
        "scheduled_time": interview_data.scheduled_time,
        "duration_minutes": interview_data.duration_minutes,
        "interview_type": interview_data.interview_type,
        "location": interview_data.location,
        "meeting_link": interview_data.meeting_link,
        "notes": interview_data.notes,
        "status": "scheduled",
        "created_at": now,
        "created_by": created_by,
    }
    
    await interviews_collection.insert_one(interview_doc)

    # Send notification to applicant
    await notify_interview_scheduled(
        applicant_username=application.get("applicant_username"),
        job_title=job.get("title"),
        interview_date=interview_data.scheduled_date,
        interview_type=interview_data.interview_type,
    )

    # Map _id to id for response
    response_doc = {**interview_doc, "id": interview_doc["_id"]}
    return InterviewResponse(**response_doc)


async def get_interview(interview_id: str) -> Optional[InterviewResponse]:
    """Get interview by ID"""
    interview = await interviews_collection.find_one({"_id": interview_id})
    if interview:
        response_doc = {**interview, "id": interview["_id"]}
        return InterviewResponse(**response_doc)
    return None


async def update_interview(
    interview_id: str,
    update_data: InterviewUpdate,
) -> InterviewResponse:
    """Update interview details"""
    update_dict = update_data.model_dump(exclude_unset=True)

    if not update_dict:
        raise ValueError("Güncellenecek veri yok.")

    await interviews_collection.update_one(
        {"_id": interview_id},
        {"$set": update_dict},
    )

    interview = await interviews_collection.find_one({"_id": interview_id})
    response_doc = {**interview, "id": interview["_id"]}
    return InterviewResponse(**response_doc)


async def cancel_interview(interview_id: str) -> InterviewResponse:
    """Cancel an interview"""
    await interviews_collection.update_one(
        {"_id": interview_id},
        {"$set": {"status": "cancelled"}},
    )

    interview = await interviews_collection.find_one({"_id": interview_id})
    response_doc = {**interview, "id": interview["_id"]}
    return InterviewResponse(**response_doc)


async def get_interviews_by_application(application_id: str) -> List[InterviewResponse]:
    """Get all interviews for an application"""
    interviews = []
    async for interview in interviews_collection.find({"application_id": application_id}).sort(
        "scheduled_date", 1
    ):
        response_doc = {**interview, "id": interview["_id"]}
        interviews.append(InterviewResponse(**response_doc))
    return interviews


async def get_interviews_by_company(
    company_id: str,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> List[InterviewResponse]:
    """Get interviews for a company with optional filters"""
    query = {"company_id": company_id}

    if status:
        query["status"] = status

    if date_from or date_to:
        date_query = {}
        if date_from:
            date_query["$gte"] = date_from
        if date_to:
            date_query["$lte"] = date_to
        query["scheduled_date"] = date_query

    interviews = []
    async for interview in interviews_collection.find(query).sort("scheduled_date", 1):
        response_doc = {**interview, "id": interview["_id"]}
        interviews.append(InterviewResponse(**response_doc))
    return interviews


async def get_interviews_by_candidate(
    applicant_username: str,
    status: Optional[str] = None,
) -> List[InterviewResponse]:
    """Get interviews for a candidate"""
    query = {"applicant_username": applicant_username}

    if status:
        query["status"] = status

    interviews = []
    async for interview in interviews_collection.find(query).sort("scheduled_date", 1):
        response_doc = {**interview, "id": interview["_id"]}
        interviews.append(InterviewResponse(**response_doc))
    return interviews


async def get_upcoming_interviews(company_id: str) -> List[InterviewResponse]:
    """Get upcoming scheduled interviews for a company"""
    today = datetime.utcnow().strftime("%Y-%m-%d")

    interviews = []
    async for interview in interviews_collection.find(
        {"company_id": company_id, "status": "scheduled", "scheduled_date": {"$gte": today}}
    ).sort("scheduled_date", 1):
        response_doc = {**interview, "id": interview["_id"]}
        interviews.append(InterviewResponse(**response_doc))
    return interviews


async def generate_calendar_invite(interview: InterviewResponse) -> dict:
    """Generate calendar invite data for an interview"""
    # This would generate ICS format or similar for calendar integration
    # For now, return basic data that can be used to create calendar events
    
    job = await job_collection.find_one({"_id": interview.job_id})
    job_title = job.get("title") if job else "İlan"
    
    applicant = await users_collection.find_one({"username": interview.applicant_username})
    applicant_name = applicant.get("full_name") if applicant else interview.applicant_username
    
    return {
        "title": f"Mülakat: {job_title} - {applicant_name}",
        "description": f"""
        Mülakat Türü: {interview.interview_type}
        Süre: {interview.duration_minutes} dakika
        Aday: {applicant_name}
        
        Notlar: {interview.notes or 'Yok'}
        """,
        "start": f"{interview.scheduled_date}T{interview.scheduled_time}",
        "duration": interview.duration_minutes,
        "location": interview.location or interview.meeting_link or "Online",
        "attendees": [interview.applicant_username],
    }


async def employee_interview_action(
    interview_id: str,
    action_data: InterviewEmployeeAction,
    applicant_username: str,
) -> InterviewResponse:
    """Handle employee action on interview (accept, reject, request reschedule)"""
    interview = await interviews_collection.find_one({"_id": interview_id})
    if not interview:
        raise ValueError("Mülakat bulunamadı.")
    
    if interview.get("applicant_username") != applicant_username:
        raise ValueError("Bu mülakata erişiminiz yok.")
    
    # Check if employee has already responded (treat null/undefined as pending)
    current_response = interview.get("employee_response")
    if current_response and current_response != "pending":
        raise ValueError("Bu mülakata zaten yanıt verildi.")
    
    # Map action to employee_response status
    response_mapping = {
        "accept": "accepted",
        "reject": "rejected",
        "request_reschedule": "reschedule_requested"
    }
    update_dict = {"employee_response": response_mapping.get(action_data.action, action_data.action)}
    
    if action_data.action == "request_reschedule":
        if not action_data.proposed_date or not action_data.proposed_time:
            raise ValueError("Yeniden planlama için tarih ve saat gerekli.")
        update_dict["reschedule_requested"] = True
        update_dict["proposed_date"] = action_data.proposed_date
        update_dict["proposed_time"] = action_data.proposed_time
        update_dict["reschedule_request_notes"] = action_data.notes
        update_dict["reschedule_status"] = "pending"
    
    await interviews_collection.update_one(
        {"_id": interview_id},
        {"$set": update_dict},
    )
    
    # Get job title for notification
    job = await job_collection.find_one({"_id": interview.get("job_id")})
    job_title = job.get("title") if job else None
    
    # Send notification to company
    await notify_interview_employee_response(
        applicant_username=applicant_username,
        company_id=interview.get("company_id"),
        job_title=job_title,
        response=action_data.action,
        interview_date=interview.get("scheduled_date"),
    )
    
    interview = await interviews_collection.find_one({"_id": interview_id})
    response_doc = {**interview, "id": interview["_id"]}
    return InterviewResponse(**response_doc)


async def handle_reschedule_decision(
    interview_id: str,
    decision_data: InterviewRescheduleDecision,
    company_id: str,
) -> InterviewResponse:
    """Handle HR decision on reschedule request (approve, reject)"""
    interview = await interviews_collection.find_one({"_id": interview_id})
    if not interview:
        raise ValueError("Mülakat bulunamadı.")
    
    if interview.get("company_id") != company_id:
        raise ValueError("Bu mülakata erişiminiz yok.")
    
    if not interview.get("reschedule_requested"):
        raise ValueError("Bu mülakat için yeniden planlama talebi yok.")
    
    if interview.get("reschedule_status") != "pending":
        raise ValueError("Bu talep için zaten karar verildi.")
    
    # Map decision to reschedule_status
    decision_mapping = {
        "approve": "approved",
        "reject": "rejected"
    }
    update_dict = {"reschedule_status": decision_mapping.get(decision_data.decision, decision_data.decision)}
    
    if decision_data.decision == "approve":
        # Update the interview with proposed date/time
        update_dict["scheduled_date"] = interview.get("proposed_date")
        update_dict["scheduled_time"] = interview.get("proposed_time")
        update_dict["status"] = "rescheduled"
        update_dict["employee_response"] = "accepted"
        new_date = interview.get("proposed_date")
    else:
        # Reject - keep original date, reset employee response to pending
        update_dict["employee_response"] = "pending"
        update_dict["reschedule_requested"] = False
        new_date = None
    
    await interviews_collection.update_one(
        {"_id": interview_id},
        {"$set": update_dict},
    )
    
    # Get job title for notification
    job = await job_collection.find_one({"_id": interview.get("job_id")})
    job_title = job.get("title") if job else None
    
    # Send notification to employee
    await notify_interview_reschedule_decision(
        applicant_username=interview.get("applicant_username"),
        company_id=company_id,
        job_title=job_title,
        decision=decision_data.decision,
        new_date=new_date,
    )
    
    interview = await interviews_collection.find_one({"_id": interview_id})
    response_doc = {**interview, "id": interview["_id"]}
    return InterviewResponse(**response_doc)
