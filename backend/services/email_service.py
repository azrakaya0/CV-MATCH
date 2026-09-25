import logging
import smtplib
from email.message import EmailMessage

from config import settings

logger = logging.getLogger(__name__)


def smtp_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD)


def send_email(to: str, subject: str, body: str) -> bool:
    if not smtp_configured():
        # Demo modu: SMTP yoksa log'a yaz (sunum için)
        logger.info("=== DEMO E-POSTA ===")
        logger.info("Kime: %s", to)
        logger.info("Konu: %s", subject)
        logger.info("İçerik: %s", body[:200] + "..." if len(body) > 200 else body)
        logger.info("===================")
        return True  # Demo modunda başarılı say
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
        return True
    except Exception:
        logger.exception("E-posta gönderilemedi: %s", to)
        return False
