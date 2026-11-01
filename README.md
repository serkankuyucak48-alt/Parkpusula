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
- **Otomatik park algılama** (0.2, isteğe bağlı, "Oto-park" düğmesi): sürüş → durma → araçtan yürüyerek uzaklaşma "park", park edilen yerden tekrar sürüşe geçme "ayrılma" sayılır. Ayrılma, o sokakta yer açıldığını diğer sürücülere bildirir; araç yeri de kendiliğinden kaydedilir. Konum saklanmaz: sunucu noktayı en yakın sokak kesimine (25 m) eşler, yalnızca kesim + saat tutulur (`pp_park_events`). Kod: `src/autopark.js`

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
- `src/autopark.js` — arka planda park / ayrılma algılama
- `codemagic.yaml` — iOS (TestFlight) ve Android (APK) derleme

## App Store incelemesi notu (arka plan konumu)

Apple "Her Zaman" konum iznini sorgular. İnceleme notuna şu metin yazılabilir:

> Background location is used only when the user turns on "Oto-park" (automatic parking detection). It detects when the user parks and later leaves an on-street parking space, so the app can save the car's location and tell other drivers that a space has opened on that street. Raw location is never stored on our servers; it is matched to the nearest street segment and only the segment ID and time are recorded. The feature is off by default and can be turned off at any time.
