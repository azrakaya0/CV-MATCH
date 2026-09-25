import re

from config import settings
from sentence_transformers import SentenceTransformer, util

_model = None
_pos_embeddings = None
_neg_embeddings = None
_cache: dict[str, bool] = {}

REFERENCE_SKILLS = [
    "python", "java", "javascript", "typescript", "c#", "c++", "ruby", "php",
    "swift", "kotlin", "go", "rust", "scala", "r", "matlab", "dart", "perl",
    "html", "css", "react", "angular", "vue.js", "next.js", "svelte", "jquery",
    "bootstrap", "tailwind", "sass", "webpack", "vite", "redux",
    "node.js", "express", "django", "flask", "fastapi", "spring boot",
    "asp.net", ".net", "laravel", "nest.js",
    "react native", "flutter", "android", "ios", "swiftui",
    "sql", "mysql", "postgresql", "mongodb", "redis", "elasticsearch",
    "oracle", "sqlite", "firebase", "dynamodb", "cassandra",
    "aws", "azure", "gcp", "google cloud", "docker", "kubernetes",
    "jenkins", "ci/cd", "terraform", "ansible", "nginx", "linux",
    "machine learning", "deep learning", "tensorflow", "pytorch",
    "keras", "scikit-learn", "pandas", "numpy", "matplotlib",
    "nlp", "computer vision", "opencv", "data analysis", "data science",
    "big data", "hadoop", "spark", "tableau", "power bi", "jupyter",
    "git", "github", "jira", "confluence", "figma", "photoshop",
    "agile", "scrum", "kanban", "devops", "microservices",
    "rest api", "graphql", "grpc", "websocket",
    "unit testing", "jest", "pytest", "selenium", "cypress",
    "muhasebe", "genel muhasebe", "denetim", "vergi", "bilanço",
    "bütçe", "finans", "sgk", "bordro", "e-fatura", "e-defter",
    "logo", "sap", "netsis", "luca", "mikro",
    "insan kaynakları", "işe alım", "performans yönetimi", "oryantasyon",
    "pazarlama", "dijital pazarlama", "sosyal medya", "seo", "sem",
    "google ads", "google analytics", "crm", "salesforce",
    "e-ticaret", "satış", "müşteri ilişkileri",
    "hukuk", "sözleşme", "dava takibi", "arabuluculuk", "uyap",
    "autocad", "solidworks", "catia", "plc", "scada", "otomasyon",
    "kalite kontrol", "iso 9001", "six sigma", "kaizen",
    "proje yönetimi", "ms project",
    "hemşirelik", "hasta bakımı", "tıbbi terminoloji", "ilk yardım",
    "acil müdahale", "laboratuvar", "radyoloji", "eczacılık", "sterilizasyon",
    "gıda güvenliği", "haccp", "hijyen", "iso 22000",
    "aşçılık", "aşçıbaşı", "pastacılık", "fırıncılık", "kasaplık",
    "soğuk mutfak", "sıcak mutfak", "alakart", "banket", "catering", "tabldot",
    "barmenlik", "barista", "kokteyl", "servis", "garsonluk",
    "restoran yönetimi", "mutfak yönetimi", "menü planlama",
    "otel yönetimi", "otelcilik", "ön büro", "resepsiyon", "kat hizmetleri",
    "rezervasyon", "booking", "opera pms", "turizm", "turizm yönetimi",
    "etkinlik yönetimi", "konaklama", "yiyecek içecek",
    "iş sağlığı ve güvenliği", "iş güvenliği", "gıda", "gıda teknolojisi",
    "gastronomi", "chef", "sous chef", "komi", "commis",
    "teknik çizim", "üretim planlama", "üretim yönetimi", "yalın üretim",
    "bakım planlama", "enerji yönetimi", "elektrik", "elektronik",
    "betonarme", "metraj", "şantiye yönetimi", "yapı denetim",
    "cad", "cam", "cnc", "3d modelleme", "primavera",
    "maliyet muhasebesi", "finansal muhasebe", "iç denetim", "dış denetim",
    "e-beyanname", "e-arşiv", "mali analiz", "finansal analiz",
    "ufrs", "ifrs", "vuk", "sgk bildirge", "maaş bordrosu",
    "logo tiger", "logo go", "sap fico", "parasut",
    "performans değerlendirme", "yetenek yönetimi", "kariyer planlama",
    "iş kanunu", "özlük dosyası", "puantaj",
    "marka yönetimi", "içerik pazarlama", "e-posta pazarlama",
    "halkla ilişkiler", "medya planlama", "hubspot",
    "müşteri memnuniyeti", "teklif hazırlama", "pazar araştırması",
    "ticaret hukuku", "iş hukuku", "icra", "icra iflas", "mevzuat takibi", "e-imza",
    "iso 14001", "iso 45001", "5s", "kalite güvence",
    "öğretim", "müfredat", "ders planı", "sınıf yönetimi",
    "uzaktan eğitim", "e-öğrenme", "lms", "rehberlik",
    "excel", "word", "powerpoint", "microsoft office", "outlook", "ileri excel",
    "erp", "raporlama", "veri analizi", "istatistik",
    "risk yönetimi", "risk analizi", "süreç yönetimi", "süreç iyileştirme",
    "lojistik", "tedarik zinciri", "stok yönetimi", "depo yönetimi",
    "ithalat", "ihracat", "dış ticaret", "gümrük",
    "müşteri hizmetleri", "çağrı merkezi", "operasyon yönetimi",
    "takım çalışması", "liderlik", "iletişim", "problem çözme",
    "analitik düşünme", "yaratıcılık", "zaman yönetimi",
    "sunum", "adaptasyon", "organizasyon", "müzakere", "ikna", "mentorluk",
    "karar verme", "stres yönetimi",
    "accounting", "bookkeeping", "auditing", "budgeting", "taxation",
    "financial reporting", "accounts payable", "accounts receivable", "cash flow",
    "human resources", "recruitment", "onboarding", "talent management",
    "marketing", "digital marketing", "social media", "content marketing",
    "sales", "business development", "lead generation", "brand management",
    "law", "legal", "contract", "litigation", "compliance",
    "engineering", "quality control", "quality assurance", "lean manufacturing",
    "production planning", "nursing", "patient care", "healthcare", "pharmacy",
    "teaching", "curriculum", "lesson planning", "e-learning",
    "hospitality", "food and beverage", "food safety", "culinary",
    "event management", "front office", "guest relations", "concierge",
    "supply chain", "logistics", "inventory management", "operations",
    "process improvement", "reporting", "data analysis", "statistics",
    "teamwork", "leadership", "communication", "problem solving",
    "analytical thinking", "creativity", "time management",
    "project management", "presentation", "adaptability",
    "negotiation", "decision making", "critical thinking",
]

