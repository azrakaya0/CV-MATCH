import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from app_logging import setup_logging
from config import settings
from database import (
    applications_collection,
    companies_collection,
    ensure_indexes,
    job_collection,
    migrate_username_lc,
    ping_database,
    settings_collection,
    sync_kvkk_document,
    users_collection,
)
from routers import (
    admin_router,
    application_router,
    application_tracking_router,
    ats_router,
    auth_router,
    bulk_email_router,
    candidate_filter_router,
    company_router,
    cv_router,
    interview_router,
    job_router,
    match_router,
    messages_router,
    notifications_router,
    rag_router,
)
from services.auth_service import hash_password
from services.demo_seed import seed_demo_jobs_if_empty
from services.job_expiry_service import check_auto_renew_jobs, check_expired_jobs, update_daily_analytics
from services.username import username_fields

setup_logging()
logger = logging.getLogger(__name__)

# Scheduler setup
scheduler = AsyncIOScheduler()


async def _ensure_demo_special_user(
    username: str,
    password: str,
    full_name: str,
    email: str,
    company_access: str,
    department: str | None = None,
) -> None:
    """Demo departman veya danışman kullanıcısı oluşturur."""
    if not settings.SEED_DEMO_USERS:
        return
    if await users_collection.find_one({"username": username}):
        return
    company = await companies_collection.find_one({})
    if not company:
        return
    company_id = company["_id"]
    now = datetime.utcnow().isoformat()
    await users_collection.insert_one(
        {
            **username_fields(username),
            "password_hash": hash_password(password),
            "role": "company",
            "company_id": company_id,
            "managed_company_ids": [company_id],
            "full_name": full_name,
            "email": email,
            "phone": "",
            "company_access": company_access,
            "department": department,
            "kvkk_accepted_at": now,
            "kvkk_version": settings.KVKK_POLICY_VERSION,
        }
    )
    logger.info("Demo %s kullanıcısı oluşturuldu: %s", company_access, username)


async def ensure_demo_department_user() -> None:
    await _ensure_demo_special_user(
        username=settings.DEFAULT_DEPT_USER,
        password=settings.DEFAULT_DEPT_PASSWORD,
        full_name="Yazılım Departmanı",
        email="departman@cvmatch.local",
        company_access="department",
        department="Yazılım",
    )


