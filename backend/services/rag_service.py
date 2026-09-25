import re
from sentence_transformers import util
from services.ai_matcher import get_model
from database import cv_collection
from services.cv_analyzer import turkish_lower
from services.skill_classifier import REFERENCE_SKILLS

_generator = None
_tokenizer = None


def _get_generator():
    global _generator, _tokenizer
    if _generator is None:
        from transformers import T5ForConditionalGeneration, T5Tokenizer
        model_name = "google/flan-t5-small"
        _tokenizer = T5Tokenizer.from_pretrained(model_name)
        _generator = T5ForConditionalGeneration.from_pretrained(model_name)
    return _generator, _tokenizer


_CATEGORY_KEYWORDS = {
    "skills": [
        "beceri", "yetenek", "skill", "teknoloji", "araç", "tool",
        "programlama", "program", "yazılım", "software", "teknik",
        "biliyor mu", "kullanıyor mu", "ne biliyor", "ne kullanıyor",
        "hangi dil", "hangi teknoloji", "framework",
    ],
    "education": [
        "eğitim", "üniversite", "okul", "mezun", "lisans", "yüksek lisans",
        "doktora", "fakülte", "bölüm", "diploma", "education", "university",
        "okudu", "okumuş", "bitirdi", "bitirmiş", "degree",
    ],
    "experience": [
        "deneyim", "tecrübe", "iş deneyimi", "çalışma geçmişi", "staj", "pozisyon",
        "görev tanımı", "experience", "work history", "nerede çalıştı", "hangi şirkette çalış",
        "hangi şirketlerde", "şirketlerde çalış", "çalıştığı şirket", "çalıştığı firma",
        "kaç yıl deneyim", "toplam deneyim", "kariyer",
    ],
    "languages": [
        "dil", "diller", "dilleri", "hangi dil", "yabancı dil", "yabanci dil",
        "ingilizce", "almanca", "fransızca", "ispanyolca",
        "arapça", "rusça", "çince", "japonca", "korece", "italyanca",
        "language", "languages", "english", "german", "french",
        "dil seviye", "dil bilgi", "konuştuğu", "fluent", "b1", "b2", "c1", "a1", "a2",
    ],
    "contact": [
        "iletişim", "email", "e-posta", "e-mail", "mail adres", "telefon", "cep",
        "numara", "adres", "contact", "phone", "ulaş", "nasıl ulaş", "whatsapp",
        "reach", "telefon numarası", "contact information", "e posta",
    ],
    "general": [
        "kim", "özet", "profil", "hakkında", "genel", "tanıt",
        "anlat", "özetle", "summary", "who",
    ],
}


_TECH_SET = set(s.lower() for s in REFERENCE_SKILLS)


def _dedup_skills(skills: list[str]) -> list[str]:
    result = []
    skills_lower = [(s, s.lower()) for s in skills]

    for i, (orig, low) in enumerate(skills_lower):
        is_subset = False
        for j, (other_orig, other_low) in enumerate(skills_lower):
            if i != j and low != other_low and low in other_low:
                is_subset = True
                break
        if not is_subset:
            if orig not in result:
                result.append(orig)
    return result


def _is_technical(skill: str) -> bool:
    return skill.lower() in _TECH_SET


_LANG_NAMES = ["ingilizce", "almanca", "fransızca", "ispanyolca",
               "arapça", "rusça", "çince", "japonca", "korece", "italyanca",
               "türkçe", "english", "german", "french"]

_LANG_SYNONYM_GROUPS = [
    frozenset({"ingilizce", "english", "ielts", "toefl"}),
    frozenset({"almanca", "german", "deutsch"}),
    frozenset({"fransızca", "french"}),
    frozenset({"ispanyolca", "spanish"}),
    frozenset({"arapça", "arabic"}),
    frozenset({"rusça", "russian"}),
    frozenset({"çince", "chinese", "mandarin"}),
    frozenset({"japonca", "japanese"}),
    frozenset({"korece", "korean"}),
    frozenset({"italyanca", "italian"}),
    frozenset({"türkçe", "turkish"}),
]


def _lang_tokens_for_query(needle: str) -> set[str]:
    t = turkish_lower(needle.strip())
    for g in _LANG_SYNONYM_GROUPS:
        if t in g:
            return set(g)
    return {t}


def _cv_lists_language(cv_lang_entries: list[str], asked_lang: str) -> bool:
    wanted = _lang_tokens_for_query(asked_lang)
    for entry in cv_lang_entries:
        el = turkish_lower(entry)
        for w in wanted:
            if len(w) >= 3 and w in el:
                return True
            if el in w and len(el) >= 3:
                return True
    return False


# Soruda geçmesi yeterli olmayan — dil sorusu kalıbı gerekir (substring "english" tuzaklarını önlemek için)
_LANG_QUESTION_PATTERNS = [
    re.compile(
        r"(ingilizce|almanca|fransızca|ispanyolca|arapça|rusça|çince|japonca|korece|italyanca|türkçe)"
        r".{0,40}(bilen|biliyor|bilgi|seviye|düzey|yeter|konuş)",
        re.I,
    ),
    re.compile(
        r"(bilen|biliyor|bilgi|seviye|düzey).{0,30}"
        r"(ingilizce|almanca|fransızca|ispanyolca|arapça|rusça|çince|japonca|korece|italyanca|türkçe)",
        re.I,
    ),
    re.compile(
        r"\b(english|german|french|spanish|arabic|russian|chinese|japanese|korean|italian|turkish)\b"
        r".{0,40}\b(speak|speaks|know|knows|fluent|proficiency|level)\b",
        re.I,
    ),
    re.compile(
        r"\b(speak|speaks|know|knows|fluent)\b.{0,40}\b(english|german|french|spanish|arabic|russian|turkish)\b",
        re.I,
    ),
    re.compile(r"\b(who|which)\s+.*\b(speak|knows?)\b.*\b(english|german|french)\b", re.I),
    re.compile(r"\b(english|german|french)\s+bilen\s+aday", re.I),
    re.compile(
        r"\bwho\s+speaks\s+(english|german|french|spanish|turkish|arabic|russian|italian)\b",
        re.I,
    ),
    re.compile(
        r"\b(speak|speaks)\s+(english|german|french|spanish|turkish|arabic)\b.{0,20}\b(candidates?|people|aday)",
        re.I,
    ),
]


