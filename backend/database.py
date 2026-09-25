import logging

from motor.motor_asyncio import AsyncIOMotorClient
from config import settings

logger = logging.getLogger(__name__)

client = AsyncIOMotorClient(settings.MONGODB_URL)
db = client[settings.DATABASE_NAME]

cv_collection = db["cvs"]
job_collection = db["jobs"]
match_collection = db["matches"]
users_collection = db["users"]
counters_collection = db["counters"]
applications_collection = db["applications"]
companies_collection = db["companies"]
settings_collection = db["app_settings"]
notifications_collection = db["notifications"]
audit_logs_collection = db["audit_logs"]
password_reset_collection = db["password_reset_tokens"]
conversations_collection = db["conversations"]
messages_collection = db["messages"]
bulk_emails_collection = db["bulk_emails"]
candidate_pipelines_collection = db["candidate_pipelines"]
interviews_collection = db["interviews"]
pipeline_stages_collection = db["pipeline_stages"]


async def ensure_indexes() -> None:
    await users_collection.create_index("username", unique=True)
    await users_collection.create_index("username_lc", unique=True, sparse=True)
    await cv_collection.create_index("owner_username")
    await cv_collection.create_index("display_id", unique=True, sparse=True)
    await job_collection.create_index("company_id")
    await job_collection.create_index([("company_id", 1), ("status", 1)])
    await applications_collection.create_index("job_id")
    await applications_collection.create_index([("job_id", 1), ("applicant_username", 1)], unique=True)
    await applications_collection.create_index("company_id")
    await match_collection.create_index("created_at")
    await notifications_collection.create_index([("company_id", 1), ("read", 1)])
    await notifications_collection.create_index([("recipient_username", 1), ("created_at", -1)])
    await audit_logs_collection.create_index([("created_at", -1)])
    await audit_logs_collection.create_index("username")
    # Drop existing index if it exists with different options
    try:
        await password_reset_collection.drop_index("expires_at_1")
    except Exception:
        pass
    await password_reset_collection.create_index("expires_at", expireAfterSeconds=3600)
    await password_reset_collection.create_index("token_hash", unique=True)
    await conversations_collection.create_index([("employee_username", 1), ("updated_at", -1)])
    await conversations_collection.create_index([("company_id", 1), ("updated_at", -1)])
    await conversations_collection.create_index(
        [("company_id", 1), ("company_participant_username", 1), ("updated_at", -1)]
    )
    await messages_collection.create_index([("conversation_id", 1), ("created_at", -1)])
    await bulk_emails_collection.create_index([("company_id", 1), ("created_at", -1)])
    await candidate_pipelines_collection.create_index("application_id", unique=True)
    await candidate_pipelines_collection.create_index([("company_id", 1), ("stage", 1)])
    await interviews_collection.create_index("application_id")
    await interviews_collection.create_index([("company_id", 1), ("scheduled_date", 1)])
    await interviews_collection.create_index([("applicant_username", 1), ("scheduled_date", 1)])
    await pipeline_stages_collection.create_index([("company_id", 1), ("order", 1)])
    logger.info("MongoDB indeksleri hazır.")


async def migrate_username_lc() -> None:
    async for u in users_collection.find({}):
        un = u.get("username")
        if not un:
            continue
        lc = str(un).strip().casefold()
        if u.get("username_lc") != lc:
            await users_collection.update_one({"_id": u["_id"]}, {"$set": {"username_lc": lc}})
    logger.info("Kullanıcı adı (username_lc) alanı güncellendi.")


async def sync_kvkk_document() -> None:
    from config import settings
    from services.kvkk_defaults import DEFAULT_KVKK_HTML

    doc = await settings_collection.find_one({"_id": "kvkk"})
    if not doc:
        await settings_collection.insert_one(
            {
                "_id": "kvkk",
                "html": DEFAULT_KVKK_HTML,
                "version": settings.KVKK_POLICY_VERSION,
            }
        )
        return
    stored_ver = str(doc.get("version") or "1.0")
    if stored_ver != settings.KVKK_POLICY_VERSION:
        await settings_collection.update_one(
            {"_id": "kvkk"},
            {"$set": {"html": DEFAULT_KVKK_HTML, "version": settings.KVKK_POLICY_VERSION}},
        )
        logger.info("KVKK metni sürüm %s olarak güncellendi.", settings.KVKK_POLICY_VERSION)


async def ping_database() -> bool:
    try:
        await client.admin.command("ping")
        return True
    except Exception:
        return False
