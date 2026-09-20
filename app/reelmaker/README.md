# Reel Atölyesi

Fotoğraflardan müzikle senkron 9:16 reel videosu üreten, telefonda çalışan tek dosyalık web uygulaması.
App Store'daki "Reels・Edit Video for Instagram" akışının açık kaynak karşılığı.

## Uygulama akışı

**Kütüphane** → proje kartları (kapak, süre, tarih), yeniden adlandır / kopyala / sil.
**Editör** → Şablon · Medya · Müzik · Yazı · Aktar sekmeleri, zaman çizgisi ve geri alma.

## Özellikler

- **Projeler kalıcı** — her şey IndexedDB'de saklanır (fotoğraflar, ses dosyası, tüm ayarlar).
  Uygulamayı kapatıp açtığında projeler yerinde durur; düzenleme yaptıkça otomatik kaydedilir.
- **8 geçiş şablonu** — Zoom Punch, Flash Cut, Whip Pan, Slide, Soft Fade, Glitch, Flip, Polaroid;
  her biri panelde canlı animasyonlu önizlemeyle seçilir
- **Kare kare düzenleme** — kareye dokun: süre (vuruş), yakınlaştırma, kadraj, 90° döndürme,
  çoğaltma, silme. Önizleme üzerinde parmakla sürükleyerek kadraj kaydırma
- **Zaman çizgisi** — kareler süreleriyle orantılı, oynatma kafası ve dokunarak sarma
- **Vuruşa senkron kurgu** — kare süresi BPM'e bağlı, her vuruşta nabız efekti
- **Müzik** — kendi ses dosyan (projeyle birlikte saklanır, başlangıç noktası kırpmalı) veya
  Web Audio ile seçilen BPM'de üretilen telifsiz ritimler (Trap / House / Pop / Lo-fi / Sinematik)
- **Tempoya vur** — parçanın temposunu elle bulmak için tap-tempo
- **Yazı katmanları** — birden çok katman, 4 stil, boyut, önizlemede sürükleyerek serbest konum,
  "sadece başta" veya tüm video; ayrıca kullanıcı adı filigranı
- **7 renk filtresi**, film greni, kenar karartma
- **Oranlar** — 9:16, 4:5, 1:1
- **Geri al** — yapısal değişiklikler için 25 adımlı geçmiş
- **Dışa aktarma** — Canvas + MediaRecorder ile gerçek video dosyası (mümkünse MP4, değilse WebM),
  standart veya 1080p

Harici çalışma zamanı bağımlılığı yok; sadece Google Fonts'tan yazı tipi çeker.

## Telefonda kullanım

Uygulama tek bir `index.html`. Herhangi bir statik sunucuda barındırılıp iPhone'da Safari ile açılır,
**Paylaş → Ana Ekrana Ekle** ile uygulama gibi ikonuyla çalışır (gerekli `viewport` ve
`apple-mobile-web-app-*` meta etiketleri ile ikon çalışma anında enjekte edilir).

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
- Projeler tarayıcının kendi deposunda tutulur: cihazlar arası eşitleme yok, site verisi
  temizlenirse projeler de silinir. IndexedDB kapalıysa uygulama çalışır ama kayıt yapmaz.
- Dahili ritimler sentezlenir; ticari parçalar telif nedeniyle paketlenmez, onları kendin eklersin.
