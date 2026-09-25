"""Toplu e-posta gönderme servisi."""

import asyncio
import logging
import uuid
from datetime import datetime

from database import (
    applications_collection,
    bulk_emails_collection,
    companies_collection,
    job_collection,
    users_collection,
)
from services.email_service import send_email, smtp_configured

logger = logging.getLogger(__name__)


async def get_applicant_emails_for_job(
    job_id: str, company_id: str, recipient_filter: str = "all"
) -> list[dict]:
    """İlana başvuran adayların e-posta bilgilerini getir."""
    recipients = []
    
    async for app in applications_collection.find({"job_id": job_id}):
        if app.get("company_id") != company_id:
            continue
            
        if recipient_filter == "favorites" and not app.get("company_favorite"):
            continue
            
        applicant_username = app.get("applicant_username")
        if not applicant_username:
            continue
            
        user = await users_collection.find_one({"username": applicant_username})
        if not user:
            continue
            
        # Kullanıcı e-posta tercihi kontrolü
        if user.get("notify_email") is False:
            continue
            
        email = (user.get("email") or "").strip()
        if not email or "@" not in email:
            continue
            
        recipients.append({
            "username": applicant_username,
            "email": email,
            "full_name": user.get("full_name") or applicant_username,
            "application_id": app["_id"],
        })
    
    return recipients


def render_email_template(body: str, variables: dict) -> str:
    """Mail şablonundaki değişkenleri değiştir."""
    rendered = body
    for key, value in variables.items():
        placeholder = f"{{{key}}}"
        rendered = rendered.replace(placeholder, str(value))
    return rendered


async def send_bulk_email(
    company_id: str,
    job_id: str,
    subject: str,
    body: str,
    recipient_filter: str = "all",
    sender_username: str = None,
) -> dict:
    """Toplu e-posta gönderimi."""
    if not smtp_configured():
        raise RuntimeError("SMTP yapılandırılmadı. E-posta gönderilemez.")
    
    # İş ilanı ve şirket bilgilerini al
    job = await job_collection.find_one({"_id": job_id})
    if not job or job.get("company_id") != company_id:
        raise ValueError("İlan bulunamadı veya yetkiniz yok.")
    
    company = await companies_collection.find_one({"_id": company_id})
    company_name = company.get("name") if company else "Şirket"
    
    # Alıcıları getir
    recipients = await get_applicant_emails_for_job(job_id, company_id, recipient_filter)
    
    if not recipients:
        raise ValueError("Gönderilecek e-posta adresi bulunamadı.")
    
    # Toplu mail kaydı oluştur
    bulk_email_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    
    await bulk_emails_collection.insert_one({
        "_id": bulk_email_id,
        "company_id": company_id,
        "job_id": job_id,
        "subject": subject,
        "body": body,
        "recipient_filter": recipient_filter,
        "total_recipients": len(recipients),
        "sent_count": 0,
        "failed_count": 0,
        "status": "pending",
        "created_at": now,
        "created_by": sender_username,
        "recipients": [r["username"] for r in recipients],
    })
    
    # Async olarak gönder
    asyncio.create_task(
        _send_bulk_email_async(
            bulk_email_id,
            company_id,
            job_id,
            company_name,
            job.get("title") or "İlan",
            subject,
            body,
            recipients,
        )
    )
    
    return {
        "id": bulk_email_id,
        "total_recipients": len(recipients),
        "status": "pending",
    }


async def _send_bulk_email_async(
    bulk_email_id: str,
    company_id: str,
    job_id: str,
    company_name: str,
    job_title: str,
    subject: str,
    body: str,
    recipients: list[dict],
) -> None:
    """Async toplu mail gönderimi."""
    sent_count = 0
    failed_count = 0
    
    for recipient in recipients:
        try:
            # Değişkenleri hazırla
            variables = {
                "aday_adi": recipient["full_name"],
                "aday_kullanici_adi": recipient["username"],
                "ilan_basligi": job_title,
                "sirket_adi": company_name,
            }
            
            rendered_body = render_email_template(body, variables)
            
            # Rate limiting için kısa bekleme
            await asyncio.sleep(0.1)
            
            # E-posta gönder
            success = await asyncio.to_thread(
                send_email,
                recipient["email"],
                subject,
                rendered_body,
            )
            
            if success:
                sent_count += 1
            else:
                failed_count += 1
                
        except Exception as e:
            logger.exception(
                "Toplu mail gönderim hatası: recipient=%s bulk_email=%s",
                recipient["username"],
                bulk_email_id,
            )
            failed_count += 1
    
    # Durumu güncelle
    now = datetime.utcnow().isoformat()
    await bulk_emails_collection.update_one(
        {"_id": bulk_email_id},
        {
            "$set": {
                "sent_count": sent_count,
                "failed_count": failed_count,
                "status": "sent",
                "sent_at": now,
            }
        },
    )
    
    logger.info(
        "Toplu mail gönderimi tamamlandı: bulk_email=%s sent=%d failed=%d",
        bulk_email_id,
        sent_count,
        failed_count,
    )


async def get_bulk_emails_for_company(company_id: str, limit: int = 50) -> list[dict]:
    """Şirketin toplu mail geçmişini getir."""
    results = []
    async for doc in bulk_emails_collection.find(
        {"company_id": company_id}
    ).sort("created_at", -1).limit(limit):
        results.append({
            "id": doc["_id"],
            "job_id": doc.get("job_id"),
            "subject": doc.get("subject"),
            "recipient_filter": doc.get("recipient_filter"),
            "total_recipients": doc.get("total_recipients"),
            "sent_count": doc.get("sent_count"),
            "failed_count": doc.get("failed_count"),
            "status": doc.get("status"),
            "created_at": doc.get("created_at"),
            "sent_at": doc.get("sent_at"),
        })
    return results


async def get_bulk_email_detail(bulk_email_id: str, company_id: str) -> dict | None:
    """Toplu mail detayını getir."""
    doc = await bulk_emails_collection.find_one({"_id": bulk_email_id})
    if not doc or doc.get("company_id") != company_id:
        return None
    
    return {
        "id": doc["_id"],
        "job_id": doc.get("job_id"),
        "subject": doc.get("subject"),
        "body": doc.get("body"),
        "recipient_filter": doc.get("recipient_filter"),
        "total_recipients": doc.get("total_recipients"),
        "sent_count": doc.get("sent_count"),
        "failed_count": doc.get("failed_count"),
        "status": doc.get("status"),
        "created_at": doc.get("created_at"),
        "sent_at": doc.get("sent_at"),
        "recipients": doc.get("recipients", []),
    }