def _is_language_question(q_lower: str) -> bool:
    return any(p.search(q_lower) for p in _LANG_QUESTION_PATTERNS)


def _extract_asked_skill_token(q_lower: str) -> str | None:
    """Önce bilinen beceri listesi (en uzun eşleşme), sonra İngilizce/Türkçe kalıplar."""
    for ref in sorted(REFERENCE_SKILLS, key=len, reverse=True):
        rl = ref.lower()
        if len(rl) <= 2:
            pat = r"(?<![a-z0-9ğüşıöç#+])" + re.escape(rl) + r"(?![a-z0-9ğüşıöç#+])"
            if re.search(pat, q_lower, re.I):
                return ref
        else:
            if rl in q_lower or re.search(r"\b" + re.escape(rl) + r"\b", q_lower, re.I):
                return ref

    en_patterns = [
        r"\bwho\s+knows\s+([\w.#+\-/]+)",
        r"\bwho\s+has\s+(?:experience\s+with\s+)?([\w.#+\-/]+)",
        r"\bcandidates?\s+with\s+([\w.#+\-/]+)",
        r"\bpeople\s+who\s+know\s+([\w.#+\-/]+)",
        r"\bwhich\s+candidates?\s+(?:have|know)\s+([\w.#+\-/]+)",
        r"\bknows?\s+([\w.#+\-/]+)\b",
    ]
    for pat in en_patterns:
        m = re.search(pat, q_lower, re.I)
        if m:
            cand = m.group(1).strip().lower()
            if len(cand) >= 2 and cand not in ("the", "any", "all", "this", "that", "with", "and", "who"):
                return cand

    for pat in [
        r"(.+?)\s+bilen(?:ler|ler)?",
        r"(.+?)\s+kullanan(?:lar|ler)?",
        r"(.+?)\s+yapan(?:lar|ler)?",
        r"(.+?)\s+yapabilen(?:ler|ler)?",
    ]:
        m = re.search(pat, q_lower)
        if m:
            skill = m.group(1).strip().lower()
            skill = re.sub(
                r"^(hangi\s+adaylar?|kimler?|hangi|kim|adaylar?|aday|the|those|these|what|which)\s+",
                "",
                skill,
            ).strip()
            skill = re.sub(r"\s+(adaylar?|kimler?|kim|kişiler?|candidates?|people|var)\s*$", "", skill).strip()
            if skill and len(skill) >= 1 and skill not in ("ne", "kaç", "how", "who", "what", "which"):
                return skill
    return None


def _q_lower(question: str) -> str:
    return turkish_lower(question or "")


def _classify_question(question: str) -> str:
    q_lower = _q_lower(question)

    if _years_question(q_lower):
        return "experience"

    if re.search(
        r"\b(hem\s+)?(iletişim|telefon|e-?posta|mail)\b.{0,45}\b(dil|yabancı|languages?)\b|"
        r"\b(dil|yabancı|languages?)\b.{0,45}\b(iletişim|telefon|e-?posta|mail|contact)\b|"
        r"contact.{0,40}\blanguage",
        q_lower,
    ):
        return "general"

    if _is_language_focused_question(q_lower):
        return "languages"

    if _is_contact_focused_question(q_lower) and not re.search(
        r"deneyim|tecrübe|pozisyon|kariyer|iş\s+deneyimi|work\s+history",
        q_lower,
    ):
        return "contact"

    if re.search(
        r"iş\s+deneyimi|deneyimleri|çalışma\s+geçmişi|hangi\s+şirket|şirketlerde\s+çalış|"
        r"hangi\s+şirkette\s+çalış|nerede\s+çalış",
        q_lower,
    ) and not _is_contact_focused_question(q_lower):
        return "experience"

    skill_tok = _extract_asked_skill_token(q_lower)
    if skill_tok:
        st = skill_tok.lower()
        if st in _LANG_NAMES or (st in ("english", "german", "french", "spanish", "turkish", "arabic") and _is_language_question(q_lower)):
            return "languages"
        if _is_language_question(q_lower) and st in _LANG_NAMES:
            return "languages"
        # "bilenler" içinde \bbilen\b eşleşmez; substring yeterli
        skill_q_markers = (
            "bilen",
            "kullanan",
            "yapan",
            "yapabilen",
            "knows",
            " know ",
            "who has",
            "who knows",
            "candidates",
            "people who",
            "adaylar",
            "kimler",
            "skill",
            "teknoloji",
            "technology",
            "proficient in",
            "experience with",
        )
        if any(m in q_lower for m in skill_q_markers):
            return "skills"

    if _is_language_question(q_lower):
        return "languages"

    bilen_match = re.search(r"(\w+)\s+(bilen|kullanan|yapan|yapabilen)\s+(aday|kişi|kim)", q_lower)
    if bilen_match:
        return "skills"

    scores = {}
    for cat, keywords in _CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in q_lower)
        if score > 0:
            scores[cat] = score

    if not scores:
        return "general"

    return max(scores, key=scores.get)


def _is_language_focused_question(q_lower: str) -> bool:
    """İletişimden ayrı: yalnızca yabancı dil / dil listesi niyeti."""
    if re.search(
        r"iletişim.{0,45}\bdil|dil.{0,45}iletişim|contact.{0,45}language|language.{0,45}contact|"
        r"iletişim.{0,45}yabancı|telefon.{0,45}\bdil",
        q_lower,
    ):
        return False
    if _is_language_question(q_lower):
        return True
    return bool(
        re.search(
            r"yabancı\s*dil|yabanci\s*dil|foreign\s*language|dil\s+bilgi|dil\s+yetkin|dil\s+seviye|"
            r"\bdiller(?:i|ler)?\s*(neler|ne|var|bulun|hangi)|\bdiller(?:i|ler)?\b.*\?|"
            r"hangi\s+dil|what\s+languages|language\s+skills|konuştuğu\s+dil|bildiği\s+dil",
            q_lower,
        )
    )


