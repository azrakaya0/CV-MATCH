"""Kullanıcı bazlı uygulama içi bildirimler."""

from __future__ import annotations

import uuid
from datetime import datetime

from database import job_collection, notifications_collection, users_collection
from services.company_scope import company_has_hr_scope, job_visible_to_company_user


async def _company_recipients_for_job(company_id: str, job_id: str | None) -> list[str]:
    job_doc = await job_collection.find_one({"_id": job_id}) if job_id else None
    names: set[str] = set()
    async for u in users_collection.find({"role": "company"}):
        cid = u.get("company_id")
        managed = u.get("managed_company_ids") or []
        if cid != company_id and company_id not in managed:
            continue
        if company_has_hr_scope(u):
            names.add(u["username"])
        elif job_doc and job_visible_to_company_user(job_doc, u):
            names.add(u["username"])
    return list(names)


async def create_user_notification(
    *,
    recipient_username: str,
    kind: str,
    message: str,
    job_id: str | None = None,
    job_title: str | None = None,
    company_id: str | None = None,
    conversation_id: str | None = None,
    application_id: str | None = None,
) -> None:
    un = (recipient_username or "").strip()
    if not un:
        return
    now = datetime.utcnow().isoformat()
    await notifications_collection.insert_one(
        {
            "_id": str(uuid.uuid4()),
            "recipient_username": un,
            "kind": kind,
            "company_id": company_id,
            "job_id": job_id,
            "job_title": (job_title or "")[:120] if job_title else None,
            "application_id": application_id,
            "conversation_id": conversation_id,
            "message": message[:500],
            "created_at": now,
            "read_by": [],
        }
    )


async def notify_application_submitted(
    *,
    applicant_username: str,
    job_title: str,
    job_id: str,
) -> None:
    title = (job_title or "İlan")[:120]
    await create_user_notification(
        recipient_username=applicant_username,
        kind="application_submitted",
        message=f"«{title}» ilanına başvurunuz alındı.",
        job_id=job_id,
        job_title=title,
    )


async def notify_new_application_to_company(
    *,
    company_id: str,
    job_id: str,
    job_title: str,
    application_id: str,
    applicant_label: str,
) -> None:
    title = (job_title or "İlan")[:120]
    msg = f"«{title}» ilanına yeni başvuru: {applicant_label}."
    for username in await _company_recipients_for_job(company_id, job_id):
        await create_user_notification(
            recipient_username=username,
            kind="application_new",
            message=msg,
            job_id=job_id,
            job_title=title,
            company_id=company_id,
            application_id=application_id,
        )


async def notify_hr_department_registration_pending(
    *,
    company_id: str,
    company_name: str,
    applicant_username: str,
    applicant_full_name: str,
    department: str,
) -> None:
    from services.company_departments import hr_usernames_for_company

    msg = (
        f"{applicant_full_name or applicant_username} ({department}) "
        f"«{company_name}» için departman hesabı onayı bekliyor."
    )
    for username in await hr_usernames_for_company(company_id):
        await create_user_notification(
            recipient_username=username,
            kind="department_registration_pending",
            message=msg,
            company_id=company_id,
        )


async def notify_new_message(
    *,
    recipient_username: str,
    sender_label: str,
    company_name: str,
    conversation_id: str,
    job_id: str | None = None,
    job_title: str | None = None,
    company_id: str | None = None,
    is_employee_recipient: bool,
) -> None:
    if is_employee_recipient:
        msg = f"{sender_label} ({company_name}) size mesaj gönderdi."
    else:
        msg = f"{sender_label} size mesaj gönderdi."
    await create_user_notification(
        recipient_username=recipient_username,
        kind="message",
        message=msg,
        conversation_id=conversation_id,
        job_id=job_id,
        job_title=job_title,
        company_id=company_id,
    )


async def notify_company_job_expired(company_id: str, job_id: str, job_title: str) -> None:
    """İlan süresi dolduğunda şirkete bildirim gönderir."""
    title = (job_title or "İlan")[:120]
    msg = f"«{title}» ilanının süresi doldu ve otomatik olarak kapatıldı."
    
    async for u in users_collection.find({"role": "company", "company_id": company_id}):
        await create_user_notification(
            recipient_username=u["username"],
            kind="job_expired",
            message=msg,
            job_id=job_id,
            job_title=title,
            company_id=company_id,
        )


async def notify_interview_scheduled(
    *,
    applicant_username: str,
    job_title: str | None = None,
    interview_date: str,
    interview_type: str,
) -> None:
    """Mülakat planlandığında adaya bildirim gönderir."""
    title = (job_title or "İlan")[:120]
    type_label = {
        "screening": "Ön Değerlendirme",
        "technical": "Teknik Mülakat",
        "hr": "İK Mülakatı",
        "final": "Final Mülakat",
    }.get(interview_type, interview_type)
    
    msg = f"«{title}» ilanı için {type_label} mülakatınız planlandı: {interview_date}."
    
    await create_user_notification(
        recipient_username=applicant_username,
        kind="interview_scheduled",
        message=msg,
    )


async def notify_interview_employee_response(
    *,
    applicant_username: str,
    company_id: str,
    job_title: str | None = None,
    response: str,
    interview_date: str,
) -> None:
    """Çalışanın mülakat yanıtını (kabul/red/yeniden planlama) şirkete bildirir."""
    title = (job_title or "İlan")[:120]
    
    response_labels = {
        "accepted": "kabul etti",
        "rejected": "reddetti",
        "reschedule_requested": "farklı zaman talep etti"
    }
    response_text = response_labels.get(response, response)
    
    msg = f"{applicant_username} «{title}» mülakatını {response_text}: {interview_date}."
    
    for username in await _company_recipients_for_job(company_id, None):
        await create_user_notification(
            recipient_username=username,
            kind="interview_employee_response",
            message=msg,
            job_title=title,
            company_id=company_id,
        )


async def notify_interview_reschedule_decision(
    *,
    applicant_username: str,
    company_id: str,
    job_title: str | None = None,
    decision: str,
    new_date: str | None = None,
) -> None:
    """İK'nin yeniden planlama talebine kararını adaya bildirir."""
    title = (job_title or "İlan")[:120]
    
    if decision == "approved" and new_date:
        msg = f"«{title}» mülakatınızın yeniden planlama talebi onaylandı. Yeni tarih: {new_date}."
    elif decision == "rejected":
        msg = f"«{title}» mülakatınızın yeniden planlama talebi reddedildi. Orijinal tarih geçerli."
    else:
        msg = f"«{title}» mülakatınızın yeniden planlama talebi hakkında karar: {decision}."
    
    await create_user_notification(
        recipient_username=applicant_username,
        kind="interview_reschedule_decision",
        message=msg,
        job_title=title,
        company_id=company_id,
    )
