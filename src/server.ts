import * as crypto from "crypto";
import * as fs from "fs";
import * as http from "http";
import {
  cleanupDownload,
  cookiesStatus,
  downloadVideo,
  pickFormat,
  probe,
  safeFilename,
  streamVideo,
  toVideoInfo,
  translateError,
} from "./downloader";
import { SunucuOptions } from "./types";
import { checkUrl } from "./urlguard";

const MAX_BYTES = parseInt(process.env.MAX_BYTES ?? "", 10) || 500 * 1024 * 1024;
const MAX_DURATION_SEC = parseInt(process.env.MAX_DURATION_SEC ?? "", 10) || 900;
const STREAM_TIMEOUT_MS = 600_000;

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2) + "\n";
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * url= değerini ham sorgu metninden alır; searchParams'a bırakmıyoruz.
 *
 * İki sebep: (1) kodlanmamış bir video adresi kendi & ve = işaretlerini taşır
 * (`?v=abc&t=30s`) ve searchParams bunları parametre sınırı sanıp adresi keser;
 * (2) ham kabul edince kestirmedeki "URL Kodla" aksiyonu gereksizleşiyor, elle
 * kurulum 4 adımdan 2'ye iniyor.
 *
 * Bu yüzden url= her zaman sorgunun SON parametresi olmak zorunda — sonrasındaki
 * her şey adrese ait sayılır. Zaten kodlanmış gelen istekler de çalışsın diye,
 * ham değer http(s):// ile başlamıyorsa bir kez çözmeyi deniyoruz.
 */
