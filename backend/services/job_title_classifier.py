from config import settings
from sentence_transformers import SentenceTransformer, util

_model = None
_pos_embeddings = None
_neg_embeddings = None
_cache: dict[str, bool] = {}

REFERENCE_TITLES = [
    "yazılım mühendisi", "bilgisayar mühendisi", "makine mühendisi",
    "elektrik mühendisi", "elektronik mühendisi", "inşaat mühendisi",
    "endüstri mühendisi", "çevre mühendisi", "gıda mühendisi",
    "kimya mühendisi", "biyomedikal mühendisi", "harita mühendisi",
    "maden mühendisi", "metalürji mühendisi", "tekstil mühendisi",
    "yazılım geliştirici", "mobil geliştirici", "web geliştirici",
    "sistem yöneticisi", "veri tabanı yöneticisi", "ağ yöneticisi",
    "veri bilimci", "veri analisti", "yapay zeka uzmanı",
    "siber güvenlik uzmanı", "bilgi teknolojileri uzmanı",
    "test mühendisi", "devops mühendisi", "kalite mühendisi",
    "proje mühendisi", "saha mühendisi",
    "genel müdür", "proje yöneticisi", "operasyon müdürü",
    "insan kaynakları müdürü", "pazarlama müdürü", "satış müdürü",
    "finans müdürü", "üretim müdürü", "lojistik müdürü",
    "şube müdürü", "bölge müdürü", "idari işler müdürü",
    "takım lideri", "departman başkanı", "koordinatör",
    "yönetim kurulu üyesi", "icra kurulu başkanı",
    "doktor", "hemşire", "eczacı", "diş hekimi", "fizyoterapist",
    "psikolog", "diyetisyen", "veteriner", "laborant", "ebe",
    "radyoloji teknisyeni", "anestezi teknisyeni", "paramedik",
    "biyolog", "genetik uzmanı", "odyolog", "optisyen",
    "avukat", "hakim", "savcı", "noter", "arabulucu",
    "muhasebeci", "mali müşavir", "denetçi", "bankacı",
    "sigortacı", "finans analisti", "vergi müfettişi",
    "aktüer", "sayman", "icra müdürü", "tahsildar",
    "öğretmen", "öğretim üyesi", "öğretim görevlisi",
    "araştırma görevlisi", "profesör", "doçent", "akademisyen",
    "eğitim uzmanı", "rehber", "antrenör", "koç",
    "aşçı", "aşçıbaşı", "şef", "komi", "garson", "barmen",
    "barista", "pastacı", "fırıncı", "kasap", "sommelier",
    "hostes", "resepsiyonist", "kat görevlisi", "bellboy",
    "tur rehberi", "otel müdürü", "restoran müdürü",
    "mutfak personeli", "servis elemanı",
    "grafik tasarımcı", "iç mimar", "mimar", "peyzaj mimarı",
    "editör", "muhabir", "gazeteci", "yönetmen", "kameraman",
    "fotoğrafçı", "ses mühendisi", "montajcı", "animator",
    "reklamcı", "halkla ilişkiler uzmanı", "sosyal medya uzmanı",
    "teknisyen", "elektrikçi", "tesisatçı", "kaynakçı",
    "tornacı", "operatör", "forklift operatörü", "vinççi",
    "depocu", "kurye", "şoför", "kaptan", "pilot",
    "makinist", "kalıpçı", "boyacı", "montajcı",
    "güvenlik görevlisi", "itfaiyeci", "polis memuru",
    "asker", "subay", "astsubay", "gümrükçü", "müfettiş",
    "satış danışmanı", "pazarlama uzmanı", "müşteri temsilcisi",
    "çağrı merkezi operatörü", "mağaza müdürü", "kasiyer",
    "tezgahtar", "ürün yöneticisi", "iş geliştirme uzmanı",
    "stajyer", "asistan", "sekreter", "memur", "büyükelçi",
    "tercüman", "çevirmen", "danışman", "uzman", "müfettiş",
    "araştırmacı", "analist",
    "kuaför", "berber", "terzi", "tesisatçı", "boyacı",
    "imam", "müezzin", "vaiz", "din görevlisi",
    "çiftçi", "balıkçı", "avcı", "madenci", "çoban",
    "software engineer", "data scientist", "data analyst",
    "frontend developer", "backend developer", "full stack developer",
    "devops engineer", "machine learning engineer", "qa engineer",
    "systems administrator", "network engineer", "cloud architect",
    "product manager", "scrum master", "technical lead",
    "ux designer", "ui designer", "database administrator",
    "security analyst", "site reliability engineer",
    "project manager", "operations manager", "general manager",
    "chief executive officer", "chief technology officer",
    "chief financial officer", "human resources manager",
    "business analyst", "management consultant", "account manager",
    "marketing manager", "sales manager", "team lead",
    "accountant", "lawyer", "teacher", "nurse", "doctor",
    "pharmacist", "architect", "graphic designer", "journalist",
    "translator", "consultant", "analyst", "intern",
    "receptionist", "bartender", "chef", "waiter", "cashier",
    "driver", "pilot", "mechanic", "electrician", "plumber",
]