async def ensure_demo_consultant_user() -> None:
    await _ensure_demo_special_user(
        username=settings.DEFAULT_CONSULTANT_USER,
        password=settings.DEFAULT_CONSULTANT_PASSWORD,
        full_name="Demo Danışman İK",
        email="danisman@cvmatch.local",
        company_access="consultant",
        department=None,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.validate_production_secrets()
    await ensure_indexes()
    await migrate_username_lc()
    await sync_kvkk_document()

    from services.messaging_service import migrate_legacy_conversations

    await migrate_legacy_conversations()

    if settings.SEED_DEMO_USERS and await users_collection.count_documents({}) == 0:
        company_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        await companies_collection.insert_one(
            {
                "_id": company_id,
                "name": "Demo Şirket A.Ş.",
                "email": "ik@demo-sirket.com",
                "phone": "+90 212 555 0100",
                "address": "Maslak Mah. Büyükdere Cad. No:1, Sarıyer / İstanbul",
                "website": "https://demo-sirket.com",
                "created_at": now,
            }
        )
        await users_collection.insert_many(
            [
                {
                    "username": settings.DEFAULT_ADMIN_USER,
                    "password_hash": hash_password(settings.DEFAULT_ADMIN_PASSWORD),
                    "role": "admin",
                    "email": "admin@cvmatch.local",
                    "full_name": "Sistem Yöneticisi",
                },
                {
                    "username": settings.DEFAULT_MANAGER_USER,
                    "password_hash": hash_password(settings.DEFAULT_MANAGER_PASSWORD),
                    "role": "company",
                    "company_id": company_id,
                    "full_name": "Şirket Yetkilisi",
                    "email": "yonetici@cvmatch.local",
                    "phone": "",
                    "company_access": "hr",
                    "managed_company_ids": [company_id],
                    "department": None,
                    "kvkk_accepted_at": now,
                    "kvkk_version": settings.KVKK_POLICY_VERSION,
                },
                {
                    "username": settings.DEFAULT_EMPLOYEE_USER,
                    "password_hash": hash_password(settings.DEFAULT_EMPLOYEE_PASSWORD),
                    "role": "employee",
                    "full_name": "Demo Aday",
                    "email": "aday@cvmatch.local",
                    "phone": "",
                    "kvkk_accepted_at": now,
                    "kvkk_version": settings.KVKK_POLICY_VERSION,
                    "favorite_job_ids": [],
                },
                {
                    "username": settings.DEFAULT_DEPT_USER,
                    "password_hash": hash_password(settings.DEFAULT_DEPT_PASSWORD),
                    "role": "company",
                    "company_id": company_id,
                    "managed_company_ids": [company_id],
                    "full_name": "Yazılım Departmanı",
                    "email": "departman@cvmatch.local",
                    "phone": "",
                    "company_access": "department",
                    "department": "Yazılım",
                    "kvkk_accepted_at": now,
                    "kvkk_version": settings.KVKK_POLICY_VERSION,
                },
                {
                    "username": settings.DEFAULT_CONSULTANT_USER,
                    "password_hash": hash_password(settings.DEFAULT_CONSULTANT_PASSWORD),
                    "role": "company",
                    "company_id": company_id,
                    "managed_company_ids": [company_id],
                    "full_name": "Demo Danışman İK",
                    "email": "danisman@cvmatch.local",
                    "phone": "",
                    "company_access": "consultant",
                    "department": None,
                    "kvkk_accepted_at": now,
                    "kvkk_version": settings.KVKK_POLICY_VERSION,
                },
            ]
        )
    else:
        async for u in users_collection.find({"role": "manager"}):
            cid = str(uuid.uuid4())
            now = datetime.utcnow().isoformat()
            await companies_collection.insert_one(
                {"_id": cid, "name": f"Şirket ({u['username']})", "created_at": now}
            )
            await users_collection.update_one(
                {"_id": u["_id"]},
                {
                    "$set": {
                        "role": "company",
                        "company_id": cid,
                        "full_name": u.get("full_name") or u["username"],
                        "email": u.get("email") or "",
                    }
                },
            )
        first_company = await companies_collection.find_one({})
        if first_company:
            cid = first_company["_id"]
            await job_collection.update_many(
                {"company_id": {"$exists": False}},
                {"$set": {"company_id": cid, "status": "open"}},
            )

        await users_collection.update_many(
            {"role": "employee", "favorite_job_ids": {"$exists": False}},
            {"$set": {"favorite_job_ids": []}},
        )
        await applications_collection.update_many(
            {"company_favorite": {"$exists": False}},
            {"$set": {"company_favorite": False}},
        )
        await users_collection.update_many(
            {"role": "company", "company_access": {"$exists": False}},
            {"$set": {"company_access": "hr"}},
        )
        async for u in users_collection.find({"role": "company", "managed_company_ids": {"$exists": False}}):
            cid = u.get("company_id")
            if cid:
                await users_collection.update_one(
                    {"_id": u["_id"]},
                    {"$set": {"managed_company_ids": [cid]}},
                )

    await seed_demo_jobs_if_empty()
    await ensure_demo_department_user()
    await ensure_demo_consultant_user()
    
    # Start scheduler
    scheduler.add_job(check_expired_jobs, 'interval', hours=1, id='check_expired_jobs')
    scheduler.add_job(check_auto_renew_jobs, 'interval', hours=6, id='check_auto_renew_jobs')
    scheduler.add_job(update_daily_analytics, 'cron', hour=1, minute=0, id='update_daily_analytics')
    scheduler.start()
    logger.info("Scheduler başlatıldı.")
    
    logger.info("CVMatch AI başlatıldı (ortam=%s)", settings.ENVIRONMENT)
    yield
    
    # Shutdown scheduler
    scheduler.shutdown()
    logger.info("Scheduler durduruldu.")


app = FastAPI(
    title="CVMatch AI",
    description="CV Analiz ve İş İlanı Eşleştirme Platformu",
    version="2.0.0",
    lifespan=lifespan,
)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


app.add_middleware(SecurityHeadersMiddleware)

_cors_origins = settings.cors_origin_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials="*" not in _cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Beklenmeyen hata: %s %s", request.method, request.url.path)
    if settings.is_development:
        return JSONResponse(status_code=500, content={"detail": str(exc)})
    return JSONResponse(status_code=500, content={"detail": "Sunucu hatası. Lütfen daha sonra tekrar deneyin."})

app.include_router(auth_router.router)
app.include_router(admin_router.router)
app.include_router(company_router.router)
app.include_router(application_router.router)
app.include_router(cv_router.router)
app.include_router(job_router.router)
app.include_router(match_router.router)
app.include_router(rag_router.router)
app.include_router(notifications_router.router)
app.include_router(messages_router.router)
app.include_router(bulk_email_router.router)
app.include_router(candidate_filter_router.router)
app.include_router(ats_router.router)
app.include_router(interview_router.router)
app.include_router(application_tracking_router.router)


@app.get("/api/health")
async def health_check():
    db_ok = await ping_database()
    status = "ok" if db_ok else "degraded"
    return {
        "status": status,
        "message": "CVMatch AI çalışıyor!" if db_ok else "API ayakta ancak veritabanına ulaşılamıyor.",
        "database": "connected" if db_ok else "disconnected",
        "environment": settings.ENVIRONMENT,
    }


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)
UPLOADS_DIR = os.path.join(BASE_DIR, "static", "uploads")
AVATAR_DIR = os.path.join(UPLOADS_DIR, "avatars")
os.makedirs(AVATAR_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

frontend_dir = os.path.join(PROJECT_DIR, "frontend")

if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
