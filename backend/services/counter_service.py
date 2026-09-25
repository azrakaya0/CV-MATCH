from pymongo import ReturnDocument

from config import settings
from database import counters_collection, cv_collection


async def get_next_cv_display_id() -> int:
    await counters_collection.update_one(
        {"_id": "cv_display"},
        {"$setOnInsert": {"seq": settings.CV_DISPLAY_ID_START}},
        upsert=True,
    )
    doc = await counters_collection.find_one_and_update(
        {"_id": "cv_display"},
        {"$inc": {"seq": 1}},
        return_document=ReturnDocument.AFTER,
    )
    return int(doc["seq"])


async def ensure_cv_display_ids() -> None:
    """Eski kayıtlara sıra numarası atanır (1001'den başlayarak)."""
    async for doc in cv_collection.find({"display_id": {"$exists": False}}).sort("created_at", 1):
        nid = await get_next_cv_display_id()
        await cv_collection.update_one({"_id": doc["_id"]}, {"$set": {"display_id": nid}})


def cv_label_for_match(doc: dict, cv_data_name: str | None) -> str:
    did = doc.get("display_id")
    if did is not None:
        return str(did)
    return cv_data_name or doc.get("filename", "CV")
