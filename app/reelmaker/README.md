# Reel Atölyesi

Fotoğraflardan müzikle senkron 9:16 reel videosu üreten, telefonda çalışan tek dosyalık web uygulaması.
App Store'daki "Reels・Edit Video for Instagram" akışının açık kaynak karşılığı: şablon seç → fotoğraf ekle
→ müzik/tempo ayarla → yazı koy → videoyu dışa aktar.

## Özellikler

- **8 geçiş şablonu** — Zoom Punch, Flash Cut, Whip Pan, Slide, Soft Fade, Glitch, Flip, Polaroid
- **Vuruşa senkron kurgu** — kare süresi BPM'e bağlı (kare başına 1–8 vuruş), her vuruşta nabız efekti
- **Müzik** — kendi ses dosyan (MP3/M4A, başlangıç noktası kırpmalı) veya uygulamanın Web Audio ile
  ürettiği telifsiz ritimler (Trap / House / Pop / Lo-fi / Sinematik), seçilen BPM'de üretilir
- **Tempoya vur** — parçanın temposunu elle bulmak için tap-tempo
- **7 renk filtresi**, film greni, kenar karartma
- **Başlık** (4 stil × 3 konum, sadece girişte veya tüm video) ve kullanıcı adı filigranı
- **Oranlar** — 9:16, 4:5, 1:1
- **Dışa aktarma** — Canvas + MediaRecorder ile gerçek video dosyası (mümkünse MP4, değilse WebM),
  standart veya 1080p

Harici çalışma zamanı bağımlılığı yok; sadece Google Fonts'tan yazı tipi çeker.

## Telefonda kullanım

Uygulama tek bir `index.html`. Herhangi bir statik sunucuda barındırılıp iPhone'da Safari ile açılır,
**Paylaş → Ana Ekrana Ekle** ile uygulama gibi ikonlu çalışır (gerekli `apple-mobile-web-app-*` meta
etiketleri ve ikon çalışma anında enjekte edilir).

Yerelde denemek için:

```bash
npx http-server app/reelmaker -p 8080
```

## Videoyu kaydetme

- Kendi sunucunda: "Telefona kaydet" normal tarayıcı indirmesini tetikler.
- claude.ai artifact olarak yayınlandığında: `downloads` capability'si üzerinden kaydedilir
  (`window.claude.use("downloads")`), iOS'ta sistem paylaşım sayfası açılır.
- Web Share API destekleniyorsa ayrıca "Paylaş" düğmesi çıkar — videoyu doğrudan Instagram'a gönderir.

## Sınırlar

- Girdi olarak fotoğraf alır; video klip eklemeyi desteklemez.
- Dışa aktarma gerçek zamanlıdır: 30 saniyelik reel 30 saniyede üretilir, bu sırada sekme açık kalmalı.
- Çıktı biçimi tarayıcının `MediaRecorder` desteğine bağlıdır (Safari 17+ MP4, diğerleri genelde WebM).
- Dahili ritimler sentezlenir; ticari parçalar telif nedeniyle paketlenmez, onları kendin eklersin.