export function rawUrlParam(search: string): string {
  const m = /(?:^|[?&])url=(.*)$/s.exec(search);
  if (!m) return "";
  const raw = m[1];
  if (/^https?:\/\//i.test(raw)) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function isAuthorized(req: http.IncomingMessage, url: URL, token: string): boolean {
  const header = (req.headers["x-indir-token"] as string | undefined) ?? "";
  const bearer = ((req.headers["authorization"] as string | undefined) ?? "").replace(/^Bearer\s+/i, "");
  const query = url.searchParams.get("t") ?? "";
  const provided = header || bearer || query;
  return provided.length > 0 && timingSafeEqual(provided, token);
}

/**
 * HTTP başlıkları latin-1. Türkçe başlıklar için ASCII sürüm filename=, orijinal
 * RFC 5987 filename*= ile gider — Shortcuts dosya tipini bu addan ve Content-Type'tan
 * çıkarır, o yüzden uzantının .mp4 kalması şart.
 */
function contentDisposition(title: string): string {
  const { ascii, utf8 } = safeFilename(title, "mp4");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(utf8)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function baseUrl(req: http.IncomingMessage): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
  const host = (req.headers["host"] as string | undefined) ?? "localhost";
  return `${proto.split(",")[0]}://${host}`;
}

/**
 * Token'sız gelene gösterilir. Kurulum sayfası token'ı ekrana bastığı için kendisi de
 * korunmak zorunda: Render alt alan adları CT loglarında herkese açık listelendiğinden
 * adresin bilinmemesi bir koruma sayılmaz.
 */
function tokenIstePage(): string {
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Video İndir — parola gerekli</title>
<style>
 body{font:16px/1.6 -apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:24px;max-width:640px;background:#f7f7f8;color:#111}
 h1{font-size:22px}
 input{font:inherit;padding:10px;width:100%;box-sizing:border-box;border:1px solid #ccc;border-radius:8px}
 button{font:inherit;padding:10px 16px;margin-top:12px;border:0;border-radius:8px;background:#0a84ff;color:#fff;width:100%}
 code{background:#e9e9ec;border-radius:6px;padding:2px 5px;font-size:14px}
 ol{padding-left:20px} li{margin:8px 0}
</style></head><body>
<h1>Parola gerekli</h1>
<p>Kurulum sayfası kestirmenin parolasını ekrana yazdığı için parolayla korunuyor.</p>
<form method="GET" action="/">
  <input name="t" type="password" placeholder="INDIR_TOKEN" autocomplete="off" autofocus>
  <button type="submit">Aç</button>
</form>
<h2 style="font-size:17px">Parolayı nereden alacaksın?</h2>
<ol>
  <li>Render panelinde servisini aç.</li>
  <li>Soldan <b>Environment</b> sekmesine gir.</li>
  <li><code>INDIR_TOKEN</code> satırındaki değeri kopyala, yukarıya yapıştır.</li>
</ol>
</body></html>
`;
}

function setupPage(req: http.IncomingMessage, token: string): string {
  const indirUrl = `${baseUrl(req)}/indir?t=${encodeURIComponent(token)}&url=`;
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Video İndir — iPhone Kestirmesi</title>
<style>
 body{font:16px/1.6 -apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:24px;max-width:640px;background:#f7f7f8;color:#111}
 h1{font-size:22px} h2{font-size:17px;margin-top:28px}
 code,pre{background:#e9e9ec;border-radius:6px}
 code{padding:2px 5px;font-size:14px}
 pre{padding:12px;overflow-x:auto;word-break:break-all;white-space:pre-wrap;font-size:13px}
 ol{padding-left:20px} li{margin:10px 0}
 .uyari{background:#fff4e5;border-left:4px solid #f5a623;padding:10px 14px;border-radius:4px;font-size:14px}
 button{font:inherit;padding:10px 16px;border:0;border-radius:8px;background:#0a84ff;color:#fff;width:100%}
</style></head><body>
<h1>Video İndir — kurulum</h1>

<p>iPhone'da <b>Kısayollar</b> → <b>+</b> ile yeni kestirme oluştur, şu 2 aksiyonu ekle.</p>

<h2>1. URL İçeriğini Al</h2>
<p>Ara: <code>URL İçeriğini Al</code>. URL alanına aşağıdaki adresi yapıştır, imleç
<b>en sondayken</b> klavye üstündeki değişken çubuğundan <b>Kestirme Girdisi</b>'ni ekle.</p>
<pre id="u">${escapeHtml(indirUrl)}</pre>
<button onclick="navigator.clipboard.writeText(document.getElementById('u').textContent);this.textContent='Kopyalandı ✓'">Adresi kopyala</button>

<h2>2. Fotoğraf Albümüne Kaydet</h2>
<p>Ara: <code>Fotoğraf Albümüne Kaydet</code>. Başka ayar gerekmez.</p>

<h2>Son ayar</h2>
<p>Kestirme ayarlarında (ⓘ) <b>Paylaşım Sayfasında Göster</b>'i aç, kabul edilen tür
olarak <b>URL</b> ve <b>Metin</b> seçili olsun. Adını <b>Video İndir</b> koy.</p>

<p class="uyari">Bu adresteki <b>t=</b> değeri parolandır; kimseyle paylaşma. Sızarsa
sunucudaki <code>INDIR_TOKEN</code> değişkenini değiştir ve 2. adımdaki metni güncelle.</p>

<h2>Kullanım</h2>
<p>LinkedIn / Instagram / X / YouTube uygulamasında videoyu aç → <b>Paylaş</b> →
<b>Video İndir</b>. Video Fotoğraflar'a düşer.</p>
<p style="font-size:13px;color:#666">Fotoğraflar'a kaydedilmezse 2. aksiyonu
<b>Dosyayı Kaydet</b> ile değiştiren ikinci bir kestirme kur.</p>
</body></html>
`;
}

export function createServer(opts: SunucuOptions): http.Server {
  const maxConcurrent = opts.maxConcurrent ?? 2;
  let active = 0;

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", baseUrl(req));
    const route = url.pathname.replace(/\/+$/, "") || "/";

    // /health auth'suz ve yt-dlp çağırmadan yanıtlar: uyku önleyici cron ping'i ucuz olsun.
    if (route === "/health") {
      sendJson(res, 200, { ok: true, cookies: cookiesStatus() });
      return;
    }

    if (route === "/" || route === "/kestirme") {
      const yetkili = isAuthorized(req, url, opts.token);
      const body = yetkili ? setupPage(req, opts.token) : tokenIstePage();
      res.writeHead(yetkili ? 200 : 401, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      });
      res.end(body);
      return;
    }

    if (route !== "/indir" && route !== "/bilgi") {
      sendJson(res, 404, { ok: false, error: "Böyle bir adres yok." });
      return;
    }

    if (!isAuthorized(req, url, opts.token)) {
      sendJson(res, 401, { ok: false, error: "Geçersiz veya eksik token." });
      return;
    }

    const checked = await checkUrl(rawUrlParam(url.search));
    if (!checked.ok || !checked.url) {
      sendJson(res, 400, { ok: false, error: checked.error });
      return;
    }

    if (active >= maxConcurrent) {
      sendJson(res, 429, { ok: false, error: "Sunucu meşgul, birazdan tekrar deneyin." });
      return;
    }

    active += 1;
    let released = false;
    const release = (): void => {
      if (!released) {
        released = true;
        active -= 1;
      }
    };

    try {
      const { raw, stderr } = await probe(checked.url);
      if (!raw) {
        sendJson(res, 502, { ok: false, error: translateError(stderr) });
        return;
      }

      const info = toVideoInfo(raw, checked.url);

      if (route === "/bilgi") {
        sendJson(res, 200, { ok: true, ...info });
        return;
      }

      // k=hizli → sadece tek parça formatlar (anında akar, çözünürlük düşebilir)
      const fast = (url.searchParams.get("k") ?? "") === "hizli";
      const choice = pickFormat(raw, fast ? 720 : 1080);

      if (choice.mode === "stream" && choice.formatId) {
        await streamToResponse(res, checked.url, choice.formatId, info.title);
        return;
      }

      if (fast) {
        sendJson(res, 415, {
          ok: false,
          error: "Bu video hızlı modda indirilemiyor. k=hizli parametresini kaldırın.",
        });
        return;
      }

      // Mod B'de indirme bitene kadar hiç byte akmaz; iOS 60 sn'lik boşluk
      // zaman aşımına takılmasın diye uzun videolar baştan reddedilir.
      if (info.duration != null && info.duration > MAX_DURATION_SEC) {
        sendJson(res, 413, {
          ok: false,
          error: `Video çok uzun (${Math.round(info.duration / 60)} dk). Bağlantıya &k=hizli ekleyin.`,
        });
        return;
      }

      await sendDownloadedFile(res, checked.url, info.title);
    } catch (err) {
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: (err as Error).message });
      } else {
        res.end();
      }
    } finally {
      // streamToResponse yalnızca yt-dlp süreci kapandığında resolve olur, yani
      // buraya gelindiğinde iş gerçekten bitmiştir. release idempotent.
      release();
    }
  });
}

