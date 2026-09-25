import re
from typing import List, Optional
from models import CVData, Education, Experience
from services.job_title_classifier import is_job_title_nlp
from services.skill_classifier import find_skills_in_text


def calculate_completion_score(cv_data: dict) -> dict:
    """CV'nin tamamlanma puanını hesaplar (0-100)."""
    score = 0
    missing = []
    
    # Profil bilgileri (30 puan)
    if cv_data.get("full_name"):
        score += 10
    else:
        missing.append("Ad Soyad")
    
    if cv_data.get("email"):
        score += 10
    else:
        missing.append("E-posta")
    
    if cv_data.get("phone"):
        score += 5
    else:
        missing.append("Telefon")
    
    if cv_data.get("city"):
        score += 5
    else:
        missing.append("Şehir")
    
    # İş deneyimi (30 puan)
    experience = cv_data.get("experience", [])
    if experience and len(experience) > 0:
        score += 30
    else:
        missing.append("İş Deneyimi")
    
    # Eğitim (20 puan)
    education = cv_data.get("education", [])
    if education and len(education) > 0:
        score += 20
    else:
        missing.append("Eğitim")
    
    # Beceriler (10 puan)
    skills = cv_data.get("skills", [])
    if skills and len(skills) > 0:
        score += 10
    else:
        missing.append("Beceriler")
    
    # Diller (5 puan)
    languages = cv_data.get("languages", [])
    if languages and len(languages) > 0:
        score += 5
    else:
        missing.append("Yabancı Diller")
    
    # Profil fotoğrafı (5 puan)
    if cv_data.get("avatar_url"):
        score += 5
    else:
        missing.append("Profil Fotoğrafı")
    
    # Seviye belirleme
    if score >= 90:
        level = "Mükemmel"
        level_color = "green"
    elif score >= 70:
        level = "İyi"
        level_color = "blue"
    elif score >= 50:
        level = "Orta"
        level_color = "yellow"
    else:
        level = "Zayıf"
        level_color = "red"
    
    return {
        "score": score,
        "missing": missing,
        "level": level,
        "level_color": level_color,
        "total_fields": 8,
        "completed_fields": 8 - len(missing)
    }


LANGUAGE_PAIRS = {
    "türkçe": "Türkçe", "turkish": "Türkçe",
    "ingilizce": "İngilizce", "english": "İngilizce",
    "almanca": "Almanca", "german": "Almanca",
    "fransızca": "Fransızca", "french": "Fransızca",
    "ispanyolca": "İspanyolca", "spanish": "İspanyolca",
    "italyanca": "İtalyanca", "italian": "İtalyanca",
    "arapça": "Arapça", "arabic": "Arapça",
    "rusça": "Rusça", "russian": "Rusça",
    "çince": "Çince", "chinese": "Çince", "mandarin": "Çince",
    "japonca": "Japonca", "japanese": "Japonca",
    "korece": "Korece", "korean": "Korece",
    "portekizce": "Portekizce", "portuguese": "Portekizce",
}


DEGREE_MAP = {
    "doktora": 4, "phd": 4, "ph.d": 4, "doctorate": 4,
    "yüksek lisans": 3, "master": 3, "msc": 3, "m.sc": 3, "mba": 3,
    "lisans": 2, "bachelor": 2, "bsc": 2, "b.sc": 2, "b.a": 2,
    "mühendisli": 2, "muhendisli": 2, "engineering": 2,
    "tıp fakülte": 2, "hukuk fakülte": 2, "mimarlık": 2,
    "ön lisans": 1, "associate": 1, "meslek yüksekokulu": 1, "myo": 1,
    "lise": 0, "high school": 0,
}

DEGREE_DISPLAY = {
    "doktora": "Doktora", "phd": "Doktora", "ph.d": "Doktora", "doctorate": "Doktora",
    "yüksek lisans": "Yüksek Lisans", "master": "Yüksek Lisans",
    "msc": "Yüksek Lisans", "m.sc": "Yüksek Lisans", "mba": "MBA",
    "lisans": "Lisans", "bachelor": "Lisans", "bsc": "Lisans",
    "b.sc": "Lisans", "b.a": "Lisans",
    "mühendisli": "Lisans", "muhendisli": "Lisans", "engineering": "Lisans",
    "tıp fakülte": "Lisans", "hukuk fakülte": "Lisans", "mimarlık": "Lisans",
    "ön lisans": "Ön Lisans", "associate": "Ön Lisans",
    "meslek yüksekokulu": "Ön Lisans", "myo": "Ön Lisans",
    "lise": "Lise", "high school": "Lise",
}


def turkish_lower(text: str) -> str:
    result = text
    result = result.replace("İ", "i").replace("I", "ı")
    result = result.replace("Ğ", "ğ").replace("Ü", "ü")
    result = result.replace("Ş", "ş").replace("Ö", "ö")
    result = result.replace("Ç", "ç")
    return result.lower()


def _normalize_ii(text: str) -> str:
    return text.replace("ı", "i")


SECTION_PATTERNS = {
    "education": [
        "eğitim bilgi", "eğitim geçmiş", "öğrenim bilgi",
        "eğitim geçmişi",
        "education", "academic background",
    ],
    "experience": [
        "iş deneyimi", "iş deneyimleri", "is deneyimi",
        "iş deneyim", "is deneyim", "deneyimler", "iş tecrübe",
        "çalışma geçmişi", "çalişma geçmişi", "çalışma geçmiş",
        "iş geçmişi", "is gecmisi", "iş geçmiş",
        "profesyonel deneyim",
        "work experience", "employment", "professional experience",
    ],
    "skills": [
        "beceriler", "yetenekler", "teknik beceri", "teknik yetkinlik",
        "skills", "competencies", "technical skills",
    ],
    "languages": [
        "dil bilgi", "yabancı dil", "yabanci dil", "language",
        "dil yetkinlik",
    ],
    "projects": [
        "projeler", "projects",
    ],
    "about": [
        "hakkında", "hakkimda", "özet", "profil", "summary", "about me",
    ],
    "interests": [
        "ilgi alanları", "ilgi alanlari", "hobiler", "interests", "hobbies",
    ],
    "certificates": [
        "sertifika", "certificate", "lisans ve sertifika",
    ],
    "references": [
        "referanslar", "referans", "kaynakça", "references",
    ],
}

SECTION_SINGLE_WORDS = {
    "education": ["eğitim", "öğrenim", "egitim", "education"],
    "experience": ["deneyim", "tecrübe", "staj", "kariyer", "tecrübeler", "experience", "employment"],
    "skills": ["beceri", "yetenek", "yetkinlik", "skills"],
    "languages": ["diller", "languages"],
    "projects": ["proje", "projects"],
    "certificates": ["sertifika", "certifications"],
    "references": ["referans", "references"],
}


