import re
from models import JobRequirements
from services.cv_analyzer import LANGUAGE_PAIRS, DEGREE_MAP, turkish_lower
from services.skill_classifier import find_skills_in_text


def analyze_job(description: str) -> JobRequirements:
    text_lower = turkish_lower(description)

    preferred_section = ""
    pref_patterns = [
        r"(?:tercih edilen|tercih sebebi|preferred|nice to have|artı|plus|bonus)[\s:.]*(.*)",
    ]
    for pattern in pref_patterns:
        match = re.search(pattern, text_lower, re.DOTALL | re.IGNORECASE)
        if match:
            preferred_section = match.group(1)
            break

    all_found = find_skills_in_text(description)

    required_skills = []
    preferred_skills = []
    if preferred_section:
        pref_found = set(s.lower() for s in find_skills_in_text(preferred_section))
        for skill in all_found:
            if skill.lower() in pref_found:
                preferred_skills.append(skill)
            else:
                required_skills.append(skill)
    else:
        required_skills = all_found

    min_education = None
    for degree, level in sorted(DEGREE_MAP.items(), key=lambda x: -x[1]):
        if degree in text_lower:
            min_education = degree.title()
            break

    experience_years = None
    exp_patterns = [
        r"(\d+)\+?\s*(?:yıl|yil|year|sene|yıllık|yillik)",
        r"(?:en az|minimum|at least)\s*(\d+)",
    ]
    for pattern in exp_patterns:
        match = re.search(pattern, text_lower)
        if match:
            experience_years = int(match.group(1))
            break

    languages = set()
    for key, normalized in LANGUAGE_PAIRS.items():
        if key in text_lower:
            languages.add(normalized)

    return JobRequirements(
        required_skills=required_skills,
        preferred_skills=preferred_skills,
        min_education=min_education,
        experience_years=experience_years,
        languages=list(languages),
    )