def _is_contact_focused_question(q_lower: str) -> bool:
    if _is_language_focused_question(q_lower):
        return False
    return bool(
        re.search(
            r"iletişim|iletisim|e-?posta|e-mail|mail\s+adres|telefon|cep\s*telefon|"
            r"numara|ulaş|contact\s*(info|details|information)?|phone\s*number|email\s*address|whatsapp|"
            r"iletişim\s+bilgi|iletisim\s+bilgi|bilgileri\s+(neler|ne|var|nedir)|"
            r"(neler|ne|var|nedir).{0,25}(iletişim|iletisim|e-?posta|telefon)|"
            r"aday.{0,20}(mail|e-?posta|telefon|ulaş)",
            q_lower,
        )
    )


def _years_question(q: str) -> bool:
    q = q.lower()
    patterns = [
        r"kaç\s*yıl",
        r"kaç\s*sene",
        r"how\s+many\s+years",
        r"years?\s+of\s+experience",
        r"total\s+experience",
        r"deneyim\s+süresi",
        r"ne\s+kadar\s+süre",
        r"toplam\s+.*\s*yıl",
        r"worked\s+for\s+how\s+long",
        r"how\s+long\s+.*\s+work",
    ]
    return any(re.search(p, q) for p in patterns)


def _parse_years_from_duration(dur: str) -> float | None:
    if not dur:
        return None
    low = dur.lower()
    years = re.findall(r"\b(19\d{2}|20\d{2})\b", dur)
    if len(years) >= 2:
        ys = sorted(int(y) for y in years)
        return float(ys[-1] - ys[0])
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(yıl|year|years?|yr|yrs)\b", low)
    if m:
        return float(m.group(1).replace(",", "."))
    m = re.search(r"(\d+)\s*(ay|month|months)\b", low)
    if m:
        return int(m.group(1)) / 12.0
    return None


def _career_span_years(experiences: list[dict]) -> int | None:
    years = []
    for exp in experiences:
        dur = exp.get("duration") or ""
        for n in re.findall(r"\b(19\d{2}|20\d{2})\b", dur):
            years.append(int(n))
    if len(years) >= 2:
        return max(years) - min(years)
    return None


def _is_companies_question(q_lower: str) -> bool:
    return bool(
        re.search(
            r"hangi\s+şirket|şirketlerde\s+çalış|çalıştığı\s+şirket|çalıştığı\s+firmalar?|"
            r"nerede\s+çalışmış|nerede\s+çalışt|hangi\s+firmalarda|employers?|worked\s+at",
            q_lower,
        )
    )


def _summarize_companies(experiences: list[dict]) -> str:
    seen: list[str] = []
    for exp in experiences:
        c = (exp.get("company") or "").strip()
        if c and c not in seen:
            seen.append(c)
    if not seen:
        return "Kayıtlı şirket adı bulunamadı."
    return ", ".join(f"**{c}**" for c in seen)


def _summarize_experience_years(experiences: list[dict]) -> str:
    if not experiences:
        return "İş deneyimi kaydı yok."
    span = _career_span_years(experiences)
    if span is not None and span > 0:
        return (
            f"CV'deki tarih yıllarına göre kariyer aralığı yaklaşık **{span} yıl** "
            f"({len(experiences)} pozisyon)."
        )
    total = 0.0
    n = 0
    for e in experiences:
        y = _parse_years_from_duration(e.get("duration") or "")
        if y is not None:
            total += y
            n += 1
    if n > 0:
        return f"Pozisyon sürelerinden tahmini toplam **{total:.1f} yıl** ({len(experiences)} kayıt)."
    return (
        f"Süre/tarih çıkarılamadı; **{len(experiences)}** iş deneyimi kaydı var. "
        "Detay aşağıda listelenmiştir."
    )


def _cv_has_skill(asked: str, cv_skills: list[str]) -> bool:
    if not asked or not cv_skills:
        return False
    asked_n = turkish_lower(asked.strip())
    aliases = {
        "js": "javascript",
        "ts": "typescript",
        "py": "python",
    }
    if asked_n in aliases:
        asked_n = aliases[asked_n]
    for s in cv_skills:
        sl = turkish_lower(s)
        if asked_n in sl or sl in asked_n:
            return True
        if asked_n.replace(" ", "") == sl.replace(" ", ""):
            return True
    try:
        model = get_model()
        texts = [asked] + list(cv_skills)
        embs = model.encode(texts, convert_to_tensor=True)
        sims = util.cos_sim(embs[0:1], embs[1:])[0]
        if float(sims.max()) >= 0.58:
            return True
    except Exception:
        pass
    return False


