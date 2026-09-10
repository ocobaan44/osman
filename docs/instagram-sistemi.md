# Instagram Büyüme Sistemi

## Önce dürüst olalım

Hiçbir sistem "her paylaşım viral olur" garantisi veremez. Dağıtımı Instagram'ın
algoritması ve izleyici davranışı belirler; ikisi de dışarıdan kontrol edilemez.
Viralliği satın alınabilir bir şey gibi pazarlayan araçlar (bot, otomatik
beğeni, takipçi satın alma, engagement pod) hesabın erişimini kalıcı olarak
düşürür ve Instagram kurallarını ihlal eder. Bu sistem onların hiçbirini
yapmaz.

Yapabildiği şey şu: viral olma **olasılığını** belirleyen sinyaller ölçülebilir
ve öğrenilebilir. Bir gönderi, kendi takipçi çemberinin dışına ancak küçük bir
test havuzunda iyi sinyal üretirse çıkar. Bu sistem o sinyalleri gönderiden
önce puanlar, sonra gerçek sonuçları ölçüp neyin çalıştığını söyler.

## Sistemin dayandığı dört sinyal

| Sinyal | Neden önemli |
|---|---|
| İlk 3 saniye tutunması | İzleyici burada kaydırırsa gönderi test havuzundan çıkamaz |
| DM/story paylaşımı | Erişimin en güçlü tek yordayıcısı; hesabı çemberin dışına o taşır |
| Kaydetme | Referans değeri; içeriğin ömrünü uzatır |
| İzlenme oranı | Ortalama izlenme / süre; tekrar dağıtımı bu belirler |

Beğeni bilinçli olarak hiç puanlanmaz. Dağıtıma katkısı en zayıf sinyaldir ve
takip edildiğinde yanlış içeriğe yatırım yaptırır.

## Kurulum

```bash
npm install

npx ts-node src/index.ts viral init \
  --handle kullanici_adin \
  --niche "otomotiv ve araç danışmanlığı" \
  --followers 3200 \
  --posts-per-week 4 \
  --pillars "2. el alım tuzakları,BMW sahipliği maliyeti,servis perde arkası"
```

Bu komut `instagram.config.json` dosyasını oluşturur. Temalar (`pillars`) en
önemli ayardır: hesabın tekrar tekrar döndüğü konulardır ve algoritmaya hesabın
ne hakkında olduğunu onlar öğretir. Üç ila beş tane yeter.

Kısayol olarak `npm run viral -- <komut>` de kullanılabilir.

## Haftalık döngü

### 1. Planı üret

```bash
npx ts-node src/index.ts viral plan --weeks 4
```

Dört haftalık takvim çıkar: her gönderi için biçim, hedeflenen davranış, hook,
sahne sahne akış ve eylem çağrısı. Plan deterministiktir; aynı profil aynı planı
üretir, böylece üzerinde konuşulabilir. On farklı arketip ve temalar farklı
hızlarda döndüğü için aynı kalıp aynı temaya uzun aralıklarla denk gelir.

`--score` eklersen her fikir ayrıca puanlanır.

### 2. Hook'u seç

```bash
npx ts-node src/index.ts viral hooks --pillar "2. el alım tuzakları" --count 8
```

Her öneri hook gücü puanı ve neden işe yaradığının açıklamasıyla gelir. Köşeli
parantezler senin dolduracağın boşluklardır; sistem senin adına iddia uydurmaz.

### 3. Yayınlamadan önce puanla

```bash
npx ts-node src/index.ts viral score \
  --hook "Bunu bilmeden 2. el BMW alma" \
  --format reel --driver share --duration 22 \
  --caption "Bu hatayı yapan çok kişi gördüm." \
  --cta "Araba bakan bir arkadaşına gönder." \
  --beats "0-3 sn uyarı|3-10 sn hata|10-18 sn kanıt|18-22 sn loop" \
  --loop
```

100 üzerinden puan, yedi boyutun ayrı ayrı kırılımı ve her zayıf boyut için
somut bir düzeltme verir.

| Not | Anlamı |
|---|---|
| A (80+) | Yayınla |
| B (65-79) | En düşük iki boyutu düzelt, sonra yayınla |
| C (50-64) | Hook ve paylaşım tetikleyicisini yeniden yaz |
| D (50 altı) | Baştan kur |

### 4. Sonucu kaydet

Yayından 48 saat sonra, Instagram'ın kendi istatistiklerinden okuyup gir:

```bash
npx ts-node src/index.ts viral track \
  --id r1 --date 2026-08-04 --format reel \
  --pillar "2. el alım tuzakları" --hook "Bunu bilmeden 2. el alma" \
  --reach 41000 --shares 820 --saves 1100 \
  --likes 2400 --comments 190 --follows 610 \
  --avg-watch 14 --duration 21
```

Veri `data/instagram-posts.json` içinde birikir.

### 5. Raporu oku

```bash
npx ts-node src/index.ts viral report
```

Mutlak sayılar hesap büyüdükçe yanıltır; bu yüzden her şey erişime oranlanır.
Rapor gönderileri dört sınıfa ayırır:

- **viral-motor** — çemberin dışına çıkmış ve paylaşılmış
- **sağlam** — iyi erişmiş ama yayılmamış
- **dönüştürüyor** — az kişiye ulaşmış, ulaştığını takipçiye çevirmiş
- **ölü** — ne erişim ne dönüşüm

Raporun sonundaki "Bu hafta ne yap" bölümü, verinin söylediği somut aksiyonları
verir: hangi temayı iki katına çıkaracağını, hangisini bırakacağını.

Her komut `--json` kabul eder.

## Asıl kural

Bu sistemin tek bir işleyiş mantığı var: **çalışan kalıbı tekrar et.**

Rapor bir gönderiyi viral-motor olarak işaretlediğinde, o gönderinin konusunu
değil formatını tekrarla. Aynı hook kalıbını, aynı süreyi, aynı akışı farklı bir
temayla yeniden çek. Tek bir viral gönderi rastlantı olabilir; aynı kalıbın
ikinci kez tutması artık bilgidir.

İlk anlamlı sonucu görmek için en az 12 gönderilik veri gerekir. Ondan önceki
her yorum gürültüdür.
