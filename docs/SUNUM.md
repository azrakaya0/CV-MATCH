# CVMatch AI — Sunum ve Demo Kılavuzu

Bu belge bitirme tezi sunumu için hazırlanmıştır. **Satış/abonelik** özellikleri kapsam dışıdır.

## 1. Sunum mesajı (30 saniye)

CVMatch, işe alım sürecini uçtan uca dijitalleştiren bir platformdur: aday CV’sini yükler, şirket ilan açar, sistem yapay zekâ ile eşleştirir; İK anonim başvuru görür, rapor ve soru-cevap (RAG) ile karar verir. KVKK onayı ve denetim günlüğü vardır.

## 2. Demo hesapları

| Rol | Kullanıcı | Şifre | Ne gösterilir? |
|-----|-----------|-------|----------------|
| Admin | admin | admin123 | Kullanıcılar, KVKK metni, istatistikler, denetim logu |
| Şirket (İK) | yonetici | yonetici123 | İlan, başvuru, eşleştirme, RAG, PDF rapor |
| Aday | calisan | calisan123 | CV oluşturma, ilan gezme, başvuru |

İlk kurulumda **3 örnek iş ilanı** otomatik oluşur (boş veritabanı + `SEED_DEMO_USERS=true`).

## 3. Demo akışı (önerilen sıra, ~12 dk)

### A. Aday (3 dk)
1. `calisan` / `calisan123` ile giriş
2. **CV Hazırla** → form doldur veya PDF yükle → KVKK onayı → analiz
3. **İlanlar** → demo ilanlardan birine başvur
4. **Başvurularım** → durumu gör

### B. Şirket / İK (6 dk)
1. `yonetici` / `yonetici123` ile giriş
2. **Dashboard** → başvuran CV sayısı, son eşleştirmeler, beceri grafiği
3. **İş İlanları** → yeni ilan veya mevcut ilanı kapat/aç
4. **Başvurular** → anonim CV etiketleri (#1001)
5. **Eşleştirme** → CV + ilan seç → skor, radar, öneriler, PDF rapor
6. **Karşılaştır** → aynı ilana birden fazla aday
7. **Soru-Cevap (RAG)** → “Bu adayda Python var mı?” benzeri soru

### C. Admin (2 dk)
1. `admin` / `admin123`
2. **Yönetim** → istatistik kartları, son işlemler (audit)
3. KVKK metni önizleme

## 4. Teknik sorular — kısa cevaplar

| Soru | Cevap |
|------|--------|
| Veriler nerede? | MongoDB; PDF dosyalar sunucu diskinde, indirme yetkili |
| Yapay zekâ nasıl? | `AI_MODE=ai`: embedding benzerliği; `basic`: kural tabanlı (hızlı demo) |
| Güvenlik? | JWT, bcrypt, rate limit, rol bazlı erişim, audit log |
| KVKK? | Kayıt onayı, geri çekme, anonim başvuru listesi |
| Canlıya hazır mı? | Sunum/MVP evet; ticari satış için SMTP, hukuk metni, yedekleme ayrıca |

## 5. Ortam

```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000
```

Tarayıcı: http://localhost:8000

## 6. Bilinçli olarak yapılmayanlar (yalnızca satış)

- Abonelik / ödeme / fatura
- Çoklu kiracı SaaS faturalandırma
- LinkedIn / Kariyer.net entegrasyonu
- Beyaz etiket (marka paketi) — kod altyapısı kısmen hazır (CORS, ortam)