def _answer_from_structured(category: str, cv_data: dict, cv_name: str, question: str = "") -> str | None:

    if category == "skills":
        skills = cv_data.get("skills", [])
        if not skills:
            return f"{cv_name} adlı adayın CV'sinde belirgin bir beceri tespit edilemedi."

        skills = _dedup_skills(skills)

        q_lower = question.lower()
        is_tech_question = any(kw in q_lower for kw in ["teknik", "technical", "programlama", "yazılım", "software"])

        if is_tech_question:
            tech = [s for s in skills if _is_technical(s)]
            non_tech = [s for s in skills if not _is_technical(s)]
            if tech:
                return (
                    f"**{cv_name}** adlı adayın teknik becerileri:\n\n"
                    + ", ".join(tech)
                    + (f"\n\nDiğer beceriler: {', '.join(non_tech)}" if non_tech else "")
                )

        return (
            f"**{cv_name}** adlı adayın becerileri:\n\n"
            + ", ".join(skills)
        )

    elif category == "education":
        edu_list = cv_data.get("education", [])
        if not edu_list:
            return f"{cv_name} adlı adayın CV'sinde eğitim bilgisi bulunamadı."
        lines = []
        for edu in edu_list:
            parts = []
            if edu.get("degree"):
                parts.append(edu["degree"])
            if edu.get("field"):
                parts.append(edu["field"])
            if edu.get("institution"):
                parts.append(f"- {edu['institution']}")
            if edu.get("year"):
                parts.append(f"({edu['year']})")
            if parts:
                lines.append(" ".join(parts))
        return (
            f"**{cv_name}** adlı adayın eğitim bilgileri:\n\n"
            + "\n".join(f"• {l}" for l in lines)
        )

    elif category == "experience":
        exp_list = cv_data.get("experience", [])
        if not exp_list:
            return f"{cv_name} adlı adayın CV'sinde iş deneyimi bulunamadı."
        if question and _is_companies_question(_q_lower(question)):
            return (
                f"**{cv_name}** adlı adayın çalıştığı şirketler: "
                f"{_summarize_companies(exp_list)}"
            )
        if question and _years_question(question.lower()):
            summary = _summarize_experience_years(exp_list)
            return f"**{cv_name}** adlı aday için toplam deneyim özeti: {summary}"
        lines = []
        for exp in exp_list:
            parts = []
            if exp.get("title"):
                parts.append(f"**{exp['title']}**")
            if exp.get("company"):
                parts.append(f"({exp['company']})")
            if exp.get("duration"):
                parts.append(f"- {exp['duration']}")
            if parts:
                line = " ".join(parts)
                if exp.get("description"):
                    line += f"\n  {exp['description'][:150]}"
                lines.append(line)
        return (
            f"**{cv_name}** adlı adayın iş deneyimleri:\n\n"
            + "\n".join(f"• {l}" for l in lines)
        )

    elif category == "languages":
        langs = cv_data.get("languages", [])
        if not langs:
            return (
                f"**{cv_name}** — **yabancı diller:** CV'de dil bilgisi bulunamadı "
                f"(iletişim bilgisi ayrı alandadır)."
            )
        return (
            f"**{cv_name}** — **yabancı diller** (e-posta/telefon burada yer almaz):\n\n"
            + ", ".join(langs)
        )

    elif category == "contact":
        parts = []
        if cv_data.get("email"):
            parts.append(f"E-posta: {cv_data['email']}")
        if cv_data.get("phone"):
            parts.append(f"Telefon: {cv_data['phone']}")
        if cv_data.get("name"):
            parts.append(f"Ad soyad: {cv_data['name']}")
        if not parts:
            return (
                f"**{cv_name}** için kayıtlı **e-posta veya telefon** bulunamadı. "
                f"(Yabancı dil bilgisi ayrı sorulmalıdır.)"
            )
        return (
            f"**{cv_name}** — **iletişim bilgileri:**\n\n"
            + "\n".join(f"• {p}" for p in parts)
        )

    elif category == "general":
        parts = [f"**{cv_name}** adlı adayın özeti:\n"]
        c_lines = []
        if cv_data.get("email"):
            c_lines.append(f"• E-posta: {cv_data['email']}")
        if cv_data.get("phone"):
            c_lines.append(f"• Telefon: {cv_data['phone']}")
        if c_lines:
            parts.append("**İletişim:**\n" + "\n".join(c_lines))
        langs = cv_data.get("languages", [])
        if langs:
            parts.append("**Yabancı diller:**\n• " + ", ".join(langs))
        skills = cv_data.get("skills", [])
        if skills:
            parts.append("**Beceriler (özet):**\n• " + ", ".join(skills[:10]))
        edu = cv_data.get("education", [])
        if edu:
            e = edu[0]
            edu_str = " ".join(filter(None, [e.get("degree"), e.get("field"), e.get("institution")]))
            parts.append(f"**Eğitim (ilk kayıt):**\n• {edu_str}")
        exp = cv_data.get("experience", [])
        if exp:
            parts.append(f"**Deneyim:**\n• {len(exp)} pozisyon")
        return "\n\n".join(parts)

    return None


def _check_specific_skill(question: str, cv_data: dict, cv_name: str) -> str | None:
    q_lower = question.lower()
    skills = cv_data.get("skills", [])
    langs = cv_data.get("languages", [])

    patterns = [
        r"(.+?)\s+biliyor\s*mu",
        r"(.+?)\s+kullanıyor\s*mu",
        r"(.+?)\s+var\s*mı",
        r"(.+?)\s+kullanabiliyor\s*mu",
    ]
    for pat in patterns:
        m = re.search(pat, q_lower)
        if m:
            asked_skill = m.group(1).strip()
            asked_skill = re.sub(r"^(bu kişi|aday|cv sahibi|bu aday)\s*", "", asked_skill)
            if not asked_skill:
                continue
            tok = _extract_asked_skill_token(asked_skill.lower()) or asked_skill
            if _cv_has_skill(tok, skills) or _cv_has_skill(tok, langs):
                return f"Evet, **{cv_name}** adlı adayın CV'sinde **{tok}** ile ilgili kayıt bulunmaktadır."
            return f"Hayır, **{cv_name}** adlı adayın CV'sinde **{tok}** tespit edilemedi."

    if re.search(
        r"\b(does|do|did)\s+(he|she|this\s+person|the\s+candidate|they)\s+know\b",
        q_lower,
    ) or re.search(r"\bknows?\s+[a-z0-9.#+\-/]{2,}", q_lower):
        tok = _extract_asked_skill_token(q_lower)
        if tok and tok.lower() not in _LANG_NAMES:
            if _cv_has_skill(tok, skills) or _cv_has_skill(tok, langs):
                return f"Evet, **{cv_name}** adlı adayın CV'sinde **{tok}** ile ilgili kayıt bulunmaktadır."
            return f"Hayır, **{cv_name}** adlı adayın CV'sinde **{tok}** tespit edilemedi."

    return None


