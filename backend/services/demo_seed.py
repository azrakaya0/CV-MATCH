import logging
import uuid
from datetime import datetime

from config import settings
from database import companies_collection, job_collection, users_collection
from services.job_analyzer import analyze_job

logger = logging.getLogger(__name__)

_DEMO_JOBS = [
    {
        "title": "Kıdemli Python Geliştirici",
        "company": "Demo Şirket A.Ş.",
        "description": """
        Aranan nitelikler:
        - En az 3 yıl Python deneyimi
        - FastAPI veya Django bilgisi
        - PostgreSQL, Docker
        - İyi düzey İngilizce
        - Lisans mezunu (Bilgisayar Mühendisliği veya ilgili bölüm)
        """,
        "department": "Yazılım",
        "location": "İstanbul",
        "workplace_type": "hybrid",
    },
    {
        "title": "İnsan Kaynakları Uzmanı",
        "company": "Demo Şirket A.Ş.",
        "description": """
        - En az 2 yıl İK deneyimi
        - İşe alım süreçleri
        - İş Kanunu bilgisi
        - İletişim becerileri
        - Üniversite mezunu
        """,
        "department": "İnsan Kaynakları",
        "location": "Ankara",
        "workplace_type": "onsite",
    },
    {
        "title": "Dijital Pazarlama Uzmanı",
        "company": "Demo Şirket A.Ş.",
        "description": """
        - SEO, Google Ads, sosyal medya yönetimi
        - En az 2 yıl deneyim
        - Analitik düşünme
        - İngilizce orta seviye
        """,
        "department": "Pazarlama",
        "location": "İzmir",
        "workplace_type": "remote",
    },
]


async def seed_demo_jobs_if_empty() -> int:
    if not settings.SEED_DEMO_USERS:
        return 0
    if await job_collection.count_documents({}) > 0:
        return 0

    company = await companies_collection.find_one({})
    if not company:
        return 0

    manager = await users_collection.find_one({"role": "company", "company_id": company["_id"]})
    username = manager["username"] if manager else "yonetici"
    company_id = company["_id"]
    now = datetime.utcnow().isoformat()
    created = 0

    for spec in _DEMO_JOBS:
        auto = analyze_job(spec["description"])
        job_id = str(uuid.uuid4())
        await job_collection.insert_one(
            {
                "_id": job_id,
                "title": spec["title"],
                "company": spec["company"],
                "description": spec["description"].strip(),
                "experience_type": None,
                "requirements": {
                    "required_skills": auto.required_skills,
                    "preferred_skills": auto.preferred_skills,
                    "min_education": auto.min_education,
                    "experience_years": auto.experience_years,
                    "languages": auto.languages,
                },
                "created_at": now,
                "company_id": company_id,
                "created_by_username": username,
                "status": "open",
                "department": spec.get("department"),
                "location": spec.get("location"),
                "workplace_type": spec.get("workplace_type"),
            }
        )
        created += 1

    if created:
        logger.info("Sunum için %s demo iş ilanı oluşturuldu.", created)
    return created