NEGATIVE_EXAMPLES = [
    "istanbul", "ankara", "izmir", "bursa", "antalya", "eskişehir",
    "konya", "trabzon", "adana", "gaziantep", "kayseri", "mersin",
    "diyarbakır", "samsun", "denizli", "malatya", "erzurum", "van",
    "kadıköy", "beşiktaş", "üsküdar", "bakırköy", "şişli", "ataşehir",
    "izmit", "gebze", "adapazarı", "bolu", "düzce", "çankaya",
    "türkiye", "almanya", "ingiltere", "fransa", "amerika", "kanada",
    "anonim şirketi", "limited şirketi", "holding", "grup", "vakfı",
    "üniversitesi", "hastanesi", "lisesi", "koleji", "enstitüsü",
    "belediyesi", "bakanlığı", "müdürlüğü", "derneği", "odası",
    "hotel", "otel", "resort", "bar", "restoran", "cafe", "kafe",
    "plaza", "tower", "center", "merkezi", "fabrika", "atölye",
    "takım çalışmasına yatkın", "iletişim becerileri güçlü",
    "analitik düşünme yeteneği", "problem çözme becerisi",
    "excel ve word programlarına hakimdir",
    "sürücü belgesi b sınıfı", "ehliyet",
    "katmayı amaçlıyorum", "hedefliyorum", "ilgi duyuyorum",
    "sorumluluk sahibi", "özverili çalışkan",
    "lisans", "yüksek lisans", "doktora", "ön lisans",
    "bölümü", "fakültesi", "programı",
    "türk hava yolları", "migros", "arçelik", "koç",
    "sabancı", "tüpraş", "petkim", "botaş",
    "boru hatları", "ticaret", "sanayi", "gıda",
    "tekstil", "inşaat", "turizm", "otomotiv",
    "perakende", "lojistik", "enerji", "madencilik",
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
            REFERENCE_TITLES, convert_to_tensor=True, show_progress_bar=False
        )
    return _pos_embeddings


def _get_neg_embeddings():
    global _neg_embeddings
    if _neg_embeddings is None:
        _neg_embeddings = _get_model().encode(
            NEGATIVE_EXAMPLES, convert_to_tensor=True, show_progress_bar=False
        )
    return _neg_embeddings


def is_job_title_nlp(text: str, margin: float = 0.05) -> bool:
    text = text.strip()
    if not text or len(text) < 2:
        return False
    if settings.AI_MODE.lower() != "ai":
        lower = text.lower()
        if lower in _cache:
            return _cache[lower]
        if any(t in lower for t in REFERENCE_TITLES[:80]):
            _cache[lower] = True
            return True
        return 3 <= len(text) <= 80 and not any(x in lower for x in ("üniversite", "ltd", "a.ş", "holding"))
    if text in _cache:
        return _cache[text]

    emb = _get_model().encode(text, convert_to_tensor=True, show_progress_bar=False)
    pos_score = float(util.cos_sim(emb, _get_pos_embeddings()).max())
    neg_score = float(util.cos_sim(emb, _get_neg_embeddings()).max())
    result = pos_score > neg_score + margin
    _cache[text] = result
    return result


def clear_cache():
    _cache.clear()