def chunk_text(text: str, chunk_size: int = 120) -> list[str]:
    if not text or not text.strip():
        return []

    lines = text.strip().split("\n")
    chunks = []
    current_chunk = []
    current_len = 0

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        words = stripped.split()
        word_count = len(words)

        if current_len + word_count > chunk_size and current_chunk:
            chunks.append("\n".join(current_chunk))
            current_chunk = [stripped]
            current_len = word_count
        else:
            current_chunk.append(stripped)
            current_len += word_count

    if current_chunk:
        chunks.append("\n".join(current_chunk))

    return chunks


def _chunk_simple_text(text: str, chunk_size: int = 120) -> list[str]:
    """Basit text chunking - kelime sayısına göre bölme."""
    if not text or not text.strip():
        return []
    
    words = text.split()
    chunks = []
    current_chunk = []
    current_len = 0
    
    for word in words:
        if current_len + 1 > chunk_size and current_chunk:
            chunks.append(" ".join(current_chunk))
            current_chunk = [word]
            current_len = 1
        else:
            current_chunk.append(word)
            current_len += 1
    
    if current_chunk:
        chunks.append(" ".join(current_chunk))
    
    return chunks


def _detect_section_from_text(text: str) -> str:
    """Chunk metninden section tipini tespit et."""
    lower = turkish_lower(text)
    
    # İletişim bilgileri
    contact_keywords = ["e-posta", "email", "mail", "telefon", "phone", "cep", "iletişim", "contact", "@", "+90"]
    if any(kw in lower for kw in contact_keywords):
        return "contact"
    
    # İş deneyimi
    exp_keywords = ["deneyim", "tecrübe", "şirket", "company", "çalışt", "worked", "pozisyon", "position", "görev"]
    if any(kw in lower for kw in exp_keywords):
        return "experience"
    
    # Eğitim
    edu_keywords = ["üniversite", "university", "fakülte", "faculty", "mezun", "graduate", "lisans", "yüksek lisans", "doktora", "phd"]
    if any(kw in lower for kw in edu_keywords):
        return "education"
    
    # Beceriler
    skill_keywords = ["beceri", "yetenek", "skill", "teknoloji", "technology", "programlama", "programming", "framework"]
    if any(kw in lower for kw in skill_keywords):
        return "skills"
    
    # Diller
    lang_keywords = ["dil", "language", "ingilizce", "english", "almanca", "german", "fransızca", "french", "yabancı"]
    if any(kw in lower for kw in lang_keywords):
        return "languages"
    
    return "general"


def chunk_text_with_metadata(cv_data: dict, chunk_size: int = 120) -> list[dict]:
    """Structured data kullanarak section-aware chunking - her chunk'a metadata ekle."""
    chunks = []

    # Skills section
    skills = cv_data.get("skills", [])
    if skills:
        skills_text = " ".join(skills)
        skills_chunks = _chunk_simple_text(skills_text, chunk_size)
        for chunk in skills_chunks:
            chunks.append({"text": chunk, "section": "skills"})

    # Experience section
    experiences = cv_data.get("experience", [])
    if experiences:
        exp_text_parts = []
        for exp in experiences:
            parts = []
            if exp.get("title"):
                parts.append(exp["title"])
            if exp.get("company"):
                parts.append(f"({exp['company']})")
            if exp.get("duration"):
                parts.append(f"- {exp['duration']}")
            if exp.get("description"):
                parts.append(exp["description"])
            exp_text_parts.append(" ".join(parts))
        exp_text = "\n".join(exp_text_parts)
        exp_chunks = _chunk_simple_text(exp_text, chunk_size)
        for chunk in exp_chunks:
            chunks.append({"text": chunk, "section": "experience"})

    # Education section
    education = cv_data.get("education", [])
    if education:
        edu_text_parts = []
        for edu in education:
            parts = []
            if edu.get("degree"):
                parts.append(edu["degree"])
            if edu.get("field"):
                parts.append(edu["field"])
            if edu.get("institution"):
                parts.append(f"- {edu['institution']}")
            if edu.get("year"):
                parts.append(f"({edu['year']})")
            edu_text_parts.append(" ".join(parts))
        edu_text = "\n".join(edu_text_parts)
        edu_chunks = _chunk_simple_text(edu_text, chunk_size)
        for chunk in edu_chunks:
            chunks.append({"text": chunk, "section": "education"})

    # Languages section
    languages = cv_data.get("languages", [])
    if languages:
        lang_text = " ".join(languages)
        lang_chunks = _chunk_simple_text(lang_text, chunk_size)
        for chunk in lang_chunks:
            chunks.append({"text": chunk, "section": "languages"})

    # Contact section
    contact_parts = []
    if cv_data.get("email"):
        contact_parts.append(f"E-posta: {cv_data['email']}")
    if cv_data.get("phone"):
        contact_parts.append(f"Telefon: {cv_data['phone']}")
    if cv_data.get("name"):
        contact_parts.append(f"Ad soyad: {cv_data['name']}")
    if contact_parts:
        contact_text = "\n".join(contact_parts)
        contact_chunks = _chunk_simple_text(contact_text, chunk_size)
        for chunk in contact_chunks:
            chunks.append({"text": chunk, "section": "contact"})

    return chunks


def retrieve_chunks(query: str, chunks: list[dict], top_k: int = 5, category_filter: str = None) -> list[dict]:
    """Metadata filtering ile retrieval."""
    if not chunks:
        return []

    # Category filter varsa, chunk'lari filtrele
    filtered_chunks = chunks
    if category_filter:
        # Section metadata varsa kullan
        if all("section" in c for c in chunks):
            # Section mapping
            section_map = {
                "contact": "contact",
                "experience": "experience",
                "education": "education",
                "skills": "skills",
                "languages": "languages",
            }
            target_section = section_map.get(category_filter)
            if target_section:
                # Önce target section chunk'larını al
                target_chunks = [c for c in chunks if c.get("section") == target_section]
                other_chunks = [c for c in chunks if c.get("section") != target_section]
                
                # Yeterli target chunk varsa sadece onları kullan
                if len(target_chunks) >= top_k:
                    filtered_chunks = target_chunks
                else:
                    # Target chunk'ları öncelikle kullan, diğerlerinden ekle
                    filtered_chunks = target_chunks + other_chunks[:top_k - len(target_chunks)]

    model = get_model()
    query_emb = model.encode(query, convert_to_tensor=True)
    chunk_texts = [c["text"] for c in filtered_chunks]
    chunk_embs = model.encode(chunk_texts, convert_to_tensor=True)

    similarities = util.cos_sim(query_emb, chunk_embs)[0]

    scored = []
    for i, sim in enumerate(similarities):
        scored.append({
            **filtered_chunks[i],
            "similarity": round(float(sim), 4),
        })

    scored.sort(key=lambda x: x["similarity"], reverse=True)
    return scored[:top_k]


