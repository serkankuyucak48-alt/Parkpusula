# CarPlay ve Android Auto

## Başvuru (Apple CarPlay izni)

Apple Developer hesabı onaylandıktan sonra, hesapla giriş yapıp CarPlay başvuru formunu doldur:
https://developer.apple.com/contact/carplay/

- **Kategori:** Parking
- **Uygulama:** PARKPUSULA (`tr.parkpusula.app`)
- **Açıklama** alanına aşağıdaki İngilizce metni yapıştır:

> PARKPUSULA helps drivers find available on-street parking in Ankara, Türkiye, starting with the Kızılay city-centre pilot. The app shows each street segment's current parking availability (available / limited / full), based on field observations by our parking operators and real-time reports from drivers, plus time-of-day predictions built from historical data. It also flags segments where parking is prohibited so drivers can avoid fines and towing.
>
> On CarPlay, the app will use the Point of Interest and List templates to show nearby street segments with their availability, distance and parking rules. Selecting a segment hands off turn-by-turn directions to the driver's navigation app; PARKPUSULA does not provide its own navigation on the car screen. When the driver arrives at the selected street, a single-tap alert asks whether they found a space, which keeps the availability data fresh for other drivers. No text entry or browsing is required while driving.
>
> The app is free for drivers and is operated by PARKPUSULA in Ankara. A working web version is available at https://parkpusula-ankara.netlify.app

## Araç ekranı tasarımı (sürüm 0.2)

**CarPlay** (Apple'ın park uygulamalarına izin verdiği şablonlar):
- **Point of Interest şablonu:** sistem haritasında yakındaki sokaklar (en fazla 12 nokta), her birinde "Yer var · 120 m", kural uyarısı.
- **Liste şablonu:** "En uygun sokak" en üstte; dokununca ayrıntı ve **Git**.
- **Git:** Apple Haritalar / Google Maps navigasyonuna devreder.
- **Varış uyarısı:** telefon arka planda konumu izler; hedef sokağa 40 m kala araç ekranında "Park yeri buldun mu? — Buldum / Yer yoktu".

**Android Auto** (Car App Library, kategori `androidx.car.app.category.PARKING`):
- **PlaceListMapTemplate:** harita + yakındaki sokaklar listesi.
- Navigasyon devri: `CarContext.startCarApp` ile Google Maps'e `geo:` amacı.
- Aynı varış uyarısı.

## Teknik notlar

- iOS 27 SDK ile derlenen uygulamalar sahne (scene) tabanlı yaşam döngüsü kullanmak zorunda; Expo SDK 57'de `expo-build-properties` › `ios.enableSceneSupport` ile açılır. CarPlay de sahne tabanlı çalışır, bu yüzden 0.2'de bu ayar açılacak.
- CarPlay ve Android Auto ekranları için `react-native-carplay` kütüphanesi ya da yerel (Swift / Kotlin) modül kullanılacak; seçim 0.1 derlemesi başarılı olduktan sonra yapılacak.
- Varışın arka planda algılanması için iOS'ta "Always" konum izni yerine bölge izleme (geofence) kullanılacak; pil tüketimi düşük kalır.