def _is_section_header(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    word_count = len(stripped.split())
    if word_count > 5:
        return False
    if any(c in stripped for c in ".;,@"):
        return False
    if len(stripped) > 50:
        return False
    if re.search(r"\s[-–]\s", stripped) and word_count > 2:
        return False
    if re.search(r"\d{4}", stripped):
        return False
    return True


def find_sections(text: str) -> dict:
    lines = text.split("\n")
    sections = {}
    current_section = "header"
    current_lines = []

    for line in lines:
        lower = turkish_lower(line).strip()
        normalized = _normalize_ii(lower)
        found = None

        if not lower or not _is_section_header(line):
            current_lines.append(line)
            continue

        def _kw_boundary_match(needle, haystack):
            idx = haystack.find(needle)
            if idx < 0:
                return False
            end = idx + len(needle)
            if end < len(haystack) and haystack[end].isalpha():
                return False
            return True

        for section_name, keywords in SECTION_PATTERNS.items():
            for kw in keywords:
                kw_norm = _normalize_ii(kw)
                if (_kw_boundary_match(kw, lower)
                        or _kw_boundary_match(kw_norm, normalized)
                        or _kw_boundary_match(kw_norm.replace(" ", ""), normalized)):
                    found = section_name
                    break
            if found:
                break

        if not found and len(lower) < 30:
            for section_name, keywords in SECTION_SINGLE_WORDS.items():
                for kw in keywords:
                    kw_norm = _normalize_ii(kw)
                    if (lower == kw or lower.startswith(kw + " ")
                            or lower.startswith(kw + ":")
                            or normalized == kw_norm
                            or normalized.startswith(kw_norm + " ")
                            or normalized.startswith(kw_norm + ":")):
                        found = section_name
                        break
                if found:
                    break

        if found:
            text_so_far = "\n".join(current_lines)
            if current_section in sections:
                sections[current_section] += "\n" + text_so_far
            else:
                sections[current_section] = text_so_far
            current_section = found
            current_lines = []
        else:
            current_lines.append(line)

    text_so_far = "\n".join(current_lines)
    if current_section in sections:
        sections[current_section] += "\n" + text_so_far
    else:
        sections[current_section] = text_so_far
    return sections


def extract_email(text: str) -> Optional[str]:
    match = re.search(r"[\w.+-]+@[\w-]+\.[a-zA-Z]{2,6}(?:\.[a-zA-Z]{2,3})?", text)
    if not match:
        return None
    email = match.group(0)
    known_tlds = (".com", ".net", ".org", ".edu", ".gov", ".io", ".co.uk", ".co", ".me", ".tr")
    for tld in known_tlds:
        idx = email.find(tld)
        if idx > 0:
            after = email[idx + len(tld):]
            if after and not after.startswith(".") or (after.startswith(".") and len(after) > 4):
                email = email[:idx + len(tld)]
            break
    return email


def _get_personal_section(text: str) -> str:
    cutoff_words = ["referans", "kaynakça", "references"]
    lines = text.split("\n")
    for i, line in enumerate(lines):
        lower = turkish_lower(line).strip()
        if any(cw in lower for cw in cutoff_words) and len(lower) < 30:
            return "\n".join(lines[:i])
    return text


def extract_phone(text: str) -> Optional[str]:
    personal_text = _get_personal_section(text)

    patterns = [
        r"(?:\+90|0)[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}",
        r"\+\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}",
        r"5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}",
    ]

    for line in personal_text.split("\n"):
        stripped = line.strip()

        lower = turkish_lower(stripped)
        if lower.startswith("tel:") or lower.startswith("tel "):
            continue
        if lower.startswith("cep:") or lower.startswith("cep "):
            pass 

        for pattern in patterns:
            match = re.search(pattern, stripped)
            if match:
                return match.group(0).strip()

    return None


def _split_camelcase_name(text: str) -> Optional[str]:
    parts = re.findall(r"[A-ZÇĞİÖŞÜ][a-zçğıöşü]+", text)
    if 2 <= len(parts) <= 4:
        return " ".join(parts)
    return None


TURKISH_PROVINCES = {
    "adana", "adıyaman", "afyonkarahisar", "ağrı", "amasya", "ankara", "antalya",
    "artvin", "aydın", "balıkesir", "bilecik", "bingöl", "bitlis", "bolu", "burdur",
    "bursa", "çanakkale", "çankırı", "çorum", "denizli", "diyarbakır", "edirne",
    "elazığ", "erzincan", "erzurum", "eskişehir", "gaziantep", "giresun", "gümüşhane",
    "hakkari", "hatay", "ısparta", "isparta", "mersin", "istanbul", "izmir", "kars",
    "kastamonu", "kayseri", "kırklareli", "kırşehir", "kocaeli", "konya", "kütahya",
    "malatya", "manisa", "kahramanmaraş", "mardin", "muğla", "muş", "nevşehir",
    "niğde", "ordu", "rize", "sakarya", "samsun", "siirt", "sinop", "sivas",
    "tekirdağ", "tokat", "trabzon", "tunceli", "şanlıurfa", "uşak", "van", "yozgat",
    "zonguldak", "aksaray", "bayburt", "karaman", "kırıkkale", "batman", "şırnak",
    "bartın", "ardahan", "iğdır", "yalova", "karabük", "kilis", "osmaniye", "düzce",
    "kadıköy", "beşiktaş", "şişli", "üsküdar", "ataşehir", "bakırköy", "kartal",
    "pendik", "ümraniye", "maltepe", "beyoğlu", "çankaya", "keçiören", "mamak",
    "yenimahalle", "etimesgut", "muratpaşa", "nilüfer", "osmangazi", "seyhan",
    "yüreğir", "bornova", "karşıyaka", "konak", "gebze", "izmit", "adapazarı",
    "türkiye", "turkey",
}

LOCATION_WORDS = list(TURKISH_PROVINCES)


def _clean_pdf_artifacts(text: str) -> str:
    text = re.sub(r'[˙˘¨ˆ˜¸˝˛˚ˇ½¼¾]', '', text)
    text = re.sub(r'\s{2,}', ' ', text).strip()
    return text


def _merge_name_fragments(name: str) -> str:
    words = name.split()
    if len(words) <= 2:
        return name
    merged = [words[0]]
    i = 1
    while i < len(words):
        if len(words[i]) <= 2 and i + 1 < len(words) and len(words[i + 1]) <= 3:
            merged.append(words[i] + words[i + 1])
            i += 2
        elif len(words[i]) <= 2 and merged:
            merged[-1] = merged[-1] + words[i]
            i += 1
        else:
            merged.append(words[i])
            i += 1
    return " ".join(merged)


def extract_name(text: str) -> Optional[str]:
    result = _extract_name_inner(text)
    if result:
        result = _merge_name_fragments(result)
    return result


def _extract_name_inner(text: str) -> Optional[str]:
    text = _clean_pdf_artifacts(text)
    lines = text.strip().split("\n")

    skip_labels = [
        "ad soyad", "ad:", "isim", "name", "cv", "resume",
        "özgeçmiş", "curriculum", "kişisel", "iletişim",
        "contact", "personal", "telefon", "mail", "adres",
        "doğum", "medeni", "ehliyet", "askerlik",
        "deneyim", "eğitim", "beceri", "referans", "sertifika",
        "powered by", "tcpdf", "muhasebe", "sorumlu",
        "mühendis", "yönetici", "uzman", "stajyer",
        "programcı", "developer", "engineer", "hakkımda",
        "hakkında", "hakkimda", "profil", "özet", "summary",
        "kısım", "kisim", "restaurant", "hotel", "otel",
        "chef", "komi", "aşçı", "garson", "çalışma",
        "cinsiyet", "cep:", "cep ",
        "üniversite", "universite", "fakülte", "yüksekokul",
        "ltd", "a.ş", "tic",
    ]
    
    section_keywords = []
    for section_list in SECTION_PATTERNS.values():
        section_keywords.extend(section_list)
    for section_list in SECTION_SINGLE_WORDS.values():
        section_keywords.extend(section_list)
    
    all_skip_keywords = skip_labels + section_keywords

    def _is_name_candidate(line_text: str) -> bool:
        if not line_text:
            return False
        lower = turkish_lower(line_text)
        
        if any(kw in lower for kw in all_skip_keywords):
            return False
        
        bad_headers = [
            "about me", "about", "hakkımda", "hakkinda", "hakkında", "profil",
            "cv", "resume", "özgeçmiş", "özgecmis", "summary", "özet"
        ]
        if lower.strip() in bad_headers:
            return False
        if "@" in line_text or re.search(r"\d{3}", line_text):
            return False
        if ":" in line_text:
            return False
        if line_text.count(".") >= 2:
            return False
        lower_norm = _normalize_ii(lower)
        if any(_normalize_ii(loc) in lower_norm for loc in LOCATION_WORDS):
            return False
        if "/" in line_text or "www." in line_text.lower():
            return False
        if len(line_text) > 40:
            return False
        return True

    section_headers = ["kişisel bilgi", "kisisel bilgi", "personal info", "about me"]
    for i, line in enumerate(lines):
        lower = turkish_lower(line).strip()
        if any(sh in lower for sh in section_headers) and len(lower) < 40:
            for j in range(i + 1, min(i + 4, len(lines))):
                next_line = lines[j].strip()
                if next_line and _is_name_candidate(next_line):
                    words = next_line.split()
                    if 2 <= len(words) <= 4 and all(w and (w[0].isupper() or w[0] in "ÇĞİÖŞÜ") for w in words):
                        return next_line
                    break


    for line in lines[:25]:
        line = line.strip()
        if not _is_name_candidate(line):
            continue
        words = line.split()
        if 2 <= len(words) <= 4:
            if all(w[0].isupper() or w[0] in "ÇĞİÖŞÜ" for w in words if w):
                return line


    for i in range(min(6, len(lines))):
        line = lines[i].strip()
        if not line or len(line.split()) != 1:
            continue
        if not (2 <= len(line) <= 20 and line[0].isupper()):
            continue
        if not _is_name_candidate(line):
            continue

        if i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            if (next_line and len(next_line.split()) == 1
                    and 2 <= len(next_line) <= 20
                    and next_line[0].isupper()
                    and _is_name_candidate(next_line)):
                combined = f"{line} {next_line}"
                if _is_name_candidate(combined):
                    return combined

    for line in lines[:20]:
        line = line.strip()
        if not line or len(line) > 30:
            continue
        if not _is_name_candidate(line):
            continue
        words = line.split()
        if len(words) == 1 and len(line) > 3:
            split_name = _split_camelcase_name(line)
            if split_name:
                return split_name

    for line in lines[:25]:
        line = line.strip()
        if not line:
            continue
        if _is_name_candidate(line):
            words = line.split()
            if 2 <= len(words) <= 4 and all(w and (w[0].isupper() or w[0] in "ÇĞİÖŞÜ") for w in words):
                return line

    return None


def extract_skills(text: str) -> List[str]:
    return find_skills_in_text(text)


_SKILL_REJECT = re.compile(
    r"(19|20)\d{2}\s*[-–]|"
    r"(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)"
    r"\s+(19|20)\d{2}|"
    r"(january|february|march|april|may|june|july|august|september|october|november|december)",
    re.IGNORECASE,
)

_SKILL_VERB_REJECT = re.compile(
    r"\b(yaptım|ettim|sağladım|gerçekleştir|oluşturdum|çalıştım|geliştirdim|"
    r"yönettim|çözdüm|kavuşturdum|düzenledim|aldım|verdim|kullandım|"
    r"edindim|tasarladım|kodladım|hazırladım|başladım|sorumlu oldum|"
    r"görev aldım|katkı sağladım|devredildi|tamamlandı|"
    r"analiz|optimize|entegre|şekilde|kapsamında|sürecinde|"
    r"doğrultusunda|amacıyla|platformlardan)\b",
    re.IGNORECASE,
)


_SECTION_HEADER_REJECT = re.compile(
    r"^(profesyonel deneyim|iş deneyim|is deneyim|deneyimler|deneyim|"
    r"iş geçmişi|çalışma geçmişi|work experience|employment|experience|"
    r"eğitim bilgi|eğitim geçmiş|eğitim|öğrenim|education|academic|"
    r"beceriler|yetenekler|skills|technical skills|competencies|"
    r"dil bilgi|yabancı dil|language|languages|diller|"
    r"projeler|projects|sertifika|sertifikalar|certificate|certifications|"
    r"hakkında|hakkımda|hakkimda|özet|profil|summary|about|about me|"
    r"ilgi alanları|hobiler|interests|hobbies|"
    r"referans|referanslar|references|kişisel bilgi|kişisel bilgiler|personal|"
    r"tecrübe|kariyer|staj|iletişim|contact|"
    r"mutfak personeli|imalathane personeli|servis personeli|"
    r"barista|benim hakkımda|"
    r"data science|devops|devops & tools|ai & deep learning|"
    r"web development|software development|tools|frameworks)$",
    re.IGNORECASE,
)

_CITY_NAMES = TURKISH_PROVINCES


def _is_valid_skill_item(item: str, person_name: str = "") -> bool:
    if not item or len(item) < 2 or len(item) > 40:
        return False
    if _SKILL_REJECT.search(item):
        return False
    if _SKILL_VERB_REJECT.search(item):
        return False
    if re.fullmatch(r"[\d\s./-]+", item):
        return False
    if item.endswith((".", "!", "?", ",")):
        return False
    if "." in item and len(item) > 10:
        return False
    if ";" in item:
        return False
    if len(item.split()) > 5:
        return False
    if "|" in item and re.search(r"(19|20)\d{2}", item):
        return False

    item_lower = turkish_lower(item).strip()

    if _SECTION_HEADER_REJECT.match(item_lower):
        return False

    if item_lower in _CITY_NAMES:
        return False

    if person_name:
        name_lower = turkish_lower(person_name).strip()
        if item_lower == name_lower or item_lower in name_lower:
            return False
        name_parts = name_lower.split()
        if len(name_parts) >= 2 and all(p in item_lower for p in name_parts):
            return False

    if re.search(r"(19|20)\d{2}", item):
        return False

    return True


def _parse_section_items(section_text: str) -> List[str]:
    if not section_text or not section_text.strip():
        return []

    text = section_text.strip()
    raw_items = []

    has_commas = "," in text and text.count(",") >= 2
    has_bullets = bool(re.search(r"[•·■▪►\-–]", text))

    if has_commas and not has_bullets:
        for part in re.split(r"[,;|]", text):
            part = part.strip().strip("•·■▪►- ").strip()
            if part:
                raw_items.append(part)
    elif has_bullets:
        for part in re.split(r"[•·■▪►\n]", text):
            part = part.strip().strip("- –").strip()
            if part:
                for sub in re.split(r"[,;|]", part):
                    sub = sub.strip()
                    if sub:
                        raw_items.append(sub)
    else:
        for line in text.split("\n"):
            line = line.strip().strip("•·■▪►- –").strip()
            if not line or len(line) > 80:
                continue
            if "," in line and line.count(",") >= 2:
                for sub in line.split(","):
                    sub = sub.strip()
                    if sub:
                        raw_items.append(sub)
            elif line:
                raw_items.append(line)

    items = [it for it in raw_items if _is_valid_skill_item(it)]
    return list(dict.fromkeys(items))


def extract_skills_from_section(text: str, sections: dict, person_name: str = "") -> List[str]:
    section_skills = []

    skills_text = sections.get("skills", "")
    if skills_text and len(skills_text.strip()) > 5:
        raw = _parse_section_items(skills_text)
        section_skills = [s for s in raw if _is_valid_skill_item(s, person_name)]

    dict_skills = extract_skills(text)

    combined = list(section_skills)
    section_lower = {turkish_lower(s) for s in section_skills}
    for s in dict_skills:
        sl = turkish_lower(s)
        if sl not in section_lower and _is_valid_skill_item(s, person_name):
            combined.append(s)

    return combined


FIELD_KEYWORDS = [
    "mühendisliği", "muhendisligi", "mühendislik", "muhendislik",
    "bilgisayar", "elektrik", "elektronik", "makine", "inşaat",
    "endüstri", "yazılım", "software", "computer",
    "işletme", "iktisat", "ekonomi", "hukuk", "tıp",
    "hemşirelik", "eczacılık", "mimarlık", "psikoloji",
    "sosyoloji", "iletişim", "matematik", "fizik",
    "kimya", "biyoloji", "tarih", "edebiyat",
    "engineering", "science", "business", "law", "medicine",
    "programcılığı", "yönetimi",
    "aşçılık", "turizm", "gastronomi", "mutfak sanatları",
    "adalet", "hukuk", "ulaştırma", "işletmeciliği",
    "hemşirelik", "laborant",
]

SECTION_HEADER_WORDS = [
    "eğitim", "deneyim", "beceri", "yetenek", "dil", "referans",
    "sertifika", "proje", "hakkında", "hakkımda", "özet", "profil",
]


def _find_universities(text: str) -> List[dict]:
    univ_words = [
        "üniversite", "universite", "university", "college",
        "institut", "fakülte", "fakulte",
        "yüksekokul", "yuksekokul",
    ]
    results = []
    lines = text.split("\n")

    date_clean = re.compile(
        r"^\d{1,2}[./]\d{2,4}\s*[-–]\s*(?:\d{1,2}[./])?\d{2,4}\s*",
        re.IGNORECASE,
    )
    date_clean2 = re.compile(
        r"^\d{1,2}[./]\d{2,4}\s*[-–]\s*(?:devam|halen|günümüz|present)\s*",
        re.IGNORECASE,
    )

    edu_skip_words = ["doğum", "dogum", "doğum tarihi", "birth"]

    for i, line in enumerate(lines):
        lower = turkish_lower(line)
        if any(sk in lower for sk in edu_skip_words):
            continue
        if not any(w in lower for w in univ_words):
            continue

        clean_line = line.strip()
        date_m = date_clean.match(clean_line) or date_clean2.match(clean_line)
        year_info = None
        if date_m:
            year_info = date_m.group(0).strip()
            clean_line = clean_line[date_m.end():].strip()


        institution = clean_line
        if i > 0:
            prev = lines[i - 1].strip()
            prev_lower = turkish_lower(prev)

            merge_skip = ["mezuniyet", "tahmini", "haziran", "eylül",
                          "ocak", "şubat", "mart", "nisan", "mayıs",
                          "temmuz", "ağustos", "ekim", "kasım", "aralık",
                          "eğitim", "öğrenim", "education"]
            is_desc = prev.endswith((".", ",", ";")) or len(prev.split()) > 5
            if (prev and 3 < len(prev) < 60
                    and not is_desc
                    and not any(w in prev_lower for w in univ_words)
                    and not any(dk in prev_lower for dk in DEGREE_MAP)
                    and not any(ms in prev_lower for ms in merge_skip)
                    and not re.search(r"(19|20)\d{2}", prev)):
                institution = f"{prev} {clean_line}"

        edu = {"institution": institution}
        if year_info:
            edu["year"] = year_info

        nearby_lines = lines[max(0, i - 3): i + 4]
        nearby_text = "\n".join(nearby_lines)
        nearby_lower = turkish_lower(nearby_text)

        after_lines = lines[i + 1: i + 4] if i + 1 < len(lines) else []
        before_lines = lines[max(0, i - 3): i]
        after_text = "\n".join(after_lines)
        before_text = "\n".join(before_lines)

        year_full = re.compile(
            r"(?:\d{1,2}[./])?"
            r"(?:(?:" + MONTH_PATTERN + r")\s*)?"
            r"((?:19|20)\d{2})\s*[-–]\s*"
            r"(?:\d{1,2}[./])?"
            r"(?:(?:" + MONTH_PATTERN + r")\s*)?"
            r"((?:19|20)\d{2}|devam|halen|günümüz|tahmini)?",
            re.IGNORECASE,
        )
        year_single = re.compile(r"((?:19|20)\d{2})\s*[-–]?\s*$")

        ym = year_full.search(after_text) or year_single.search(after_text)
        if ym:
            edu["year"] = ym.group(0).strip()
        elif not edu.get("year"):
            ym = year_full.search(before_text) or year_single.search(before_text)
            if ym:
                edu["year"] = ym.group(0).strip()

        for degree_key in DEGREE_MAP:
            if degree_key in nearby_lower:
                edu["degree"] = DEGREE_DISPLAY.get(degree_key, degree_key.title())
                break

        for nearby_line in nearby_lines:
            nl = turkish_lower(nearby_line.strip())
            if nl == lower.strip():
                continue
            nl_norm = _normalize_ii(nl)
            if any(nl_norm == _normalize_ii(sh) or nl_norm.startswith(_normalize_ii(sh))
                   for sh in SECTION_HEADER_WORDS if len(nl) < 20):
                continue
            if any(fw in nl for fw in FIELD_KEYWORDS):
                edu["field"] = nearby_line.strip()
                break

        if not edu.get("field"):
            for fw in FIELD_KEYWORDS:
                if fw in lower:
                    edu["field"] = line.strip()
                    break

        results.append(edu)
    return results


SCHOOL_KEYWORDS = [
    "üniversite", "universite", "university", "college",
    "institut", "fakülte", "fakulte",
    "yüksekokul", "yuksekokul",
    "lisesi", "lise", "high school",
    "meslek okul", "teknik okul",
    "açıköğretim", "acikogretim",
]


def _parse_education_from_text(search_text: str) -> List[dict]:
    lines = [l.strip() for l in search_text.split("\n") if l.strip()]
    results = []
    used = set()

    year_pattern = r"(?:\d{1,2}[./])?((?:19|20)\d{2})\s*[-–]\s*(?:\d{1,2}[./])?((?:19|20)\d{2}|devam|halen|günümüz)"

    edu_skip = ["doğum", "dogum", "doğum tarihi", "birth"]

    for i, line in enumerate(lines):
        if i in used:
            continue
        lower = turkish_lower(line)

        if any(sk in lower for sk in edu_skip):
            continue

        is_school = any(sw in lower for sw in SCHOOL_KEYWORDS)
        has_field = any(fw in lower for fw in FIELD_KEYWORDS)
        has_degree = any(dk in lower for dk in DEGREE_MAP)

        if not (is_school or has_field or has_degree):
            continue

        used.add(i)
        edu = {}

        if is_school:
            institution = line.strip()
            if i > 0 and (i - 1) not in used:
                prev = lines[i - 1].strip()
                prev_lower = turkish_lower(prev)
                merge_skip = ["mezuniyet", "tahmini", "eğitim", "öğrenim",
                              "education", "haziran", "eylül", "ocak", "şubat",
                              "mart", "nisan", "mayıs", "temmuz", "ağustos",
                              "ekim", "kasım", "aralık"]
                if (prev and 3 < len(prev) < 60
                        and not any(sw in prev_lower for sw in SCHOOL_KEYWORDS)
                        and not any(dk in prev_lower for dk in DEGREE_MAP)
                        and not re.search(r"(19|20)\d{2}", prev)
                        and not any(fw in prev_lower for fw in FIELD_KEYWORDS)
                        and not any(ms in prev_lower for ms in merge_skip)):
                    institution = f"{prev} {institution}"
                    used.add(i - 1)
            edu["institution"] = institution
        if has_field:
            edu["field"] = line.strip()
        if has_degree:
            for dk in DEGREE_MAP:
                if dk in lower:
                    edu["degree"] = DEGREE_DISPLAY.get(dk, dk.title())
                    break

        for j in range(max(0, i - 3), min(len(lines), i + 4)):
            if j == i or j in used:
                continue
            nl = turkish_lower(lines[j])
            jline = lines[j].strip()

            if not edu.get("year"):
                ym = re.search(year_pattern, nl, re.IGNORECASE)
                if ym:
                    edu["year"] = ym.group(0)

            if not edu.get("institution") and any(sw in nl for sw in SCHOOL_KEYWORDS):
                edu["institution"] = jline
                used.add(j)

            if not edu.get("field") and any(fw in nl for fw in FIELD_KEYWORDS):
                nl_norm = _normalize_ii(nl)
                is_header = any(
                    nl_norm.strip() == _normalize_ii(sh) or nl_norm.strip().startswith(_normalize_ii(sh) + " ")
                    for sh in SECTION_HEADER_WORDS
                ) and len(jline) < 20
                if not is_header:
                    edu["field"] = jline
                    used.add(j)

            if not edu.get("degree"):
                for dk in DEGREE_MAP:
                    if dk in nl:
                        edu["degree"] = DEGREE_DISPLAY.get(dk, dk.title())
                        break

        if edu.get("institution") or edu.get("degree") or edu.get("field"):
            results.append(edu)

    return results


def _parse_education_section_grouped(edu_text: str) -> List[dict]:
    raw_lines = [l.strip() for l in edu_text.split("\n") if l.strip()]

    lines = []
    idx = 0
    while idx < len(raw_lines):
        line = raw_lines[idx]
        if idx + 1 < len(raw_lines) and re.search(r"(?:19|20)\d{2}\s*[-–]\s*$", line):
            lines.append(line + raw_lines[idx + 1])
            idx += 2
        else:
            lines.append(line)
            idx += 1

    results = []
    edu_skip = ["doğum", "dogum", "birth", "sertifika", "certificate"]

    _DEVAM_ALTS = r"devam(?:\s+ediyor|\s+eden)?"
    year_pat = re.compile(
        r"(?:(?:" + MONTH_PATTERN + r")\s*)?"
        r"((?:19|20)\d{2})\s*[-–]\s*"
        r"(?:(?:" + MONTH_PATTERN + r")\s*)?"
        r"((?:19|20)\d{2}|" + _DEVAM_ALTS + r"|halen|günümüz|present|tahmini|$)",
        re.IGNORECASE,
    )
    date_full = re.compile(
        r"(?:\d{1,2}[./])?"
        r"(?:(?:" + MONTH_PATTERN + r")\s*)?"
        r"((?:19|20)\d{2})\s*[-–]\s*"
        r"(?:\d{1,2}[./])?"
        r"(?:(?:" + MONTH_PATTERN + r")\s*)?"
        r"((?:19|20)\d{2}|" + _DEVAM_ALTS + r"|halen|günümüz|tahmini)?",
        re.IGNORECASE,
    )

    used = set()
    i = 0
    while i < len(lines):
        if i in used:
            i += 1
            continue

        line = lines[i]
        lower = turkish_lower(line)

        if any(sk in lower for sk in edu_skip):
            i += 1
            continue

        is_school = any(sw in lower for sw in SCHOOL_KEYWORDS)
        has_field = any(fw in lower for fw in FIELD_KEYWORDS)
        has_degree = any(dk in lower for dk in DEGREE_MAP)
        has_date = bool(year_pat.search(line) or date_full.search(line))

        if not (is_school or has_field or has_degree or has_date):
            i += 1
            continue

        edu = {}
        used.add(i)

        if has_date:
            dm = date_full.search(line) or year_pat.search(line)
            if dm:
                edu["year"] = dm.group(0)
                if not is_school and not has_field and not has_degree:
                    pre = line[:dm.start()].strip().rstrip("(- –").strip()
                    post = line[dm.end():].strip().lstrip(")- –").strip()
                    remaining = pre or post
                    if remaining and len(remaining) > 3 and len(remaining) < 80:
                        remaining = re.sub(r"^\(|\)$", "", remaining).strip()
                        if remaining:
                            edu["field"] = remaining

        if is_school:
            institution = line
            if has_date and dm:
                pre_inst = line[:dm.start()].strip().rstrip("(- –").strip()
                post_inst = line[dm.end():].strip().lstrip(")- –").strip()
                if pre_inst and len(pre_inst) > 3:
                    institution = pre_inst
                elif post_inst and len(post_inst) > 3:
                    institution = post_inst
            if i > 0 and (i - 1) not in used:
                prev_line = lines[i - 1].strip()
                prev_low = turkish_lower(prev_line)
                is_phone_or_email = bool(re.match(r"^[\d\s\-+().]+$", prev_line)) or "@" in prev_line
                is_prev_meta = (any(sk in prev_low for sk in edu_skip)
                                or bool(year_pat.search(prev_line) or date_full.search(prev_line))
                                or any(sw in prev_low for sw in SCHOOL_KEYWORDS)
                                or len(prev_line) < 3 or len(prev_line) > 60
                                or is_phone_or_email)
                if not is_prev_meta and not prev_line.endswith((".", ",", ";")):
                    institution = prev_line + " " + institution
            edu["institution"] = institution
        if has_field and not is_school:
            field_line = line
            if has_date and dm:
                pre_f = line[:dm.start()].strip().rstrip("(- –").strip()
                post_f = line[dm.end():].strip().lstrip(")- –").strip()
                field_line = pre_f if pre_f and len(pre_f) > 3 else post_f
            if field_line:
                edu["field"] = field_line
        if has_degree:
            for dk in DEGREE_MAP:
                if dk in lower:
                    edu["degree"] = DEGREE_DISPLAY.get(dk, dk.title())
                    break

        for j in range(i + 1, min(i + 5, len(lines))):
            if j in used:
                continue
            nline = lines[j].strip()
            nlow = turkish_lower(nline)
            if any(sk in nlow for sk in edu_skip):
                continue

            n_school = any(sw in nlow for sw in SCHOOL_KEYWORDS)
            n_field = any(fw in nlow for fw in FIELD_KEYWORDS)
            n_degree = any(dk in nlow for dk in DEGREE_MAP)
            n_date = bool(year_pat.search(nline) or date_full.search(nline))

            inst_already_set = bool(edu.get("institution"))

            if n_school and inst_already_set:
                break

            if n_school and not inst_already_set:
                inst = nline
                if j > 0 and (j - 1) not in used and j - 1 != i:
                    mid = lines[j - 1].strip()
                    mid_low = turkish_lower(mid)
                    if (mid and 3 < len(mid) < 60
                            and not any(sw in mid_low for sw in SCHOOL_KEYWORDS)
                            and not bool(year_pat.search(mid) or date_full.search(mid))
                            and not mid.endswith((".", ",", ";"))):
                        inst = mid + " " + nline
                        used.add(j - 1)
                edu["institution"] = inst
                used.add(j)
            elif n_field and not edu.get("field"):
                field_text = nline
                if n_date and not edu.get("year"):
                    fdm = date_full.search(nline) or year_pat.search(nline)
                    if fdm:
                        edu["year"] = fdm.group(0)
                        ft = nline[:fdm.start()].strip().rstrip("(- –").strip()
                        if not ft:
                            ft = nline[fdm.end():].strip().lstrip(")- –").strip()
                        if ft:
                            field_text = ft
                edu["field"] = field_text
                used.add(j)
            elif n_degree and not edu.get("degree"):
                for dk in DEGREE_MAP:
                    if dk in nlow:
                        edu["degree"] = DEGREE_DISPLAY.get(dk, dk.title())
                        break
                used.add(j)
            elif n_date and not edu.get("year"):
                dm = date_full.search(nline) or year_pat.search(nline)
                if dm:
                    edu["year"] = dm.group(0)
                used.add(j)

        if edu.get("institution") or edu.get("degree") or edu.get("field"):
            results.append(edu)

        i += 1

    return results


def extract_education(text: str, sections: dict) -> List[Education]:
    edu_text = sections.get("education", "")
    all_parsed = []

    if edu_text and len(edu_text.strip()) > 10:
        all_parsed = _parse_education_section_grouped(edu_text)
        if not all_parsed:
            all_parsed = _parse_education_from_text(edu_text)

    univ_results = _find_universities(text)
    for ur in univ_results:
        inst = ur.get("institution", "")
        already_found = any(
            inst and (inst in (p.get("institution", "") or "")
                      or (p.get("institution", "") or "") in inst)
            for p in all_parsed
        )
        if not already_found:
            all_parsed.append(ur)

    if not all_parsed:
        all_parsed = _parse_education_from_text(text)

    seen_entries = []
    deduped = []
    for p in all_parsed:
        inst = turkish_lower(p.get("institution", "") or "").strip()
        field = turkish_lower(p.get("field", "") or "").strip()
        year = (p.get("year", "") or "").strip()
        if not inst:
            deduped.append(p)
            continue
        is_dup = False
        for si, sf, sy in seen_entries:
            inst_match = inst in si or si in inst
            if inst_match and (field == sf or (year and year == sy)):
                is_dup = True
                break
        if is_dup:
            continue
        seen_entries.append((inst, field, year))
        deduped.append(p)

    educations = [Education(**p) for p in deduped] if deduped else []

    if not educations:
        text_lower = turkish_lower(text)
        for degree_key in DEGREE_MAP:
            if degree_key in text_lower:
                educations.append(Education(degree=DEGREE_DISPLAY.get(degree_key, degree_key.title())))
                break

    return educations


MONTH_PATTERN = (
    r"(?:ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|"
    r"eylül|ekim|kasım|aralık|"
    r"january|february|march|april|may|june|july|august|"
    r"september|october|november|december|"
    r"jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:\.)?"
)

DATE_RANGE_PATTERN = (
    r"(?:\d{1,2}[./])?"
    r"(?:\d{1,2}\s+)?"
    r"(?:" + MONTH_PATTERN + r"\s*)?"
    r"((?:19|20)\d{2})\s*[-–]\s*"
    r"(?:\d{1,2}[./])?"
    r"(?:\d{1,2}\s+)?"
    r"(?:" + MONTH_PATTERN + r"\s*)?"
    r"((?:19|20)\d{2}|(?:halen|günümüz|gunumuz|present|current|mevcut(?:\s+durum)?|devam(?:\s+ediyor|\s+eden)?))"
)

_DATE_RANGE_RE = re.compile(DATE_RANGE_PATTERN, re.IGNORECASE)
_STANDALONE_DATE_RE = re.compile(
    r"^(?:(?:" + MONTH_PATTERN + r")\s+)?((?:19|20)\d{2})\s*$",
    re.IGNORECASE,
)
_PAREN_DATE_RE = re.compile(
    r"\(\s*(?:(?:" + MONTH_PATTERN + r")\s*)?((?:19|20)\d{2})\s*\)",
    re.IGNORECASE,
)
_OPEN_DATE_RE = re.compile(
    r"(?:\d{1,2}[./])?"
    r"(?:(?:" + MONTH_PATTERN + r")\s*)?"
    r"((?:19|20)\d{2})\s*[-–]\s*$",
    re.IGNORECASE,
)
_TRAILING_YEAR_RE = re.compile(
    r"\b((?:19|20)\d{2})\s*$",
)
_KISIM_RE = re.compile(r"^k[ıi]s[ıi]m\s*:", re.IGNORECASE)

_CO_SUFFIXES = (
    "a.ş.", "a.ş", "ltd.", "ltd.şti.", "şti.", "inc.", "co.",
    "a.s.", "ltd.sti.", "sti.", "gmbh", "corp.",
    "limited şirketi", "limited sirketi", "şirketi", "sirketi", "limited",
)

JOB_TITLE_HINTS = [
    "mühendis", "müdür", "yönetici", "uzman", "stajyer", "stajyeri",
    "danışman", "memur", "teknisyen", "tasarımcı", "müşavir",
    "araştırmacı", "asistan", "asistanı", "sekreter", "başkan",
    "elemanı", "eleman", "yetkilisi", "yetkili",
    "yardımcısı", "yardimcisi", "programcı",
    "developer", "engineer", "manager", "director", "specialist",
    "intern", "analyst", "designer", "consultant", "lead",
    "officer", "executive", "coordinator",
    "chef", "personel", "personeli", "görevli", "görevlisi",
    "sorumlu", "temsilci", "operatör", "koordinatör",
    "kuaför", "avukat", "doktor", "hemşire", "eczacı",
    "muhasebeci", "öğretmen", "garson", "barmen", "barista",
    "pilot", "kaptan", "şoför", "aşçı", "kasap",
]


def _is_job_title(text: str) -> bool:
    lower = turkish_lower(text)
    if "," in lower:
        return False
    if any(hint in lower for hint in JOB_TITLE_HINTS):
        return True
    return is_job_title_nlp(lower)


_EXP_SECTION_HEADERS = {
    "iş deneyimleri", "is deneyimleri", "iş deneyimi", "is deneyimi",
    "deneyim", "deneyimler", "tecrübe", "tecrübeler",
    "çalışma geçmişi", "calisma gecmisi", "kariyer", "staj",
    "iş geçmişi", "is gecmisi", "profesyonel deneyim",
    "work experience", "professional experience", "employment",
    "işdeneyimleri", "isdeneyimleri", "işdeneyimi",
}

_EDU_SECTION_HEADERS = {
    "eğitim", "egitim", "eğitim bilgileri", "eğitim geçmişi",
    "öğrenim", "ogrenim", "education", "academic",
}


def _classify_exp_line(line: str) -> tuple:
    stripped = line.strip()
    if not stripped:
        return ("EMPTY", stripped, None)

    lower = turkish_lower(stripped)

    if _KISIM_RE.match(stripped):
        return ("SKIP", stripped, None)
    if lower in _EXP_SECTION_HEADERS or lower in _EDU_SECTION_HEADERS:
        return ("SKIP", stripped, None)

    dm = _DATE_RANGE_RE.search(stripped)
    if dm:
        return ("DATE", stripped, dm)

    pm = _PAREN_DATE_RE.search(stripped)
    if pm:
        return ("DATE", stripped, pm)

    sm = _STANDALONE_DATE_RE.match(stripped)
    if sm:
        return ("DATE", stripped, sm)

    om = _OPEN_DATE_RE.search(stripped)
    if om:
        return ("DATE", stripped, om)

    clean = stripped.lstrip("•·■▪-–► ").strip()
    if not clean:
        return ("SKIP", stripped, None)

    word_count = len(clean.split())
    looks_company = any(turkish_lower(clean).endswith(s) for s in _CO_SUFFIXES)

    tm = _TRAILING_YEAR_RE.search(stripped)
    if tm and tm.start() > 0 and word_count <= 8:
        return ("DATE", stripped, tm)

    has_separator = " - " in clean or " – " in clean
    if word_count > 10 and not looks_company:
        if has_separator:
            parts = re.split(r"\s[-–]\s", clean, maxsplit=1)
            if len(parts) == 2:
                p1_lower = turkish_lower(parts[1].strip())
                p1_has_co = any(p1_lower.endswith(s) for s in _CO_SUFFIXES)
                if not p1_has_co:
                    return ("DESC", stripped, None)
        else:
            return ("DESC", stripped, None)

    if "," in clean and word_count > 5:
        first_part = clean.split(",", 1)[0].strip()
        fp_words = first_part.split()
        if len(fp_words) <= 3 and fp_words:
            last_w = turkish_lower(fp_words[-1])
            if any(hint in last_w for hint in JOB_TITLE_HINTS):
                return ("ENTITY", stripped, None)

    if word_count > 5 and not looks_company and not has_separator:
        return ("DESC", stripped, None)
    if clean.endswith(("!", "?")) and word_count > 1:
        return ("DESC", stripped, None)
    if clean.endswith(".") and not looks_company:
        if word_count > 3:
            return ("DESC", stripped, None)
        if len(clean) > 2 and clean[-2].islower():
            return ("DESC", stripped, None)
    is_bullet = stripped[0] in "•·■▪►"
    if is_bullet and not looks_company:
        return ("DESC", stripped, None)

    if len(clean) > 2:
        return ("ENTITY", stripped, None)

    return ("DESC", stripped, None)


def _assign_to_entry(entry: dict, text: str, is_parens: bool = False):
    if " - " in text or " – " in text:
        parts = re.split(r"\s*[-–]\s*", text, maxsplit=1)
        if len(parts) == 2:
            p0, p1 = parts[0].strip(), parts[1].strip()
            if _is_job_title(p0) and not _is_job_title(p1):
                entry.setdefault("title", p0)
                entry.setdefault("company", p1)
            else:
                entry.setdefault("company", p0)
                entry.setdefault("title", p1)
            return

    if " | " in text:
        parts = text.split(" | ", 1)
        p0, p1 = parts[0].strip(), parts[1].strip()
        if p0 and p1:
            if _is_job_title(p0):
                entry.setdefault("title", p0)
                entry.setdefault("company", p1)
            else:
                entry.setdefault("company", p0)
                entry.setdefault("title", p1)
            return

    if ", " in text:
        parts = text.split(", ", 1)
        p0, p1 = parts[0].strip(), parts[1].strip()
        p0_words = p0.split()
        if p0 and p1 and len(p0_words) <= 3 and p0_words:
            last_w = turkish_lower(p0_words[-1])
            if any(hint in last_w for hint in JOB_TITLE_HINTS):
                entry.setdefault("title", p0)
                entry.setdefault("company", p1)
                return

    text_lower = turkish_lower(text)
    has_co_suffix = any(text_lower.endswith(s) for s in _CO_SUFFIXES)
    if has_co_suffix:
        entry.setdefault("company", text)
    elif is_parens or _is_job_title(text):
        if "title" not in entry:
            entry["title"] = text
        else:
            entry.setdefault("company", text)
    else:
        entry.setdefault("company", text)


def _parse_experiences(section_text: str) -> List[dict]:
    if not section_text or len(section_text.strip()) < 10:
        return []

    lines = [l.strip() for l in section_text.split("\n") if l.strip()]
    classified = [_classify_exp_line(l) for l in lines]

    used = set()
    results = []

    for i, (cls, text, match) in enumerate(classified):
        if cls != "DATE" or i in used:
            continue

        used.add(i)
        entry = {"_idx": i}

        if match:
            entry["duration"] = match.group(0).strip().strip("()")
            pre = text[:match.start()].strip()
            pre = re.sub(r"[|–\-(\s,;:]+$", "", pre).strip()
            pre = pre.lstrip("•·■▪► ").strip()

            is_parens = (match.start() > 0 and
                         text[match.start() - 1:match.start()] == "(")

            if pre and len(pre) > 2:
                _assign_to_entry(entry, pre, is_parens=is_parens)
        else:
            entry["duration"] = text.strip()

        found_backward = False
        for j in range(i - 1, max(i - 15, -1), -1):
            if j in used:
                continue
            jcls, jtext, _ = classified[j]
            if jcls == "DATE":
                break
            if jcls in ("SKIP", "EMPTY"):
                continue
            if jcls == "DESC":
                if found_backward:
                    break
                continue

            et = jtext.lstrip("•·■▪-–► ").strip()
            if not et or len(et) < 3:
                continue

            _assign_to_entry(entry, et)
            used.add(j)
            found_backward = True
            if entry.get("company") and entry.get("title"):
                break

        for j in range(i + 1, min(i + 5, len(classified))):
            if j in used:
                continue
            jcls, jtext, _ = classified[j]
            if jcls == "DATE":
                break
            if jcls in ("SKIP", "EMPTY"):
                continue
            if jcls == "DESC":
                break

            et = jtext.lstrip("•·■▪-–► ").strip()
            if not et or len(et) < 3:
                continue

            has_sep = bool(re.search(r"\s[-–]\s", et))
            if has_sep and len(et.split()) > 2:
                break

            if entry.get("company") and _is_job_title(et):
                break

            _assign_to_entry(entry, et)
            used.add(j)

            if entry.get("company") and entry.get("title"):
                break

        if entry.get("duration") or entry.get("company") or entry.get("title"):
            results.append(entry)

    for entry in results:
        if entry.get("title"):
            continue
        idx = entry.get("_idx", 0)
        for j in range(idx - 1, -1, -1):
            jcls, jtext, _ = classified[j]
            if jcls == "ENTITY":
                et = jtext.lstrip("•·■▪-–► ").strip()
                if _is_job_title(et):
                    entry["title"] = et
                    break
            if jcls == "DESC":
                break

    for entry in results:
        entry.pop("_idx", None)

    return results


def _is_education_entry(entry: dict) -> bool:
    title = entry.get("title", "") or ""
    if title and _is_job_title(title):
        return False
    title_company = " ".join([title, entry.get("company", "") or ""])
    lower = turkish_lower(title_company)
    edu_markers = [
        "üniversite", "universite", "university", "fakülte", "yüksekokul",
        "lisesi", "lise", "okulu", "mesleki ve teknik",
        "lisans", "önlisans", "yüksek lisans", "doktora",
        "eğitim geçmişi", "egitim gecmisi",
        "turizm meslek",
    ]
    if any(m in lower for m in edu_markers):
        return True
    if "@" in title_company and ".com" in title_company:
        return True
    return False


def extract_experience(text: str, sections: dict) -> List[Experience]:
    exp_text = sections.get("experience", "")

    if not exp_text or len(exp_text.strip()) <= 10:
        return []

    results = _parse_experiences(exp_text)

    results = [r for r in results if not _is_education_entry(r)]
    results = [r for r in results if r.get("company") or r.get("title")]

    for r in results:
        for key in ("title", "company"):
            val = r.get(key, "") or ""
            val = val.strip("()")
            val = re.sub(r"\s*\($", "", val).strip()
            val = re.sub(r"^\)\s*", "", val).strip()
            val_lower = turkish_lower(val)
            if val_lower in _EXP_SECTION_HEADERS or val_lower in _EDU_SECTION_HEADERS:
                val = ""
            _all_section_words = {
                "beceriler", "yetenekler", "skills", "diller", "languages",
                "projeler", "projects", "sertifika", "referans", "references",
                "ilgi alanları", "hobiler", "interests", "hakkımda", "profil",
                "iletişim", "kişisel bilgiler", "özet",
            }
            if val_lower in _all_section_words:
                val = ""
            if _KISIM_RE.match(val):
                val = ""
            r[key] = val

    seen = set()
    deduped = []
    for r in results:
        key = (
            turkish_lower(r.get("company", "") or "").strip(),
            turkish_lower(r.get("title", "") or "").strip(),
            (r.get("duration", "") or "").strip(),
        )
        if key not in seen:
            seen.add(key)
            deduped.append(r)

    if deduped:
        return [Experience(**r) for r in deduped]

    year_exp = re.search(
        r"(\d+)\+?\s*(?:yıl|yil|year|sene|yıllık|yillik)\b",
        text, re.IGNORECASE,
    )
    if year_exp:
        return [Experience(
            title="Deneyim",
            duration=f"{year_exp.group(1)} yıl",
        )]

    return []


def _language_names_in_chunk(chunk: str) -> set[str]:
    """Dil adlarını bulur; kısa anahtarlar için kelime sınırı kullanır."""
    found: set[str] = set()
    if not chunk or not chunk.strip():
        return found
    tl = turkish_lower(chunk)
    for key, normalized in LANGUAGE_PAIRS.items():
        if len(key) <= 5:
            pat = r"(?<![a-zğüşıöç0-9])" + re.escape(key) + r"(?![a-zğüşıöç0-9])"
            if re.search(pat, tl):
                found.add(normalized)
        elif key in tl:
            found.add(normalized)
    return found


def _strip_contact_noise_for_lang_scan(s: str) -> str:
    """E-posta ve telefon satırlarını dil taramasından çıkar (yanlış 'english' vb. önlemek için)."""
    if not s:
        return ""
    out = re.sub(
        r"[\w.+-]+@[\w-]+\.[a-zA-Z]{2,12}(?:\.[a-zA-Z]{2,4})?",
        " ",
        s,
    )
    out = re.sub(
        r"(?:\+90|0090|0)\s*\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}|"
        r"\+?\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}|"
        r"5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}",
        " ",
        out,
    )
    return out


def extract_languages(text: str, sections: dict | None = None) -> List[str]:
    """
    Önce 'languages' bölümü, sonra header/skills/about; son çare temizlenmiş metin.
    İş deneyimi/eğitim metninde geçen dil adları (ör. 'English course') mümkün olduğunca dışlanır.
    """
    found: set[str] = set()

    def add(chunk: str) -> None:
        found.update(_language_names_in_chunk(_strip_contact_noise_for_lang_scan(chunk)))

    if sections:
        add(sections.get("languages") or "")
        if found:
            return sorted(found)

        safe_blob = "\n".join(
            x
            for x in [
                sections.get("header") or "",
                sections.get("skills") or "",
                sections.get("about") or "",
            ]
            if x
        )
        add(safe_blob)
        if found:
            return sorted(found)

    clean = _strip_contact_noise_for_lang_scan(text)
    if sections:
        for key in ("experience", "education"):
            block = sections.get(key) or ""
            if len(block) > 120:
                clean = clean.replace(block, "\n")

    add(clean)
    return sorted(found)


def get_education_level(educations: List[Education]) -> int:
    max_level = -1
    for edu in educations:
        search_texts = [t for t in [edu.degree, edu.field, edu.institution] if t]
        for text in search_texts:
            for key, level in DEGREE_MAP.items():
                if key in turkish_lower(text):
                    max_level = max(max_level, level)
                    break
    return max_level


def analyze_cv(text: str, file_path: str | None = None) -> CVData:
    sections = find_sections(text)

    name = None
    if file_path:
        from services.pdf_parser import extract_name_by_font
        name = extract_name_by_font(file_path)
    if not name:
        name = extract_name(text)

    all_skills = extract_skills_from_section(text, sections, person_name=name or "")

    return CVData(
        name=name,
        email=extract_email(text),
        phone=extract_phone(text),
        skills=all_skills,
        education=extract_education(text, sections),
        experience=extract_experience(text, sections),
        languages=extract_languages(text, sections),
        raw_text=text,
    )
