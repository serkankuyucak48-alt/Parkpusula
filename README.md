# PARKPUSULA

Ankara Kızılay pilotu için sokak sokak park yeri doluluk uygulaması.

- **Web uygulaması:** https://parkpusula-ankara.netlify.app
- **Mobil uygulama (bu depo):** Expo SDK 57 / React Native, iOS ve Android. Web uygulamasıyla aynı Supabase veritabanını ve aynı doluluk/tahmin mantığını kullanır.

## Mobil uygulama — sürüm 0.1 (telefon)

- Harita üzerinde sokakların doluluk rengi (canlı veri düz çizgi, tahmin kesikli çizgi, park yasak kesimler koyu kesikli işaretli)
- Adres arama ve "yakınımdakiler"
- Sokak listesi, satıra dokununca ayrıntı ve "Yer var / Yer yok" bildirimi
- **Beni boş sokağa götür**: en uygun sokağa uygulama içi navigasyon
- Uygulama içi navigasyon: rota çizgisi, yön oku, dönüş talimatları, Türkçe sesli yönlendirme, harita gidiş yönüne döner
- Varışta "Park yeri buldun mu?" sorusu; "Yer yoktu" denirse sıradaki sokağa yönlendirme
- Aracın park yeri kaydı ve yürüyerek dönüş tarifi

## Yol haritası

1. **0.1 — Telefon uygulaması** (bu sürüm): TestFlight ve Android APK ile test.
2. **0.2 — CarPlay ve Android Auto:** Apple'ın CarPlay "Parking" izni onaylandıktan sonra. Araç ekranında yakındaki sokakların doluluk listesi ve haritası, "Git" ile aracın navigasyonuna devretme, varışta araç ekranında "Park yeri buldun mu?" uyarısı. Ayrıntı: [docs/CARPLAY.md](docs/CARPLAY.md)
3. **0.3 — Yönetici araçları:** fotoğrafla doluluk girişi ve sürüş modu (şimdilik web uygulamasında).

## Derleme

Bilgisayar gerekmeden Codemagic ile bulutta derlenir. Adım adım kurulum: [docs/KURULUM.md](docs/KURULUM.md)

Bağımlılık sürümleri `scripts/install-deps.sh` içinde `npx expo install` ile SDK'ya uygun seçilir.

## Dosyalar

- `App.js` — ekranlar ve navigasyon
- `src/api.js` — Supabase veri erişimi, adres arama
- `src/status.js` — doluluk ve tahmin hesabı
- `src/nav.js` — rota ve Türkçe dönüş talimatları
- `src/geo.js` — koordinat yardımcıları
- `codemagic.yaml` — iOS (TestFlight) ve Android (APK) derleme