NEGATIVE_EXAMPLES = [
    "istanbul", "ankara", "izmir", "bursa", "antalya", "eskişehir",
    "konya", "trabzon", "adana", "gaziantep", "kayseri", "mersin",
    "kadıköy", "beşiktaş", "üsküdar", "çankaya", "ataşehir",
    "türkiye", "almanya", "ingiltere", "fransa", "amerika",
    "anonim şirketi", "limited şirketi", "holding", "vakfı",
    "üniversitesi", "hastanesi", "lisesi", "koleji", "enstitüsü",
    "belediyesi", "bakanlığı", "müdürlüğü", "derneği",
    "hotel", "otel", "resort", "restoran", "cafe", "plaza",
    "takım çalışmasına yatkın", "iletişim becerileri güçlü",
    "analitik düşünme yeteneği", "problem çözme becerisi",
    "katmayı amaçlıyorum", "hedefliyorum", "ilgi duyuyorum",
    "sorumluluk sahibi", "özverili çalışkan",
    "lisans", "yüksek lisans", "doktora", "bölümü", "fakültesi",
    "türk hava yolları", "migros", "arçelik", "koç", "sabancı",
    "ocak", "şubat", "mart", "nisan", "mayıs", "haziran",
    "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık",
]


def _get_model():
    global _model
    if _model is None:
        _model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
    return _model


def _get_pos_embeddings():
    global _pos_embeddings
    if _pos_embeddings is None:
        _pos_embeddings = _get_model().encode(
            REFERENCE_SKILLS, convert_to_tensor=True, show_progress_bar=False
        )
    return _pos_embeddings


def _get_neg_embeddings():
    global _neg_embeddings
    if _neg_embeddings is None:
        _neg_embeddings = _get_model().encode(
            NEGATIVE_EXAMPLES, convert_to_tensor=True, show_progress_bar=False
        )
    return _neg_embeddings


def is_skill_nlp(text: str, margin: float = 0.05) -> bool:
    text = text.strip().lower()
    if not text or len(text) < 2:
        return False
    if settings.AI_MODE.lower() != "ai":
        return 2 <= len(text) <= 48 and text not in {e.lower() for e in NEGATIVE_EXAMPLES}
    if text in _cache:
        return _cache[text]

    emb = _get_model().encode(text, convert_to_tensor=True, show_progress_bar=False)
    pos_score = float(util.cos_sim(emb, _get_pos_embeddings()).max())
    neg_score = float(util.cos_sim(emb, _get_neg_embeddings()).max())
    result = pos_score > neg_score + margin
    _cache[text] = result
    return result


def find_skills_in_text(text: str) -> list[str]:
    text_lower = text.lower()
    found = []
    seen = set()

    for skill in REFERENCE_SKILLS:
        if skill in seen:
            continue
        if len(skill) <= 2:
            pattern = r"(?<![a-zA-ZğüşıöçĞÜŞİÖÇ])" + re.escape(skill) + r"(?![a-zA-ZğüşıöçĞÜŞİÖÇ])"
        else:
            pattern = r"\b" + re.escape(skill) + r"\b"

        if re.search(pattern, text_lower, re.IGNORECASE):
            display = skill.upper() if len(skill) <= 3 else skill.title()
            found.append(display)
            seen.add(skill)

    return list(dict.fromkeys(found))


def clear_cache():
    _cache.clear()
