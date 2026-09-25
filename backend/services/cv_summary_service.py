"""Şirket tarafında aday adı/e-posta göstermeden kısa CV özeti (yetenekler + deneyim yılı)."""

import re
from datetime import datetime

_EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.\w+")
_YEAR_RE = re.compile(r"\b(19[89]\d|20[0-3]\d)\b")


def _current_year() -> int:
    return datetime.utcnow().year


def _strip_pii(text: str) -> str:
    if not text:
        return ""
    t = _EMAIL_RE.sub("", text)
    t = re.sub(r"\+?\d[\d\s().-]{8,}\d", "", t)
    return " ".join(t.split())


def _parse_interval_from_blob(blob: str) -> tuple[int, int] | None:
    """Tek bir deneyim bloğundan (başlangıç, bitiş) yıl aralığı; yoksa None."""
    if not blob:
        return None
    low = blob.lower()
    years = sorted({int(y) for y in _YEAR_RE.findall(blob)})
    cy = _current_year()
    years = [y for y in years if 1980 <= y <= cy + 1]
    ongoing = any(
        k in low
        for k in (
            "devam",
            "present",
            "şu an",
            "su an",
            "halen",
            "güncel",
            "guncel",
            "current",
            "hâlen",
            "halen",
            "bugün",
            "bugun",
        )
    )
    if len(years) >= 2:
        return years[0], years[-1]
    if len(years) == 1:
        end = cy if ongoing else years[0]
        return years[0], max(years[0], min(end, cy))
    return None


def _merge_intervals(intervals: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if not intervals:
        return []
    iv = sorted((min(a, b), max(a, b)) for a, b in intervals)
    out = [iv[0]]
    for s, e in iv[1:]:
        ps, pe = out[-1]
        if s <= pe + 1:
            out[-1] = (ps, max(pe, e))
        else:
            out.append((s, e))
    return out


def _years_from_explicit_phrase(raw_text: str) -> int | None:
    if not raw_text:
        return None
    m = re.search(
        r"\b(\d{1,2})\s*(?:\+?\s*)?(yıl|yillik|yıllık|year|years|yr)\b",
        raw_text[:4000],
        re.IGNORECASE,
    )
    if m:
        y = int(m.group(1))
        if 0 < y <= 50:
            return y
    return None


def _estimate_professional_years(experiences: list, raw_text: str) -> int | None:
    """Takvim yılı aralıklarını birleştirerek toplam yıl; çıkmazsa metindeki 'N yıl' ifadesi."""
    intervals: list[tuple[int, int]] = []
    for e in experiences or []:
        if not isinstance(e, dict):
            continue
        blob = " ".join(str(e.get(k) or "") for k in ("duration", "title", "company", "description"))
        iv = _parse_interval_from_blob(blob)
        if iv:
            intervals.append(iv)

    if not intervals and raw_text:
        iv = _parse_interval_from_blob(raw_text[:5000])
        if iv:
            intervals.append(iv)

    if intervals:
        merged = _merge_intervals(intervals)
        total = sum(max(0, e - s + 1) for s, e in merged)
        total = min(max(total, 1), 45)
        return total

    explicit = _years_from_explicit_phrase(raw_text or "")
    if explicit is not None:
        return explicit

    # Son çare: yapılandırılmış pozisyon sayısı (yıl değil, en az sinyal)
    n = len([x for x in (experiences or []) if isinstance(x, dict) and any(str(x.get(k) or "").strip() for k in ("title", "company", "description"))])
    if n >= 2:
        return min(n + 1, 25)
    return None


def _unique_skills(skills: list) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for s in skills or []:
        if not s or not str(s).strip():
            continue
        t = str(s).strip()
        key = t.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(t)
    return out


def anonymous_cv_summary(cv: dict | None, max_len: int = 220) -> str:
    """
    Yalnızca anonim yetenek listesi ve tahmini toplam profesyonel deneyim (yıl).
    Şirket / pozisyon isimleri ve ham metin burada kullanılmaz.
    """
    if not cv:
        return ""
    d = cv.get("data") or {}
    skills = _unique_skills(d.get("skills") or [])
    raw = d.get("raw_text") or ""
    years = _estimate_professional_years(d.get("experience") or [], raw)

    skill_part = ", ".join(skills[:18]) if skills else ""
    skill_part = _strip_pii(skill_part)

    parts: list[str] = []
    if skill_part:
        parts.append(f"Yetenekler: {skill_part}")
    if years is not None:
        parts.append(f"Yaklaşık {years} yıl profesyonel deneyim")

    out = " · ".join(parts).strip()
    if len(out) > max_len:
        out = out[: max_len - 1] + "…"

    if not out:
        return "Özet oluşturulamadı; CV dosyasını indirip inceleyin."
    return out


def anonymized_cv_label(display_id: int | None, fallback_index: int) -> str:
    if display_id is not None:
        return f"CV #{display_id}"
    return f"Başvuru #{fallback_index}"
