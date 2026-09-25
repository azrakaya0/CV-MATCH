import logging
import re
from typing import List, Optional
from database import cv_collection, job_collection
from models import CandidateFilterRequest, CandidateFilterResponse, Education, Experience

logger = logging.getLogger(__name__)

# Skill synonym mapping for better matching
SKILL_SYNONYMS = {
    "word": ["microsoft word", "ms word", "word processing", "office word", "document processing"],
    "excel": ["microsoft excel", "ms excel", "spreadsheet", "office excel", "data analysis"],
    "powerpoint": ["microsoft powerpoint", "ms powerpoint", "presentation", "office powerpoint", "ppt"],
    "office": ["microsoft office", "ms office", "office suite", "microsoft 365", "office 365"],
    "outlook": ["microsoft outlook", "ms outlook", "email", "office outlook"],
    "teams": ["microsoft teams", "ms teams", "office teams", "video conferencing"],
    "python": ["python programming", "python3", "py", "python script"],
    "javascript": ["js", "java script", "ecmascript", "node.js", "nodejs"],
    "java": ["java programming", "java se", "java ee", "spring"],
    "react": ["reactjs", "react js", "react.js", "react native"],
    "angular": ["angularjs", "angular js", "angular.js", "angular 2", "angular 2+"],
    "sql": ["sql database", "mysql", "postgresql", "sqlite", "t-sql", "pl/sql"],
    "git": ["version control", "github", "gitlab", "bitbucket"],
    "docker": ["containerization", "containers", "docker compose"],
    "aws": ["amazon web services", "amazon cloud", "ec2", "s3", "lambda"],
    "azure": ["microsoft azure", "azure cloud", "azure services"],
    "gcp": ["google cloud platform", "google cloud", "gke"],
}


def expand_skills_with_synonyms(skills: List[str]) -> List[str]:
    """Expand skills list with synonyms for better matching"""
    expanded = set(skills)
    for skill in skills:
        skill_lower = skill.lower()
        # Check if this skill is a key in synonyms
        if skill_lower in SKILL_SYNONYMS:
            expanded.update(SKILL_SYNONYMS[skill_lower])
        # Check if this skill is a synonym of another skill
        for key, synonyms in SKILL_SYNONYMS.items():
            if skill_lower in [s.lower() for s in synonyms]:
                expanded.add(key)
                expanded.update(synonyms)
    return list(expanded)


def extract_experience_years(experience_list: List[dict]) -> float:
    """Extract total years of experience from experience list"""
    total_years = 0.0
    for exp in experience_list:
        duration_str = exp.get("duration", "")
        if not duration_str:
            continue

        logger.debug(f"Processing duration: {duration_str}")

        # Try to extract date ranges like "2025-2026" and calculate years
        date_range_matches = re.findall(r'(\d{4})\s*[-–]\s*(\d{4})', duration_str)
        if date_range_matches:
            for match in date_range_matches:
                start_year, end_year = int(match[0]), int(match[1])
                years = end_year - start_year
                # Sanity check: years should be reasonable (0-50)
                if 0 <= years <= 50:
                    total_years += years
                    logger.debug(f"Added {years} years from date range {start_year}-{end_year}")

        # Try to extract years from duration strings like "2 years", "3-5 years", "1.5 years", etc.
        year_matches = re.findall(r'(\d+\.?\d*)\s*(?:year|yıl)', duration_str.lower())
        for match in year_matches:
            years = float(match)
            # Sanity check: years should be reasonable (0-50)
            if 0 <= years <= 50:
                total_years += years
                logger.debug(f"Added {years} years from year match")

        # If no years found, try to extract months and convert to years
        month_matches = re.findall(r'(\d+)\s*(?:month|ay)', duration_str.lower())
        if not year_matches and not date_range_matches:
            for match in month_matches:
                months = float(match)
                # Sanity check: months should be reasonable (0-600)
                if 0 <= months <= 600:
                    total_years += months / 12
                    logger.debug(f"Added {months/12} years from month match")

        # If still no match, try to extract ranges like "3-5 years" and take average
        range_matches = re.findall(r'(\d+)\s*[-–]\s*(\d+)\s*(?:year|yıl)', duration_str.lower())
        if not year_matches and not month_matches and not date_range_matches:
            for match in range_matches:
                start, end = float(match[0]), float(match[1])
                # Sanity check: range should be reasonable
                if 0 <= start <= 50 and 0 <= end <= 50:
                    total_years += (start + end) / 2
                    logger.debug(f"Added {(start+end)/2} years from range match")

    logger.debug(f"Total experience years: {total_years}")
    return round(total_years, 1)


