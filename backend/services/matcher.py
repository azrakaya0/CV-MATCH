import re
from datetime import datetime
from models import CVData, JobRequirements, MatchScores
from services.cv_analyzer import DEGREE_MAP, get_education_level, turkish_lower


def calculate_education_score(cv_educations: list, required_education: str) -> float:
    if not required_education:
        return 75.0

    cv_level = get_education_level(cv_educations)

    req_level = -1
    for key, level in DEGREE_MAP.items():
        if key in turkish_lower(required_education):
            req_level = level
            break

    if req_level == -1:
        return 75.0

    if cv_level >= req_level:
        return 100.0
    elif cv_level == req_level - 1:
        return 60.0
    elif cv_level == req_level - 2:
        return 30.0
    return 10.0


def calculate_experience_score(cv_experiences: list, required_years) -> float:
    if required_years is None:
        return 75.0

    total_years = 0
    for exp in cv_experiences:
        if exp.duration:
            direct_years = re.search(r"(\d+)\s*(?:yıl|yil|year|sene)", exp.duration, re.IGNORECASE)
            if direct_years:
                total_years += int(direct_years.group(1))
                continue

            years = re.findall(r"((?:19|20)\d{2})", exp.duration)
            if len(years) >= 2:
                y1 = int(years[0])
                y2 = int(years[1])
                total_years += abs(y2 - y1)
            elif len(years) == 1:
                y1 = int(years[0])
                total_years += datetime.now().year - y1

    if total_years == 0 and len(cv_experiences) > 0:
        total_years = len(cv_experiences) * 1.5

    if total_years >= required_years:
        return 100.0

    ratio = total_years / required_years
    return min(ratio * 100, 100)


def calculate_language_score(cv_languages: list, required_languages: list):
    if not required_languages:
        return 75.0, {"matched": list(cv_languages), "missing": []}

    cv_lower = {turkish_lower(lang) for lang in cv_languages}
    req_lower = {turkish_lower(lang) for lang in required_languages}
    matched = cv_lower & req_lower

    detail = {
        "matched": [l for l in required_languages if turkish_lower(l) in matched],
        "missing": [l for l in required_languages if turkish_lower(l) not in cv_lower],
    }

    return (len(matched) / len(req_lower)) * 100, detail


def match_cv_job(cv_data: CVData, job_req: JobRequirements):
    from config import settings
    from services.ai_matcher import ai_skill_match, ai_text_match
    from services.rule_matcher import rule_skill_match

    use_ai = settings.AI_MODE.lower() == "ai"
    skill_fn = ai_skill_match if use_ai else rule_skill_match

    req_score_ai, matched_req, missing_req = skill_fn(cv_data.skills, job_req.required_skills)
    _, matched_pref, missing_pref = skill_fn(cv_data.skills, job_req.preferred_skills)

    if use_ai and job_req.required_skills:
        text_score = ai_text_match(cv_data.raw_text, " ".join(job_req.required_skills))
    elif job_req.required_skills:
        text_score = req_score_ai
    else:
        text_score = 50.0

    bonus_ai = (len(matched_pref) / len(job_req.preferred_skills) * 15) if job_req.preferred_skills else 0
    skill_score = min(req_score_ai * 0.7 + text_score * 0.3 + bonus_ai, 100)

    matched = matched_req + matched_pref
    missing = missing_req + missing_pref
    skill_detail = {
        "matched_required": matched_req,
        "matched_preferred": matched_pref,
        "missing_required": missing_req,
        "missing_preferred": missing_pref,
    }

    edu_score = calculate_education_score(cv_data.education, job_req.min_education)
    exp_score = calculate_experience_score(cv_data.experience, job_req.experience_years)
    lang_score, lang_detail = calculate_language_score(cv_data.languages, job_req.languages)

    overall = (
        skill_score * 0.40
        + exp_score * 0.25
        + edu_score * 0.20
        + lang_score * 0.15
    )

    scores = MatchScores(
        overall=round(overall, 1),
        skills=round(skill_score, 1),
        education=round(edu_score, 1),
        experience=round(exp_score, 1),
        languages=round(lang_score, 1),
    )

    cv_edu_labels = []
    if cv_data.education:
        for e in cv_data.education:
            label = e.degree or e.field or e.institution or ""
            if label:
                cv_edu_labels.append(label)

    detail = {
        "skill_detail": skill_detail,
        "language_detail": lang_detail,
        "education": {
            "cv_level": cv_edu_labels,
            "required": job_req.min_education or "Belirtilmemiş",
        },
        "experience": {
            "cv_total_years": _estimate_total_years(cv_data.experience),
            "required_years": job_req.experience_years,
        },
    }

    return scores, matched, missing, detail


def _estimate_total_years(experiences: list) -> float:
    total = 0
    for exp in experiences:
        if exp.duration:
            direct = re.search(r"(\d+)\s*(?:yıl|yil|year|sene)", exp.duration, re.IGNORECASE)
            if direct:
                total += int(direct.group(1))
                continue
            years = re.findall(r"((?:19|20)\d{2})", exp.duration)
            if len(years) >= 2:
                total += abs(int(years[1]) - int(years[0]))
            elif len(years) == 1:
                total += datetime.now().year - int(years[0])
    if total == 0 and len(experiences) > 0:
        total = len(experiences) * 1.5
    return round(total, 1)
