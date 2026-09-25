"""Toplu e-posta gönderme API endpoint'leri."""

import logging

from fastapi import APIRouter, Depends, HTTPException

from database import job_collection
from deps import require_company_scoped
from models import BulkEmailCreate, BulkEmailResponse
from services.bulk_email_service import (
    get_bulk_email_detail,
    get_bulk_emails_for_company,
    send_bulk_email,
)
from services.company_scope import job_visible_to_company_user

router = APIRouter(prefix="/api/bulk-email", tags=["Toplu E-posta"])
logger = logging.getLogger(__name__)


@router.post("/send")
async def send_bulk_email_endpoint(
    body: BulkEmailCreate,
    user: dict = Depends(require_company_scoped),
):
    """Toplu e-posta gönder."""
    company_id = user.get("effective_company_id") or user.get("company_id")
    if not company_id:
        raise HTTPException(400, "Şirket bilgisi bulunamadı.")
    
    # İlan kontrolü
    job = await job_collection.find_one({"_id": body.job_id})
    if not job:
        raise HTTPException(404, "İlan bulunamadı.")
    
    if job.get("company_id") != company_id:
        raise HTTPException(403, "Bu ilana erişiminiz yok.")
    
    if not job_visible_to_company_user(job, user):
        raise HTTPException(403, "Bu ilana erişiminiz yok.")
    
    try:
        result = await send_bulk_email(
            company_id=company_id,
            job_id=body.job_id,
            subject=body.subject,
            body=body.body,
            recipient_filter=body.recipient_filter or "all",
            sender_username=user.get("username"),
        )
        return result
    except RuntimeError as e:
        raise HTTPException(400, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("Toplu mail gönderim hatası")
        raise HTTPException(500, "E-posta gönderim hatası.")


@router.get("/history")
async def get_bulk_email_history(
    limit: int = 50,
    user: dict = Depends(require_company_scoped),
):
    """Toplu e-posta geçmişini getir."""
    company_id = user.get("effective_company_id") or user.get("company_id")
    if not company_id:
        raise HTTPException(400, "Şirket bilgisi bulunamadı.")
    
    limit = max(1, min(limit, 100))
    history = await get_bulk_emails_for_company(company_id, limit)
    return history


@router.get("/{bulk_email_id}")
async def get_bulk_email(
    bulk_email_id: str,
    user: dict = Depends(require_company_scoped),
):
    """Toplu e-posta detayını getir."""
    company_id = user.get("effective_company_id") or user.get("company_id")
    if not company_id:
        raise HTTPException(400, "Şirket bilgisi bulunamadı.")
    
    detail = await get_bulk_email_detail(bulk_email_id, company_id)
    if not detail:
        raise HTTPException(404, "Kayıt bulunamadı.")
    
    return detail
