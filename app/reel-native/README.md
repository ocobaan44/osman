# Reel Atölyesi — iOS uygulaması

Fotoğraflardan müzikle senkron reel videosu üreten native iOS uygulaması.
React Native + Expo SDK 57. Video üretimi AVFoundation ile yazılmış yerel bir
Expo modülünde yapılır.

## Telefona kurmanın iki yolu

### 1) Expo Go — bugün, ücretsiz, Apple hesabı gerekmez

Kütüphane, editör, şablonlar, müzik, yazı katmanları ve canlı önizleme çalışır.
**Video oluşturma çalışmaz** — Expo Go özel native kod yükleyemez.

Bilgisayarında:

```bash
cd app/reel-native
npm install
npx expo start
```

iPhone'unda App Store'dan **Expo Go**'yu indir, telefon ve bilgisayar aynı
Wi-Fi'da olsun, terminaldeki karekodu Kamera ile okut.

### 2) Development build — video oluşturma dahil her şey

Yerel native modül (`modules/reel-exporter`) derlendiği için gerçek bir uygulama
kurulur. İki seçenek:

**a. Mac + Xcode ile** (ücretsiz Apple ID yeter, uygulama 7 gün geçerli olur):

```bash
cd app/reel-native
npm install
npx expo prebuild --platform ios --clean
npx expo run:ios --device
```

**b. Mac yoksa, EAS Build ile** (Apple Developer Program üyeliği gerekir, ~$99/yıl):

```bash
npm install -g eas-cli
eas login
eas build --platform ios --profile development
```

Çıkan bağlantıyı telefonda açıp yükle, sonra `npx expo start --dev-client`.

## Özellikler

- **Proje kütüphanesi** — kapak, süre ve tarihle kartlar; yeniden adlandır,
  kopyala, sil. Her düzenleme otomatik kaydedilir (cihazın kendi dosya sistemi).
- **8 geçiş şablonu** — Zoom Punch, Flash Cut, Whip Pan, Slide, Soft Fade,
  Glitch, Flip, Polaroid
- **Vuruşa senkron kurgu** — kare süreleri tempoya bağlı; her vuruşta nabız
- **Kare kare düzenleme** — süre, yakınlaştırma, kadraj, 90° döndürme, çoğaltma,
  silme; önizlemede parmakla kadraj kaydırma
- **Zaman çizgisi** — süreyle orantılı kareler ve oynatma kafası
- **Müzik** — 5 telifsiz dahili ritim (Pop, Trap, House, Lo-fi, Sinematik) ya da
  telefonundaki bir ses dosyası
- **Yazı katmanları** — 4 stil, boyut, serbest konum, "sadece başta" veya tüm video
- **7 renk filtresi**, kenar karartma, kullanıcı adı filigranı
- **Oranlar** — 9:16, 4:5, 1:1 · çıktı 1080p, 30 fps, H.264 MP4
- **Geri al** — 25 adım
- **Fotoğraflar'a kaydet** — üretilen video doğrudan galeriye

## Dahili ritimler

`assets/beats/*.wav` dosyaları `tools/make-beats.js` ile sentezlenir — hiçbir
telifli kayıt içermez. 100 BPM referansla üretilir, uygulama `playbackRate` ile
hedef tempoya çeker. Yeniden üretmek için:

```bash
npm run beats
```

## Mimari

```
App.tsx                      ekran yönlendirme, proje listesi
src/engine.ts                geçiş matematiği (worklet uyumlu saf fonksiyonlar)
src/store.ts                 proje ve medya kalıcılığı (expo-file-system)
src/beats.ts                 dahili ritim varlıkları ve tempo oranı
src/components/ReelStage.tsx Reanimated önizleme motoru
src/screens/                 kütüphane ve editör
modules/reel-exporter/       yerel Expo modülü
  ios/ReelExporterModule.swift  AVAssetWriter ile kodlama, ses zaman çizgisi
  ios/ReelFrame.swift           kare çizimi (Core Graphics) + Core Image filtreler
```

`src/engine.ts` ile `ReelFrame.swift` aynı geçiş matematiğini uygular — önizleme
ile dışa aktarılan video aynı görünsün diye. Birini değiştirirsen diğerini de
değiştir.

## Doğrulama durumu

Bu ortamda (Linux) yapılabilenler yapıldı:

- `npm run typecheck` → 0 hata
- `npm run bundle:check` (Metro ile iOS bundle) → 1103 modül, temiz

**Swift tarafı derlenmedi.** iOS derlemesi için macOS ve Xcode gerekir; bu
depoda yalnızca kaynak var. İlk `expo run:ios` çalıştırmanda derleme hatası
çıkarsa bu beklenen bir durumdur, hatayı bildir.

## Bilinen sınırlar

- Girdi olarak fotoğraf alır; video klip eklemeyi desteklemez.
- Önizlemedeki renk filtreleri yaklaşıktır (RN'de CSS filtresi yok, karışım
  kipiyle yapılır). Dışa aktarılan videoda filtre Core Image ile birebir uygulanır.
- Önizlemede kenar karartma üst/alt gradyanla yapılır; videoda gerçek radyal
  gradyandır.
- Projeler cihazda saklanır; cihazlar arası eşitleme yok.
- Android tarafı için native dışa aktarıcı yazılmadı; uygulama Android'de
  çalışır ama video üretmez.
