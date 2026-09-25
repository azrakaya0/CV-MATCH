# CVMatch AI

CV analizi, iş ilanı eşleştirme ve yapay zekâ destekli aday değerlendirme platformu.

## Hızlı başlangıç (geliştirme)

### Gereksinimler

- Python 3.10+
- MongoDB (yerel veya Docker)

### Kurulum

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

### Çalıştırma

```powershell
# MongoDB çalışıyor olmalı
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Tarayıcı: **http://localhost:8000**

### Docker ile

```powershell
# backend/.env içinde güçlü JWT_SECRET tanımlayın
docker compose up --build
```

### Demo hesaplar (yalnızca SEED_DEMO_USERS=true iken)

| Rol | Kullanıcı | Şifre |
|-----|-----------|-------|
| Admin | admin | admin123 |
| Şirket (İK) | yonetici | yonetici123 |
| Aday | calisan | calisan123 |

Üretimde `SEED_DEMO_USERS=false` ve güçlü şifreler kullanın.

## Mimari (sunum özeti)

| Katman | Teknoloji | Ne işe yarar? |
|--------|-----------|---------------|
| Arayüz | HTML, CSS, JavaScript | Tek sayfa uygulama; rol bazlı ekranlar |
| API | FastAPI (Python) | İş kuralları, güvenlik, dosya yükleme |
| Veritabanı | MongoDB | Kullanıcı, CV, ilan, başvuru, eşleşme |
| Kimlik | JWT + bcrypt | Oturum ve şifre güvenliği |
| CV okuma | PyMuPDF, EasyOCR | PDF’ten metin ve yapı çıkarma |
| Eşleştirme | sentence-transformers | Beceri ve metin benzerliği (embedding) |
| Soru-cevap | MiniLM + FLAN-T5 | İlana göre CV’ler hakkında RAG |

## Ortam değişkenleri

`backend/.env.example` dosyasına bakın. Önemli alanlar:

- `MONGODB_URL` — veritabanı adresi
- `JWT_SECRET` — üretimde mutlaka değiştirin (en az 32 karakter)
- `ENVIRONMENT` — `development` veya `production`
- `CORS_ORIGINS` — virgülle ayrılmış izinli adresler
- `SEED_DEMO_USERS` — demo kullanıcı oluşturma (`false` = kapalı)

## Test

```powershell
cd backend
pip install -r requirements-dev.txt
pytest ../tests -q
```

## Özellikler (özet)

- Rol bazlı erişim: admin, şirket (İK / departman), aday
- CV PDF analizi, iş ilanı eşleştirme, RAG soru-cevap
- KVKK onayı, hesap silme, şifre sıfırlama (SMTP veya geliştirme token)
- Denetim günlüğü (audit log), giriş rate limit
- `AI_MODE=basic` (hızlı) veya `ai` (embedding eşleştirme)
- Sunum için otomatik demo ilanları (`SEED_DEMO_USERS=true`, boş veritabanı)

## Proje yapısı

```
cvmatch/
├── backend/          # FastAPI API + servisler
├── frontend/         # Statik arayüz
├── tests/            # Otomatik testler
├── docker-compose.yml
└── README.md
```

## Sunum kılavuzu

Detaylı demo akışı ve jüri soruları: [docs/SUNUM.md](docs/SUNUM.md)

## Lisans ve KVKK

KVKK metni admin panelinden düzenlenebilir. Canlıya almadan önce hukuk danışmanı ile metni gözden geçirin.
