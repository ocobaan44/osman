# Video İndir — iPhone Kestirmesi Kurulumu

LinkedIn, Instagram, X, TikTok, Facebook, YouTube ve yt-dlp'nin desteklediği
1800+ siteden videoyu iPhone'un **Paylaş** menüsünden doğrudan Fotoğraflar'a indirir.

> Kişisel kullanım içindir. İndirdiğin videonun telifi sahibine aittir ve
> platformların kullanım şartları geçerlidir; içeriği yeniden yayınlama.

---

## Neden bir sunucu gerekiyor?

LinkedIn/Instagram gibi siteler videoyu sayfaya gömülü düz bir dosya olarak vermiyor;
sayfa içi JSON'dan çözümlemek gerekiyor. Bunu yapan araç **yt-dlp** ve iPhone'da
çalışmıyor. Bu yüzden kestirme, yt-dlp'yi çalıştıran küçük bir sunucuya bağlanır.

```
iPhone Paylaş → GET /indir?t=<token>&url=<video>  →  Render (yt-dlp)  →  MP4  →  Fotoğraflar
```

---

## 1. Sunucuyu kur (bir kez, ~5 dakika)

1. Bu repoyu GitHub'a gönder (zaten orada).
2. [render.com](https://render.com) → **New** → **Blueprint** → repoyu seç.
   `render.yaml` okunur, Docker imajı derlenir.
3. Deploy bitince **Environment** sekmesinden `INDIR_TOKEN` değerini kopyala —
   bu senin parolan.
4. `https://<servis-adin>.onrender.com/health` adresini aç, `{"ok":true}` görmelisin.

### Uyku sorunu (önemli)

Render ücretsiz katmanı **15 dakika hareketsizlikten sonra uyur** ve uyanması
**30–60 saniye** sürer. Gün içindeki ilk paylaşımda kestirme hata verebilir; ikinci
denemede çalışır.

Kalıcı çözüm: [cron-job.org](https://cron-job.org) veya UptimeRobot ile **10 dakikada
bir** `https://<servis>.onrender.com/health` adresine ping kur. Ücretsiz katman ayda
750 saat veriyor, 31 günlük ay 744 saat — **tek servis** çalıştırdığın sürece yeter.

---

## 2. Kestirmeyi kur (~2 dakika)

Telefonda `https://<servis-adin>.onrender.com/` adresini aç. Sayfa parola soracak —
Render → **Environment** → `INDIR_TOKEN` değerini yapıştır. (Sayfa token'ı ekrana
bastığı için kendisi de korunuyor: Render alt alan adları Certificate Transparency
loglarında herkese açık listelendiğinden adresin bilinmemesi koruma sayılmaz.)

Parolayı girince kurulum sayfası sunucu adresini ve token'ı **önceden doldurulmuş**
halde verir, 2. adımdaki metni tek dokunuşla kopyalarsın.

Kısayollar → **+** → şu aksiyonları sırayla ekle:

| # | Aksiyon | Ayar |
|---|---------|------|
| 1 | **URL İçeriğini Al** | URL: yapıştırdığın adres + sonuna `Kestirme Girdisi` değişkeni |
| 2 | **Fotoğraf Albümüne Kaydet** | — |

Sunucu `url=` değerini ham haliyle okuduğu için ayrı bir **URL Kodla** adımı gerekmiyor.

Sonra kestirme ayarları (ⓘ) → **Paylaşım Sayfasında Göster** açık, kabul edilen
tür **URL** ve **Metin**. Adı: **Video İndir**.

### Kullanım
LinkedIn uygulamasında gönderiyi aç → **Paylaş** → **Video İndir**. Birkaç saniye
sonra video Fotoğraflar'da.

### Yedekleme
Kestirmeyi kurduktan sonra **Paylaş → iCloud Bağlantısını Kopyala** yap ve linki
bir yere kaydet; telefon değişirse tek dokunuşla geri gelir.

Kestirmeyi hazır dosya olarak veremiyoruz: iOS imzasız `.shortcut` dosyalarının içe
aktarılmasını tümden reddediyor ("İmzalanmamış kestirmelerin dosyalarının içe
aktarılması desteklenmiyor") ve imzalama ancak gerçek bir cihazda paylaşarak oluyor.
Bu yüzden ilk kurulum elle, sonraki her kurulum iCloud bağlantısıyla.

---

## 3. Giriş gerektiren içerik (çerezler)

Herkese açık olmayan LinkedIn/Instagram gönderileri için oturum çerezi gerekir.

1. Tarayıcıya bir **cookies.txt** eklentisi kur (Netscape formatı), ilgili sitede
   giriş yapmışken çerezleri dışa aktar.
2. Render → servis → **Environment** → **Secret Files** → `cookies.txt` yükle.
3. `COOKIES_FILE` değişkenini `/etc/secrets/cookies.txt` yap, servisi yeniden başlat.

`/health` çıktısındaki `cookies.ageDays` çerezin kaç günlük olduğunu söyler.

**Uyarılar**
- Çerezler haftalar içinde geçersizleşir; ~3 ayda bir yenile.
- Çerez dosyası hesabına tam erişim demektir — repoya **asla** koyma
  (`.gitignore`'da zaten dışlanmış).
- LinkedIn/Instagram otomasyonu tespit edebilir; ikincil hesap kullanmak daha güvenli.

---

## 4. Bilinen sınırlar

| Sınır | Ayrıntı |
|---|---|
| **YouTube güvenilirliği** | Render'ın IP'leri veri merkezi IP'si; YouTube bunlara "robot musun?" doğrulaması gösterebilir. Çerez yardımcı olur ama hesap riski taşır — atılabilir bir hesap kullan. LinkedIn/Instagram/X'te bu sorun yok. |
| **DRM'li içerik** | Netflix, Disney+ vb. indirilemez. |
| **Uzun videolar** | 15 dakikadan uzun ve birleştirme gerektiren videolar reddedilir; bağlantıya `&k=hizli` ekle (daha düşük çözünürlük, anında akar). |
| **Boyut** | 500 MB üstü reddedilir (`MAX_BYTES` ile değiştirilebilir). |
| **yt-dlp bayatlaması** | Siteler değiştikçe kırılır. Render'da **Manual Deploy → Clear build cache & deploy** ile yt-dlp güncellenir. |
| **Fotoğraflar reddederse** | 2. aksiyonu **Dosyayı Kaydet** yapan ikinci bir kestirme kur. |

---

## Yerel kullanım (bilgisayarda)

```bash
npm install
npm run build

# tek video indir
npx ts-node src/index.ts indir --url "https://www.linkedin.com/posts/..." --out indirilenler

# sunucuyu yerel çalıştır
INDIR_TOKEN=$(openssl rand -base64 32) npm run sunucu
```
`yt-dlp` ve `ffmpeg` yerelde kurulu olmalı (Docker imajında hazır gelir).

## Uç noktalar

| Adres | Açıklama |
|---|---|
| `GET /` veya `/kestirme` | Kurulum sayfası — token ister |
| `GET /kestirme.shortcut?t=` | Kurulabilir `.shortcut` dosyası (imzasız) |
| `GET /health` | Sağlık kontrolü — token gerekmez, uptime ping'i için ucuz |
| `GET /indir?t=&url=&k=` | Videoyu MP4 olarak döner. `k=hizli` → sadece tek parça formatlar |
| `GET /bilgi?t=&url=` | Sadece metadata (başlık, süre, boyut) |

Token `t=` sorgu parametresi yerine `X-Indir-Token` başlığıyla da gönderilebilir.