/**
 * Mod A. Başlıklar ilk byte gelene kadar yazılmaz: yt-dlp hemen hata verirse hâlâ
 * düzgün bir JSON hatası dönebiliriz. İlk chunk geldikten sonra 200 yazılır ve
 * gerisi pipe edilir — böylece byte akışı kesilmez ve iOS zaman aşımına düşmez.
 */
function streamToResponse(
  res: http.ServerResponse,
  url: string,
  formatId: string,
  title: string
): Promise<void> {
  return new Promise((resolve) => {
    const child = streamVideo(url, formatId);
    let sent = 0;
    let headersWritten = false;
    let stderrBuf = "";

    const finish = (): void => {
      resolve();
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, STREAM_TIMEOUT_MS);

    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderrBuf.length < 8192) {
        stderrBuf += chunk.toString();
      }
    });

    child.stdout?.once("data", (first: Buffer) => {
      headersWritten = true;
      res.writeHead(200, {
        "Content-Type": "video/mp4",
        "Content-Disposition": contentDisposition(title),
        "Cache-Control": "no-store",
      });
      res.write(first);
      child.stdout?.pipe(res);
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      sent += chunk.length;
      if (sent > MAX_BYTES) {
        child.kill("SIGKILL");
        res.destroy();
      }
    });

    // İstemci vazgeçerse (kestirme iptal edildi) yt-dlp'yi boşuna çalıştırma.
    res.on("close", () => {
      if (!res.writableEnded) {
        child.kill("SIGKILL");
      }
    });

    child.on("error", () => {
      clearTimeout(timer);
      if (!headersWritten) {
        sendJson(res, 502, { ok: false, error: "yt-dlp çalıştırılamadı." });
      } else {
        res.end();
      }
      finish();
    });

    child.on("close", () => {
      clearTimeout(timer);
      if (!headersWritten) {
        sendJson(res, 502, { ok: false, error: translateError(stderrBuf) });
      } else {
        res.end();
      }
      finish();
    });
  });
}

/** Mod B. Birleştirme/remux gerektiren videolar: önce diske, sonra gönder, sonra sil. */
async function sendDownloadedFile(res: http.ServerResponse, url: string, title: string): Promise<void> {
  const result = await downloadVideo(url);
  if (!result) {
    sendJson(res, 502, { ok: false, error: "Video indirilemedi." });
    return;
  }

  await new Promise<void>((resolve) => {
    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Disposition": contentDisposition(title),
      "Content-Length": result.size,
      "Cache-Control": "no-store",
    });
    const stream = fs.createReadStream(result.filePath);
    stream.on("error", () => {
      res.end();
      resolve();
    });
    stream.on("close", resolve);
    stream.pipe(res);
  });

  cleanupDownload(result.dir);
}

export function startServer(opts: SunucuOptions): http.Server {
  const server = createServer(opts);
  server.listen(opts.port, () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : opts.port;
    console.log(`Sunucu ${port} portunda. Kurulum sayfası: http://localhost:${port}/`);
  });
  return server;
}