def _is_garbage(text: str) -> bool:
    if not text or len(text) < 3:
        return True

    words = text.split()
    if len(words) > 5:
        unique = set(words)
        if len(unique) / len(words) < 0.3:
            return True

    if re.search(r"(.{8,})\1{2,}", text):
        return True

    return False


def generate_answer(query: str, context_chunks: list[dict]) -> str:
    if not context_chunks:
        return "Bu soruyla ilgili CV'lerde yeterli bilgi bulunamadı."

    generator, tokenizer = _get_generator()

    context = " ".join(c["text"][:200] for c in context_chunks[:3])
    if len(context) > 800:
        context = context[:800]

    prompt = (
        "Sen bir İK asistanısın. Aşağıdaki kurallara kesinlikle uymalısın:\n"
        "1. YALNIZCA verilen bağlamdan bilgi al, bağlamda yoksa 'bilgi bulunamadı' de.\n"
        "2. Tahmin yürütmek, bilgi uydurmak veya bağlam dışı bilgi eklemek YASAKTIR.\n"
        "3. İletişim bilgisi sorulduğunda deneyim/beceri verme, deneyim sorulduğunda iletişim verme.\n"
        "4. Her kategoriye doğru bilgiyi ver: iletişim→e-posta/telefon, deneyim→iş geçmişi, beceri→teknolojiler.\n"
        "5. Türkçe ve kısa cevap ver.\n\n"
        f"Bağlam: {context}\n\n"
        f"Soru: {query}\n"
        "Cevap:"
    )

    inputs = tokenizer(prompt, return_tensors="pt", max_length=512, truncation=True)
    outputs = generator.generate(
        **inputs,
        max_new_tokens=80,
        do_sample=False,
        num_beams=2,
        repetition_penalty=2.5,
        early_stopping=True,
    )
    answer = tokenizer.decode(outputs[0], skip_special_tokens=True).strip()

    if _is_garbage(answer):
        return None

    return answer


def _dedup_cv_docs(cv_docs: list[dict]) -> list[dict]:
    seen = {}
    for doc in cv_docs:
        data = doc.get("data", {})
        name = (data.get("name") or doc.get("filename", "CV")).strip().lower()
        existing = seen.get(name)
        if existing is None:
            seen[name] = doc
        else:
            old_data = existing.get("data", {})
            new_score = len(data.get("skills", [])) + len(data.get("experience", [])) + len(data.get("education", []))
            old_score = len(old_data.get("skills", [])) + len(old_data.get("experience", [])) + len(old_data.get("education", []))
            if new_score > old_score:
                seen[name] = doc
    return list(seen.values())


def _calc_total_years(experiences: list[dict]) -> int | None:
    years = []
    for exp in experiences:
        dur = exp.get("duration", "")
        nums = re.findall(r"(\d{4})", dur)
        for n in nums:
            years.append(int(n))
    if len(years) >= 2:
        return max(years) - min(years)
    return None


