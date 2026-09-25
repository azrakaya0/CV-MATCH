"""Beceri eşleştirme: bire bir atama ve Office uygulamalarının yanlış birleştirilmesini önleme."""
import re

from sentence_transformers import util

_OFFICE_SPECIFIC = {
    "word": ("word", "kelime", "ms word", "microsoft word"),
    "excel": ("excel", "spreadsheet", "ms excel", "microsoft excel"),
    "powerpoint": ("powerpoint", "ppt", "sunum", "ms powerpoint"),
    "outlook": ("outlook", "ms outlook"),
    "access": ("access", "ms access"),
}

_GENERIC_OFFICE = (
    "microsoft office",
    "ms office",
    "office suite",
    "office paketi",
    "office programları",
    "office",
)


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def office_specific_kind(skill: str) -> str | None:
    n = _norm(skill)
    if not n:
        return None
    for kind, keys in _OFFICE_SPECIFIC.items():
        if any(k in n or n in k for k in keys):
            return kind
    if any(g in n for g in _GENERIC_OFFICE):
        return "office_generic"
    return None


def skills_should_not_match(cv_skill: str, job_skill: str) -> bool:
    """Word ile Excel gibi farklı Office uygulamalarını birbirine eşleştirme."""
    cv_k = office_specific_kind(cv_skill)
    job_k = office_specific_kind(job_skill)
    if not cv_k or not job_k:
        return False
    if cv_k == job_k:
        return False
    if cv_k == "office_generic" or job_k == "office_generic":
        return False
    return True


def greedy_skill_match(
    cv_skills: list,
    job_skills: list,
    similarity_matrix,
    threshold: float = 0.5,
) -> tuple[float, list[str], list[str]]:
    if not job_skills:
        return 50.0, [], []
    if not cv_skills:
        return 0.0, [], list(job_skills)

    pairs: list[tuple[float, int, int]] = []
    for j in range(len(job_skills)):
        for i in range(len(cv_skills)):
            sim = float(similarity_matrix[i][j])
            if sim >= threshold and not skills_should_not_match(cv_skills[i], job_skills[j]):
                pairs.append((sim, i, j))
    pairs.sort(key=lambda x: x[0], reverse=True)

    used_cv: set[int] = set()
    used_job: set[int] = set()
    matched: list[str] = []
    for sim, i, j in pairs:
        if i in used_cv or j in used_job:
            continue
        used_cv.add(i)
        used_job.add(j)
        matched.append(f"{cv_skills[i]} ≈ {job_skills[j]}")

    missing = [job_skills[j] for j in range(len(job_skills)) if j not in used_job]
    score = (len(matched) / len(job_skills)) * 100 if job_skills else 50
    return min(score, 100), matched, missing


def rule_skill_match(cv_skills: list, job_skills: list) -> tuple[float, list[str], list[str]]:
    if not job_skills:
        return 50.0, [], []
    if not cv_skills:
        return 0.0, [], list(job_skills)

    cv_norm = [_norm(s) for s in cv_skills]
    matched: list[str] = []
    missing: list[str] = []
    used_cv: set[int] = set()

    for job_skill in job_skills:
        jn = _norm(job_skill)
        found = False
        for i, cn in enumerate(cv_norm):
            if i in used_cv:
                continue
            if not cn:
                continue
            if skills_should_not_match(cv_skills[i], job_skill):
                continue
            if jn == cn or jn in cn or cn in jn:
                used_cv.add(i)
                matched.append(job_skill)
                found = True
                break
        if not found:
            missing.append(job_skill)

    score = (len(matched) / len(job_skills)) * 100 if job_skills else 50
    return min(score, 100), matched, missing