def get_graduation_status(education_list: List[dict]) -> Optional[str]:
    """Determine graduation status from education list"""
    if not education_list:
        return None
    
    latest_edu = education_list[0] if education_list else {}
    year = latest_edu.get("year")
    
    if not year:
        return "Bilinmiyor"
    
    try:
        year_int = int(year)
        current_year = 2026  # Update as needed
        if year_int <= current_year:
            return "Mezun"
        else:
            return "Öğrenci"
    except (ValueError, TypeError):
        return "Bilinmiyor"


def get_education_level(education_list: List[dict]) -> Optional[str]:
    """Determine highest education level"""
    if not education_list:
        return None
    
    level_priority = {
        "doktora": 5,
        "phd": 5,
        "yüksek lisans": 4,
        "master": 4,
        "ms": 4,
        "lisans": 3,
        "bachelor": 3,
        "bs": 3,
        "ön lisans": 2,
        "associate": 2,
        "lise": 1,
        "high school": 1,
    }
    
    highest_level = None
    highest_priority = 0
    
    for edu in education_list:
        degree = edu.get("degree", "").lower()
        for level, priority in level_priority.items():
            if level in degree and priority > highest_priority:
                highest_priority = priority
                highest_level = edu.get("degree")
    
    return highest_level


async def filter_candidates(
    filter_request: CandidateFilterRequest,
    company_id: Optional[str] = None
) -> List[CandidateFilterResponse]:
    """Filter candidates based on provided criteria"""
    query = {}

    # Build MongoDB query based on filters
    if filter_request.skills:
        # Expand skills with synonyms for better matching
        expanded_skills = expand_skills_with_synonyms(filter_request.skills)
        # Use $or for case-insensitive skill matching (cannot use $in with regex)
        skill_conditions = [{"data.skills": {"$regex": f"^{re.escape(skill)}$", "$options": "i"}} for skill in expanded_skills]
        if "$or" not in query:
            query["$or"] = []
        query["$or"].extend(skill_conditions)

    if filter_request.location:
        location_conditions = [
            {"data.city": {"$regex": filter_request.location, "$options": "i"}},
            {"data.district": {"$regex": filter_request.location, "$options": "i"}},
        ]
        if "$or" not in query:
            query["$or"] = []
        query["$or"].extend(location_conditions)

    if filter_request.languages:
        # Use $or for case-insensitive language matching (cannot use $in with regex)
        lang_conditions = [{"data.languages": {"$regex": f"^{re.escape(lang)}$", "$options": "i"}} for lang in filter_request.languages]
        if "$or" not in query:
            query["$or"] = []
        query["$or"].extend(lang_conditions)
    
    # If job_id is provided, only consider CVs that have applied to this job
    cv_ids_to_consider = None
    if filter_request.job_id:
        from database import applications_collection
        cv_ids = []
        async for app in applications_collection.find({"job_id": filter_request.job_id}):
            cv_ids.append(app["cv_id"])
        if cv_ids:
            query["_id"] = {"$in": cv_ids}
        else:
            return []
    
    results = []
    async for cv in cv_collection.find(query):
        cv_data = cv.get("data", {})
        experience_list = cv_data.get("experience", [])
        education_list = cv_data.get("education", [])
        
        # Calculate total experience
        total_experience = extract_experience_years(experience_list)
        
        # Filter by experience years
        if filter_request.min_experience_years and total_experience < filter_request.min_experience_years:
            continue
        if filter_request.max_experience_years and total_experience > filter_request.max_experience_years:
            continue
        
        # Filter by education level
        if filter_request.education_level:
            edu_level = get_education_level(education_list)
            if edu_level and filter_request.education_level.lower() not in edu_level.lower():
                continue
        
        # Filter by graduation status
        if filter_request.graduation_status:
            grad_status = get_graduation_status(education_list)
            if grad_status and filter_request.graduation_status.lower() not in grad_status.lower():
                continue
        
        # Calculate match score if job_id is provided
        match_score = None
        if filter_request.job_id:
            job = await job_collection.find_one({"_id": filter_request.job_id})
            if job:
                required_skills = job.get("required_skills", [])
                cv_skills = cv_data.get("skills", [])
                if required_skills:
                    matched = len(set(cv_skills) & set(required_skills))
                    match_score = (matched / len(required_skills)) * 100 if required_skills else 0
        
        results.append(
            CandidateFilterResponse(
                cv_id=cv["_id"],
                display_id=cv.get("display_id"),
                name=cv_data.get("name"),
                email=cv_data.get("email"),
                phone=cv_data.get("phone"),
                city=cv_data.get("city"),
                district=cv_data.get("district"),
                skills=cv_data.get("skills", []),
                education=[Education(**edu) for edu in education_list],
                experience=[Experience(**exp) for exp in experience_list],
                languages=cv_data.get("languages", []),
                total_experience_years=total_experience,
                match_score=match_score
            )
        )
    
    # Sort by match score if available
    if filter_request.job_id:
        results.sort(key=lambda x: x.match_score or 0, reverse=True)
    
    return results
