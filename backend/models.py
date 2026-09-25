from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime


class Education(BaseModel):
    degree: str = ""
    field: str = ""
    institution: str = ""
    year: Optional[str] = None


class Experience(BaseModel):
    title: str = ""
    company: str = ""
    duration: str = ""
    description: str = ""


class Reference(BaseModel):
    name: str = ""
    title: str = ""
    company: str = ""
    phone: str = ""
    email: str = ""


class CVData(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    skills: List[str] = []
    education: List[Education] = []
    experience: List[Experience] = []
    languages: List[str] = []
    references: List[Reference] = []
    certifications: List[str] = []
    raw_text: str = ""


class EmployeeFormExperience(BaseModel):
    title: str = ""
    company: str = ""
    start: str = ""
    end: str = ""
    current: bool = False
    description: str = ""


class EmployeeFormEducation(BaseModel):
    institution: str = ""
    field: str = ""
    degree: str = ""
    year: str = ""


class EmployeeFormLanguage(BaseModel):
    name: str = ""
    level: str = ""


class EmployeeFormReference(BaseModel):
    name: str = ""
    title: str = ""
    company: str = ""
    phone: str = ""
    email: str = ""


class EmployeeCvFormPayload(BaseModel):
    full_name: str = ""
    email: str = ""
    phone: str = ""
    city: str = ""
    district: str = ""
    summary: str = ""
    experiences: List[EmployeeFormExperience] = []
    educations: List[EmployeeFormEducation] = []
    skills: List[str] = []
    languages: List[EmployeeFormLanguage] = []
    references: List[EmployeeFormReference] = []
    certifications: List[str] = []


class CVResponse(BaseModel):
    id: str
    filename: str
    data: CVData
    created_at: str
    display_id: Optional[int] = None
    kvkk_consent_at: Optional[str] = None
    kvkk_version: Optional[str] = None
    owner_username: Optional[str] = None
    submission_type: Optional[str] = None
    employee_form: Optional[dict] = None


class JobRequirements(BaseModel):
    required_skills: List[str] = []
    preferred_skills: List[str] = []
    min_education: Optional[str] = None
    experience_years: Optional[int] = None
    languages: List[str] = []


class JobCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    company: Optional[str] = Field(None, max_length=200)
    description: str = Field(..., min_length=10, max_length=20000)
    required_skills: List[str] = []
    preferred_skills: List[str] = []
    min_education: Optional[str] = None
    experience_years: Optional[int] = None
    experience_type: Optional[str] = None
    languages: List[str] = []
    department: Optional[str] = Field(None, max_length=120)
    location: Optional[str] = Field(None, max_length=120)
    workplace_type: Optional[Literal["onsite", "remote", "hybrid"]] = None


class CompanyProfile(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None


class JobResponse(BaseModel):
    id: str
    title: str
    company: Optional[str] = None
    description: str
    requirements: JobRequirements
    created_at: str
    company_id: Optional[str] = None
    status: Optional[str] = "open"
    favorited: Optional[bool] = None
    department: Optional[str] = None
    location: Optional[str] = None
    workplace_type: Optional[str] = None
    application_count: Optional[int] = None
    company_legal_name: Optional[str] = None
    company_profile: Optional[CompanyProfile] = None


class MatchScores(BaseModel):
    overall: float = 0.0
    skills: float = 0.0
    education: float = 0.0
    experience: float = 0.0
    languages: float = 0.0


class MatchDetail(BaseModel):
    skill_detail: dict = {}
    language_detail: dict = {}
    education: dict = {}
    experience: dict = {}


class MatchResult(BaseModel):
    id: str
    cv_id: str
    job_id: str
    cv_name: Optional[str] = None
    scores: MatchScores
    matched_skills: List[str] = []
    missing_skills: List[str] = []
    detail: Optional[MatchDetail] = None
    suggestions: List[str] = []
    created_at: str


class CompareRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    cv_ids: List[str]
    job_id: str


class ApplicationResponse(BaseModel):
    id: str
    job_id: str
    applicant_username: str
    cv_id: str
    created_at: str
    assigned_reviewer_username: Optional[str] = None
    department_label: Optional[str] = None


class BulkEmailCreate(BaseModel):
    job_id: str
    subject: str = Field(..., min_length=2, max_length=200)
    body: str = Field(..., min_length=10, max_length=10000)
    recipient_filter: Optional[Literal["all", "favorites"]] = "all"


class BulkEmailResponse(BaseModel):
    id: str
    job_id: str
    company_id: str
    subject: str
    body: str
    recipient_filter: str
    total_recipients: int
    sent_count: int
    failed_count: int
    status: str
    created_at: str
    sent_at: Optional[str] = None


# Advanced Filtering Models
class CandidateFilterRequest(BaseModel):
    skills: Optional[List[str]] = None
    location: Optional[str] = None
    min_experience_years: Optional[int] = None
    max_experience_years: Optional[int] = None
    education_level: Optional[str] = None
    graduation_status: Optional[str] = None
    languages: Optional[List[str]] = None
    job_id: Optional[str] = None


class CandidateFilterResponse(BaseModel):
    cv_id: str
    display_id: Optional[int] = None
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    skills: List[str] = []
    education: List[Education] = []
    experience: List[Experience] = []
    languages: List[str] = []
    total_experience_years: Optional[float] = None
    match_score: Optional[float] = None


# ATS/Kanban Board Models
class PipelineStage(BaseModel):
    id: str
    name: str
    order: int
    color: str


class CandidatePipeline(BaseModel):
    application_id: str
    stage: str
    stage_order: int
    moved_at: str
    moved_by: Optional[str] = None
    notes: Optional[str] = None


class PipelineUpdate(BaseModel):
    stage: str
    notes: Optional[str] = None


# Interview Scheduler Models
class InterviewCreate(BaseModel):
    application_id: str
    scheduled_date: str
    scheduled_time: str
    duration_minutes: int = 60
    interview_type: Literal["technical", "hr", "final"] = "technical"
    location: Optional[str] = None
    meeting_link: Optional[str] = None
    notes: Optional[str] = None


class InterviewResponse(BaseModel):
    id: str
    application_id: str
    job_id: str
    applicant_username: str
    company_id: str
    scheduled_date: str
    scheduled_time: str
    duration_minutes: int
    interview_type: str
    location: Optional[str] = None
    meeting_link: Optional[str] = None
    notes: Optional[str] = None
    status: Literal["scheduled", "completed", "cancelled", "rescheduled"] = "scheduled"
    created_at: str
    created_by: str
    employee_response: Optional[Literal["pending", "accepted", "rejected", "reschedule_requested"]] = "pending"
    reschedule_requested: bool = False
    proposed_date: Optional[str] = None
    proposed_time: Optional[str] = None
    reschedule_request_notes: Optional[str] = None
    reschedule_status: Optional[Literal["pending", "approved", "rejected"]] = None


class InterviewUpdate(BaseModel):
    scheduled_date: Optional[str] = None
    scheduled_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    location: Optional[str] = None
    meeting_link: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[Literal["scheduled", "completed", "cancelled", "rescheduled"]] = None


class InterviewEmployeeAction(BaseModel):
    action: Literal["accept", "reject", "request_reschedule"]
    proposed_date: Optional[str] = None
    proposed_time: Optional[str] = None
    notes: Optional[str] = None


class InterviewRescheduleDecision(BaseModel):
    decision: Literal["approve", "reject"]
    notes: Optional[str] = None


# Application Tracking Panel Models
class ApplicationStatusHistory(BaseModel):
    stage: str
    changed_at: str
    changed_by: Optional[str] = None
    notes: Optional[str] = None


class ApplicationTrackingResponse(BaseModel):
    id: str
    job_id: str
    job_title: str
    company_name: Optional[str] = None
    company_id: str
    cv_id: str
    current_stage: str
    stage_order: int
    created_at: str
    updated_at: str
    status_history: List[ApplicationStatusHistory] = []
    interviews: List[InterviewResponse] = []
    is_favorite: bool = False