def _answer_multi_cv(category: str, cv_docs: list[dict], question: str) -> str:
    q_lower = question.lower()
    cv_docs = _dedup_cv_docs(cv_docs)

    if category == "skills":
        asked_skill = _extract_asked_skill_token(q_lower)
        if not asked_skill:
            for pat in [r"(.+?)\s+bilen", r"(.+?)\s+kullanan", r"(.+?)\s+yapan"]:
                m = re.search(pat, q_lower)
                if m:
                    asked_skill = m.group(1).strip()
                    asked_skill = re.sub(r"^(hangi adaylar?|kimler?)\s*", "", asked_skill)
                    break

        if asked_skill and asked_skill.lower() not in _LANG_NAMES:
            found = []
            label = asked_skill
            for doc in cv_docs:
                data = doc.get("data", {})
                name = data.get("name") or doc.get("filename", "CV")
                sk = data.get("skills", [])
                if _cv_has_skill(asked_skill, sk):
                    found.append(name)
            named = set(found)
            for doc in cv_docs:
                data = doc.get("data", {})
                name = data.get("name") or doc.get("filename", "CV")
                if name in named:
                    continue
                raw = (data.get("raw_text") or "").lower()
                if raw and label.lower() in raw:
                    found.append(
                        f"{name} (yalnızca ham metinde; beceri listesi çıkarımında yok)"
                    )
                    named.add(name)
            if found:
                return f"**{label}** bilen / CV'sinde bu beceri görünen adaylar:\n\n" + "\n".join(
                    f"• **{n}**" for n in found
                )
            return (
                f"Sistemdeki CV'ler arasında **{label}** becerisi tespit edilemedi. "
                "(Beceri farklı yazılmış veya ham metinde olabilir.)"
            )

        all_skills = {}
        for doc in cv_docs:
            data = doc.get("data", {})
            for s in data.get("skills", []):
                all_skills[s] = all_skills.get(s, 0) + 1
        if all_skills:
            top = sorted(all_skills.items(), key=lambda x: -x[1])[:15]
            lines = [f"• {s} ({c} adayda)" for s, c in top]
            return "Tüm CV'lerdeki en yaygın beceriler:\n\n" + "\n".join(lines)
        return "CV'lerde beceri bilgisi bulunamadı."

    elif category == "languages":
        asked_lang = None
        for lang in _LANG_NAMES:
            if lang in q_lower:
                asked_lang = lang
                break

        if asked_lang:
            found = []
            for doc in cv_docs:
                data = doc.get("data", {})
                name = data.get("name") or doc.get("filename", "CV")
                langs = data.get("languages", [])
                if _cv_lists_language(langs, asked_lang):
                    found.append(name)
            if found:
                return (
                    f"**Yabancı dil** sorusu — **{asked_lang.capitalize()}** bilen adaylar "
                    f"(iletişim bilgisi değil):\n\n"
                    + "\n".join(f"• **{n}**" for n in found)
                )
            else:
                return (
                    f"**Yabancı dil** — {asked_lang} bilen aday bulunamadı "
                    f"(dil listesi CV verisinden okunur)."
                )

        all_langs = {}
        for doc in cv_docs:
            data = doc.get("data", {})
            for l in data.get("languages", []):
                all_langs[l] = all_langs.get(l, 0) + 1
        if all_langs:
            lines = [f"• {l} ({c} aday)" for l, c in sorted(all_langs.items(), key=lambda x: -x[1])]
            return (
                "**Yabancı diller** (e-posta/telefon değil; dil alanından):\n\n" + "\n".join(lines)
            )
        return "CV'lerde yabancı dil bilgisi bulunamadı."

    elif category == "experience":
        if _is_companies_question(q_lower):
            lines = []
            for doc in cv_docs:
                data = doc.get("data", {})
                name = data.get("name") or doc.get("filename", "CV")
                exps = data.get("experience", [])
                if exps:
                    lines.append(f"• **{name}**: {_summarize_companies(exps)}")
                else:
                    lines.append(f"• **{name}**: iş deneyimi kaydı yok")
            if lines:
                return "Çalışılan şirketler:\n\n" + "\n\n".join(lines)
            return "CV'lerde iş deneyimi bulunamadı."

        if _years_question(q_lower):
            lines = []
            for doc in cv_docs:
                data = doc.get("data", {})
                name = data.get("name") or doc.get("filename", "CV")
                exps = data.get("experience", [])
                summ = _summarize_experience_years(exps) if exps else "İş deneyimi yok."
                lines.append(f"• **{name}**: {summ}")
            if lines:
                return "Toplam deneyim süresi özeti:\n\n" + "\n\n".join(lines)
            return "CV'lerde deneyim bilgisi bulunamadı."

        results = []
        for doc in cv_docs:
            data = doc.get("data", {})
            name = data.get("name") or doc.get("filename", "CV")
            exps = data.get("experience", [])
            if exps:
                total_years = _calc_total_years(exps)
                lines_exp = []
                for e in exps:
                    title = e.get("title", "")
                    company = e.get("company", "")
                    dur = e.get("duration", "")
                    parts = []
                    if title:
                        parts.append(title)
                    if company:
                        parts.append(f"({company})")
                    if dur:
                        parts.append(f"[{dur}]")
                    if parts:
                        lines_exp.append("  - " + " ".join(parts))
                header = f"• **{name}** - {len(exps)} pozisyon"
                if total_years:
                    header += f", ~{total_years} yıl (tarih aralığı)"
                results.append(header + "\n" + "\n".join(lines_exp))
        if results:
            return "Adayların deneyim bilgileri:\n\n" + "\n\n".join(results)
        return "CV'lerde deneyim bilgisi bulunamadı."

    elif category == "education":
        results = []
        for doc in cv_docs:
            data = doc.get("data", {})
            name = data.get("name") or doc.get("filename", "CV")
            edus = data.get("education", [])
            if edus:
                edu_lines = []
                for e in edus:
                    edu_str = " ".join(filter(None, [e.get("degree"), e.get("field"), e.get("institution")]))
                    if e.get("year"):
                        edu_str += f" ({e['year']})"
                    edu_lines.append(f"  - {edu_str}")
                results.append(f"• **{name}**\n" + "\n".join(edu_lines))
        if results:
            return "Adayların eğitim bilgileri:\n\n" + "\n\n".join(results)
        return "CV'lerde eğitim bilgisi bulunamadı."

    elif category == "contact":
        lines = []
        for doc in cv_docs:
            data = doc.get("data", {})
            name = data.get("name") or doc.get("filename", "CV")
            bits = []
            if data.get("email"):
                bits.append(f"E-posta: {data['email']}")
            if data.get("phone"):
                bits.append(f"Telefon: {data['phone']}")
            if bits:
                lines.append(f"• **{name}**\n  " + "\n  ".join(bits))
            else:
                lines.append(
                    f"• **{name}**: E-posta/telefon bilgisi yok "
                    f"(PDF çıkarımında bulunamamış olabilir)."
                )
        if lines:
            return (
                "**İletişim** (e-posta/telefon; yabancı dil listesi değildir):\n\n"
                + "\n\n".join(lines)
            )
        return "CV'lerde iletişim bilgisi bulunamadı."

    results = []
    for doc in cv_docs:
        data = doc.get("data", {})
        name = data.get("name") or doc.get("filename", "CV")
        parts = [f"• **{name}**"]
        ci = []
        if data.get("email"):
            ci.append(f"E-posta: {data['email']}")
        if data.get("phone"):
            ci.append(f"Telefon: {data['phone']}")
        if ci:
            parts.append("  **İletişim:** " + " | ".join(ci))
        langs = data.get("languages", [])
        if langs:
            parts.append("  **Yabancı diller:** " + ", ".join(langs))
        skills = _dedup_skills(data.get("skills", []))[:5]
        if skills:
            parts.append("  **Beceriler:** " + ", ".join(skills))
        results.append("\n".join(parts))
    if results:
        return "Aday özeti (**iletişim** ve **yabancı diller** ayrı etiketlidir):\n\n" + "\n\n".join(
            results
        )
    return "Sistemde henüz CV bulunmuyor."


