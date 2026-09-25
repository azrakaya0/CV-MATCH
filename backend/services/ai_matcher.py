from sentence_transformers import SentenceTransformer, util

from services.skill_match_utils import greedy_skill_match

_model = None


def get_model():
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def semantic_similarity(text1: str, text2: str) -> float:
    model = get_model()

    embeddings = model.encode([text1, text2], convert_to_tensor=True)
    similarity = util.cos_sim(embeddings[0], embeddings[1])

    return float(similarity.item())


def ai_skill_match(cv_skills: list, job_skills: list) -> tuple:

    if not job_skills:
        return 50.0, [], []
    if not cv_skills:
        return 0.0, [], job_skills

    model = get_model()

    cv_embeddings = model.encode(cv_skills, convert_to_tensor=True)
    job_embeddings = model.encode(job_skills, convert_to_tensor=True)

    similarity_matrix = util.cos_sim(cv_embeddings, job_embeddings)
    return greedy_skill_match(cv_skills, job_skills, similarity_matrix, threshold=0.5)


def ai_text_match(cv_text: str, job_description: str) -> float:

    if not cv_text or not job_description:
        return 50.0

    cv_short = cv_text[:1000]
    job_short = job_description[:1000]

    similarity = semantic_similarity(cv_short, job_short)

    score = min(similarity * 130, 100)
    return round(score, 1)
