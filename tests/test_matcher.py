import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from models import CVData, JobRequirements
from services.matcher import calculate_education_score, calculate_experience_score


def test_calculate_education_score():
    # Test with no required education
    score = calculate_education_score([], "")
    assert score == 75.0

    # Test with matching education - use objects with all required attributes
    from types import SimpleNamespace
    cv_educations = [SimpleNamespace(degree="Lisans", field="Bilgisayar Mühendisliği", institution="İstanbul Teknik Üniversitesi")]
    score = calculate_education_score(cv_educations, "Lisans")
    assert score == 100.0

    # Test with lower education
    score = calculate_education_score(cv_educations, "Yüksek Lisans")
    assert score < 100.0


def test_calculate_experience_score():
    # Test with no required years
    score = calculate_experience_score([], None)
    assert score == 75.0

    # Test with matching experience - use objects with duration attribute
    from types import SimpleNamespace
    cv_experiences = [SimpleNamespace(duration="5 yıl")]
    score = calculate_experience_score(cv_experiences, 5)
    assert score == 100.0

    # Test with less experience
    score = calculate_experience_score(cv_experiences, 10)
    assert score < 100.0


def test_match_cv_job():
    from services.matcher import match_cv_job

    cv_data = CVData(
        name="Test User",
        email="test@example.com",
        phone="",
        city="",
        district="",
        summary="",
        skills=["Python", "FastAPI"],
        education=[],
        experience=[],
        languages=[],
        raw_text="Python FastAPI developer",
    )

    job_req = JobRequirements(
        required_skills=["Python"],
        preferred_skills=[],
        min_education="",
        experience_years=1,
        languages=[],
    )

    scores, matched, missing, detail = match_cv_job(cv_data, job_req)
    assert scores.overall > 0
    assert len(matched) > 0
    assert "Python" in matched or "python" in [m.lower() for m in matched]