async def ask_single_cv(cv_id: str, question: str) -> dict:
    doc = await cv_collection.find_one({"_id": cv_id})
    if not doc:
        return {"answer": "CV bulunamadı.", "sources": []}

    cv_data = doc.get("data", {})
    disp = doc.get("display_id")
    cv_name = f"CV #{disp}" if disp is not None else (cv_data.get("name") or doc.get("filename", "CV"))
    raw_text = cv_data.get("raw_text", "")

    ql = _q_lower(question)
    if _is_contact_focused_question(ql):
        category = "contact"
    else:
        category = _classify_question(question)

    if category == "contact":
        structured = _answer_from_structured("contact", cv_data, cv_name, question)
        if structured:
            return {"answer": structured, "sources": []}

    if re.search(r"\b(kimler|hangi\s+adaylar?)\b", ql) and category == "skills":
        tok = _extract_asked_skill_token(ql)
        if tok and turkish_lower(tok) not in [turkish_lower(x) for x in _LANG_NAMES]:
            has = _cv_has_skill(tok, cv_data.get("skills", []))
            return {
                "answer": (
                    f"Bu tür sorular **Tüm CV'ler** veya **seçili CV'ler** modunda anlamlıdır. "
                    f"Şu an seçili olan **{cv_name}** için **{tok}** becerisi: "
                    f"{'listedeki verilerde var' if has else 'listede görünmüyor'}."
                ),
                "sources": [],
            }

    if category == "contact":
        return {
            "answer": f"**{cv_name}** için iletişim bilgisi bulunamadı.",
            "sources": [],
        }

    specific = _check_specific_skill(question, cv_data, cv_name)
    if specific and category != "contact":
        text_chunks = chunk_text_with_metadata(cv_data)
        chunks_meta = [{"text": c["text"], "cv_name": cv_name, "cv_id": cv_id, "section": c.get("section", "general")} for c in text_chunks]
        relevant = retrieve_chunks(question, chunks_meta, top_k=3, category_filter=category) if chunks_meta else []
        sources = _build_sources(relevant)
        return {"answer": specific, "sources": sources}

    structured_answer = _answer_from_structured(category, cv_data, cv_name, question)

    if structured_answer and category in ("experience", "contact", "languages", "education", "skills"):
        return {"answer": structured_answer, "sources": []}

    text_chunks = chunk_text_with_metadata(cv_data)
    chunks_meta = [{"text": c["text"], "cv_name": cv_name, "cv_id": cv_id, "section": c.get("section", "general")} for c in text_chunks]
    relevant = retrieve_chunks(question, chunks_meta, top_k=5, category_filter=category) if chunks_meta else []

    if structured_answer:
        answer = structured_answer
    else:
        ai_answer = generate_answer(question, relevant)
        answer = ai_answer if ai_answer else _chunk_based_answer(relevant, cv_name)

    sources = _build_sources(relevant)
    return {"answer": answer, "sources": sources}


async def ask_all_cvs(question: str) -> dict:
    cv_docs = []
    all_chunks = []

    async for doc in cv_collection.find():
        cv_docs.append(doc)
        cv_data = doc.get("data", {})
        cv_name = cv_data.get("name") or doc.get("filename", "CV")
        cv_id = doc["_id"]

        text_chunks = chunk_text_with_metadata(cv_data)
        for c in text_chunks:
            all_chunks.append({"text": c["text"], "cv_name": cv_name, "cv_id": cv_id, "section": c.get("section", "general")})

    if not cv_docs:
        return {"answer": "Sistemde hiç CV bulunamadı.", "sources": []}

    ql = _q_lower(question)
    category = "contact" if _is_contact_focused_question(ql) else _classify_question(question)
    answer = _answer_multi_cv(category, cv_docs, question)
    if category in ("contact", "languages", "experience", "education", "skills"):
        return {"answer": answer, "sources": []}

    relevant = retrieve_chunks(question, all_chunks, top_k=5, category_filter=category) if all_chunks else []
    sources = _build_sources(relevant)

    return {"answer": answer, "sources": sources}


async def ask_selected_cvs(cv_ids: list[str], question: str) -> dict:
    cv_docs = []
    all_chunks = []

    for cv_id in cv_ids:
        doc = await cv_collection.find_one({"_id": cv_id})
        if not doc:
            continue
        cv_docs.append(doc)
        cv_data = doc.get("data", {})
        disp = doc.get("display_id")
        cv_name = f"CV #{disp}" if disp is not None else (cv_data.get("name") or doc.get("filename", "CV"))

        text_chunks = chunk_text_with_metadata(cv_data)
        for c in text_chunks:
            all_chunks.append({"text": c["text"], "cv_name": cv_name, "cv_id": cv_id, "section": c.get("section", "general")})

    if not cv_docs:
        return {"answer": "Seçilen CV'ler bulunamadı.", "sources": []}

    ql = _q_lower(question)
    category = "contact" if _is_contact_focused_question(ql) else _classify_question(question)
    answer = _answer_multi_cv(category, cv_docs, question)
    if category in ("contact", "languages", "experience", "education", "skills"):
        return {"answer": answer, "sources": []}

    relevant = retrieve_chunks(question, all_chunks, top_k=5, category_filter=category) if all_chunks else []
    sources = _build_sources(relevant)

    return {"answer": answer, "sources": sources}


def _build_sources(relevant: list[dict]) -> list[dict]:
    return [
        {
            "cv_name": c["cv_name"],
            "cv_id": c["cv_id"],
            "text": c["text"][:300],
            "similarity": c["similarity"],
        }
        for c in relevant if c.get("similarity", 0) > 0.1
    ]


def _chunk_based_answer(chunks: list[dict], cv_name: str) -> str:
    if not chunks:
        return "Bu soruyla ilgili yeterli bilgi bulunamadı."

    parts = []
    for c in chunks[:3]:
        snippet = c["text"][:250].replace("\n", " ").strip()
        parts.append(f"• {snippet}")

    return (
        f"**{cv_name}** adlı adayın CV'sinden ilgili bilgiler:\n\n"
        + "\n\n".join(parts)
    )
