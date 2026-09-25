import logging
import os

from database import (
    applications_collection,
    conversations_collection,
    cv_collection,
    match_collection,
    messages_collection,
    notifications_collection,
    users_collection,
)

logger = logging.getLogger(__name__)


async def delete_employee_account(username: str) -> None:
    # Delete CV files and CV records
    async for cv in cv_collection.find({"owner_username": username}):
        fp = cv.get("file_path") or ""
        if fp and os.path.isfile(fp):
            try:
                os.remove(fp)
            except OSError:
                logger.warning("CV dosyası silinemedi: %s", fp)
    await cv_collection.delete_many({"owner_username": username})
    
    # Delete applications
    await applications_collection.delete_many({"applicant_username": username})
    
    # Delete notifications
    await notifications_collection.delete_many({"recipient_username": username})
    
    # Delete conversations where user is the employee
    async for conv in conversations_collection.find({"employee_username": username}):
        # Delete messages in this conversation
        await messages_collection.delete_many({"conversation_id": conv["_id"]})
    await conversations_collection.delete_many({"employee_username": username})
    
    # Delete the user record
    await users_collection.delete_one({"username": username})


async def delete_company_account(username: str) -> None:
    """Şirket kullanıcısı hesabını siler; şirket verileri korunur (İK politikası)."""
    await users_collection.delete_one({"username": username})
