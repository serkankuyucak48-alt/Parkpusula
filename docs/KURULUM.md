# Kurulum: bilgisayarsız bulut derleme (Codemagic)

Bu adımların hepsi iPhone'daki tarayıcıdan yapılabilir. Sıra önemli.

## 1. Apple Developer Program

1. https://developer.apple.com/programs/enroll/ adresinden kayıt ol (ya da **Apple Developer** uygulamasından). Yıllık 99 USD.
2. Bireysel kayıt daha hızlı onaylanır. Şirket adına kayıt için D-U-N-S numarası gerekir.
3. Onay e-postasını bekle (genelde 1-2 gün).

## 2. App Store Connect'te uygulamayı oluştur

1. https://appstoreconnect.apple.com › **Uygulamalar** › **+** › **Yeni Uygulama**
2. Platform: iOS · Ad: **PARKPUSULA** · Birincil dil: Türkçe
3. Paket kimliği (Bundle ID): **tr.parkpusula.app** — listede yoksa önce https://developer.apple.com/account/resources/identifiers/list adresinden **App IDs** olarak bu kimliği oluştur.
4. SKU: `parkpusula`

## 3. App Store Connect API anahtarı (Codemagic'in imzalama yapabilmesi için)

1. App Store Connect › **Kullanıcılar ve Erişim** › **Entegrasyonlar** › **App Store Connect API** › **Ekip Anahtarları** › **+**
2. Ad: `Codemagic` · Erişim: **App Manager**
3. Oluşan **.p8** dosyasını indir (yalnızca bir kez indirilebilir), **Issuer ID** ve **Key ID** değerlerini not al.

## 4. Codemagic

1. https://codemagic.io/signup — GitHub hesabınla giriş yap.
2. **Add application** › GitHub › **Parkpusula** deposunu seç › proje türü: **React Native App**.
3. **Teams › Personal Account › Integrations › Developer Portal (App Store Connect)** › **Connect**
   - Name: **PARKPUSULA** (codemagic.yaml'daki adla aynı olmalı)
   - Issuer ID, Key ID ve .p8 dosyasını gir.
4. **Code signing identities** › iOS certificates › **Generate certificate** (Codemagic senin için dağıtım sertifikası oluşturur) › iOS provisioning profiles › **Fetch profiles** ya da otomatik oluşturma.
5. Uygulama sayfasında **Start new build** › iş akışı: **iOS TestFlight**.

İlk derlemeler hata verebilir. Hata olursa Codemagic'teki derleme kaydının hata veren adımını kopyalayıp Claude'a gönder.

## 5. TestFlight ile iPhone'a kur

1. App Store'dan **TestFlight** uygulamasını indir.
2. Derleme bitince App Store Connect › PARKPUSULA › **TestFlight** sekmesinde görünür (Apple'ın işlemesi 10-30 dk sürebilir).
3. Kendini **Dahili Test** grubuna ekle; TestFlight uygulamasından kur.

## 6. Android (isteğe bağlı)

1. Google Cloud › **API'ler ve Hizmetler** › **Kitaplık** › **Maps SDK for Android** › Etkinleştir.
2. **Kimlik Bilgileri** › yeni API anahtarı › kısıtlama: **Android uygulamaları** › paket adı `tr.parkpusula.app` (SHA-1 parmak izi ilk derlemeden sonra eklenebilir).
3. Codemagic › uygulama › **Environment variables** › grup adı **maps** › değişken **ANDROID_MAPS_KEY** = anahtar (Secure işaretli).
4. **Start new build** › **Android test APK**. Çıkan APK dosyası Android telefona doğrudan kurulabilir.
