import logging
from datetime import datetime, timedelta

from database import job_collection, users_collection
from services.notification_service import notify_company_job_expired

logger = logging.getLogger(__name__)


async def check_expired_jobs():
    """Süresi dolmuş ilanları kontrol eder ve kapatır."""
    try:
        now = datetime.utcnow()
        expired = await job_collection.find({
            "expires_at": {"$lt": now.isoformat()},
            "status": "open"
        }).to_list(None)
        
        for job in expired:
            await job_collection.update_one(
                {"_id": job["_id"]},
                {"$set": {"status": "closed"}}
            )
            logger.info("İlan süresi doldu ve kapatıldı: %s", job["_id"])
            
            # Şirkete bildirim gönder
            company_id = job.get("company_id")
            if company_id:
                await notify_company_job_expired(company_id, job["_id"], job["title"])
        
        if expired:
            logger.info("%d ilan süresi doldu ve kapatıldı.", len(expired))
    except Exception as e:
        logger.exception("Süresi dolmuş ilan kontrolü hatası: %s", e)


async def check_auto_renew_jobs():
    """Otomatik yenileme aktif olan ilanları yeniler."""
    try:
        now = datetime.utcnow()
        renew_threshold = now + timedelta(days=7)  # 7 gün kala yenile
        
        auto_renew_jobs = await job_collection.find({
            "expires_at": {"$lt": renew_threshold.isoformat()},
            "auto_renew": True,
            "status": "open"
        }).to_list(None)
        
        for job in auto_renew_jobs:
            new_expiry = datetime.utcnow() + timedelta(days=30)
            await job_collection.update_one(
                {"_id": job["_id"]},
                {"$set": {"expires_at": new_expiry.isoformat()}}
            )
            logger.info("İlan otomatik yenilendi: %s (yeni süre: %s)", job["_id"], new_expiry)
        
        if auto_renew_jobs:
            logger.info("%d ilan otomatik yenilendi.", len(auto_renew_jobs))
    except Exception as e:
        logger.exception("Otomatik ilan yenileme hatası: %s", e)


async def update_daily_analytics():
    """Günlük istatistikleri günceller."""
    try:
        yesterday = datetime.utcnow() - timedelta(days=1)
        date_str = yesterday.strftime("%Y-%m-%d")
        
        jobs = await job_collection.find({"status": "open"}).to_list(None)
        
        for job in jobs:
            analytics = job.get("analytics", {})
            daily_stats = analytics.get("daily_stats", [])
            
            # Bugünün istatistiğini güncelle veya oluştur
            today_stat = next((s for s in daily_stats if s["date"] == date_str), None)
            
            if today_stat:
                # Mevcut günü güncelle
                for stat in daily_stats:
                    if stat["date"] == date_str:
                        stat["views"] = analytics.get("views", 0)
                        stat["applications"] = analytics.get("applications", 0)
                        break
            else:
                # Yeni gün ekle
                daily_stats.append({
                    "date": date_str,
                    "views": analytics.get("views", 0),
                    "applications": analytics.get("applications", 0)
                })
            
            # Son 30 günü tut, eski günleri sil
            cutoff_date = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%d")
            daily_stats = [s for s in daily_stats if s["date"] >= cutoff_date]
            
            await job_collection.update_one(
                {"_id": job["_id"]},
                {"$set": {"analytics.daily_stats": daily_stats}}
            )
        
        logger.info("Günlük istatistikler güncellendi: %d ilan", len(jobs))
    except Exception as e:
        logger.exception("Günlük istatistik güncelleme hatası: %s", e)
