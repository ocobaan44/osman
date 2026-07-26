import * as child_process from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { DownloadOptions, DownloadResult, FormatChoice, IndirOptions, VideoInfo } from "./types";
import { checkUrl } from "./urlguard";

const YTDLP_BIN = process.env.YTDLP_PATH ?? "yt-dlp";
const DEFAULT_MAX_FILESIZE = process.env.MAX_FILESIZE ?? "500M";
const DEFAULT_TIMEOUT_MS = 240_000;
const DEFAULT_MAX_HEIGHT = 1080;

interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

function runYtDlp(args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    // execFile (exec değil) — argümanlar dizi olarak geçer, shell yoktur.
    // URL kullanıcıdan geldiği için bu bir güvenlik gereği, tercih değil.
    child_process.execFile(
      YTDLP_BIN,
      args,
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs },
      (err: unknown, stdout: string, stderr: string) => {
        resolve({ ok: !err, stdout: stdout ?? "", stderr: stderr ?? "" });
      }
    );
  });
}

// Memoized: COOKIES_B64 süreç başına bir kez 0600 izinli geçici dosyaya açılır.
let cookiesPath: string | null | undefined;

function resolveCookiesFile(): string | null {
  const explicit = process.env.COOKIES_FILE;
  if (explicit && fs.existsSync(explicit)) {
    return explicit;
  }

  const encoded = process.env.COOKIES_B64;
  if (!encoded) {
    return null;
  }

  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "video-cookies-"));
    const target = path.join(dir, "cookies.txt");
    fs.writeFileSync(target, Buffer.from(encoded, "base64").toString("utf8"), { mode: 0o600 });
    return target;
  } catch {
    return null;
  }
}

export function ensureCookiesFile(): string | null {
  if (cookiesPath === undefined) {
    cookiesPath = resolveCookiesFile();
  }
  return cookiesPath;
}

export function cookiesStatus(): { present: boolean; ageDays: number | null } {
  const file = ensureCookiesFile();
  if (!file) {
    return { present: false, ageDays: null };
  }
  try {
    const mtime = fs.statSync(file).mtimeMs;
    return { present: true, ageDays: Math.floor((Date.now() - mtime) / 86_400_000) };
  } catch {
    return { present: true, ageDays: null };
  }
}

function buildCommonArgs(opts: DownloadOptions): string[] {
  const args = ["--no-playlist", "--no-warnings", "--no-progress"];
  const cookies = opts.cookiesFile ?? ensureCookiesFile();
  if (cookies) {
    args.push("--cookies", cookies);
  }
  return args;
}

/**
 * iPhone Fotoğraflar yalnızca H.264/HEVC video + AAC ses, MP4/MOV kap kabul eder.
 * yt-dlp'nin varsayılan "en iyi format" seçimi YouTube'da VP9/Opus (WebM) ya da AV1
 * verir; bu dosya "Fotoğraf Albümüne Kaydet" adımında sessizce başarısız olur.
 * Bu yüzden H.264 tercihi zorlanır. Yeniden kodlama (--recode-video) yok: hedef
 * ortam 0.1 vCPU, orada recode asla bitmez. Sadece ucuz remux.
 */
export function buildFormatArgs(maxFilesize: string, maxHeight: number = DEFAULT_MAX_HEIGHT): string[] {
  return [
    "-S",
    `vcodec:h264,acodec:aac,ext:mp4:m4a,res:${maxHeight}`,
    "-f",
    "bv*[vcodec^=avc1]+ba[ext=m4a]/b[ext=mp4][vcodec^=avc1]/b[ext=mp4]/b",
    "--merge-output-format",
    "mp4",
    "--remux-video",
    "mp4",
    "--max-filesize",
    maxFilesize,
  ];
}

/**
 * Mod A (akış) mı Mod B (indir-birleştir) mi?
 *
 * Mod A: tek parça (progressive) H.264/mp4 formatı varsa yt-dlp stdout'a yazar ve
 * doğrudan HTTP yanıtına pipe edilir — disk kullanılmaz, byte'lar 1-3 sn içinde
 * akmaya başlar. LinkedIn, Instagram, X, TikTok, Facebook bu kutuya girer.
 *
 * Mod B: sadece ayrı video+ses akışları (YouTube DASH) veya HLS varsa. HLS'i stdout'a
 * yazmak MPEG-TS üretir ve Fotoğraflar .ts kabul etmez, o yüzden HLS her zaman Mod B.
 */
export function pickFormat(raw: unknown, maxHeight: number = DEFAULT_MAX_HEIGHT): FormatChoice {
  const formats = (raw as { formats?: unknown })?.formats;
  if (!Array.isArray(formats)) {
    return { mode: "file", reason: "format listesi yok" };
  }

  const progressive = formats.filter((f: Record<string, unknown>) => {
    if (!f || typeof f !== "object") return false;
    const vcodec = typeof f.vcodec === "string" ? f.vcodec : "";
    const acodec = typeof f.acodec === "string" ? f.acodec : "";
    const protocol = typeof f.protocol === "string" ? f.protocol : "";
    const height = typeof f.height === "number" ? f.height : 0;
    return (
      f.ext === "mp4" &&
      vcodec !== "none" &&
      acodec !== "none" &&
      /^(avc1|h264)/i.test(vcodec) &&
      !protocol.startsWith("m3u8") &&
      height <= maxHeight
    );
  }) as Record<string, unknown>[];

  if (progressive.length === 0) {
    return { mode: "file", reason: "tek parça H.264/mp4 formatı yok" };
  }

  progressive.sort((a, b) => ((b.height as number) ?? 0) - ((a.height as number) ?? 0));
  const best = progressive[0];
  return {
    mode: "stream",
    formatId: String(best.format_id),
    height: typeof best.height === "number" ? best.height : null,
    reason: "tek parça H.264/mp4",
  };
}

/** yt-dlp'nin ham hatasını kullanıcıya gösterilebilir Türkçe mesaja çevirir. */
export function translateError(stderr: string): string {
  const text = (stderr ?? "").toLowerCase();

  if (text.includes("sign in to confirm") || text.includes("not a bot")) {
    return "Site bu sunucuyu robot sandı. Bu video için çerez (cookies) gerekiyor.";
  }
  if (text.includes("private") || text.includes("login required") || text.includes("members-only")) {
    return "Bu içerik gizli veya giriş gerektiriyor. Çerez ekleyip tekrar deneyin.";
  }
  if (text.includes("unsupported url")) {
    return "Bu site desteklenmiyor.";
  }
  if (text.includes("max-filesize") || text.includes("larger than")) {
    return "Video boyut sınırını aşıyor.";
  }
  if (text.includes("video unavailable") || text.includes("not available") || text.includes("404")) {
    return "Video bulunamadı veya kaldırılmış.";
  }
  if (text.includes("drm") || text.includes("protected")) {
    return "Bu video kopya korumalı (DRM), indirilemez.";
  }
  return "Video indirilemedi.";
}

const TR_MAP: Record<string, string> = {
  ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", İ: "I",
  ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U",
};

/**
 * HTTP başlıkları latin-1'dir; Türkçe başlık ham haliyle filename= içine konursa
 * başlık bozulur. ASCII sürüm filename= için, orijinali RFC 5987 filename*= için.
 */
export function safeFilename(title: string, ext: string): { ascii: string; utf8: string } {
  const clean = (title || "video")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[/\\:*?"<>|]/g, "-")
    .trim()
    .slice(0, 80);

  const ascii =
    clean
      .replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => TR_MAP[c] ?? c)
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/\s+/g, " ")
      .trim() || "video";

  return { ascii: `${ascii}.${ext}`, utf8: `${clean || "video"}.${ext}` };
}

export async function ytdlpVersion(): Promise<string | null> {
  const res = await runYtDlp(["--version"], 15_000);
  return res.ok ? res.stdout.trim() || null : null;
}

/**
 * Ham `yt-dlp -J` çıktısı — format seçimi için gerekli. stderr de döner, çünkü
 * sunucu başarısızlıkta kullanıcıya translateError() ile Türkçe sebep göstermeli.
 */
export async function probe(
  url: string,
  opts: DownloadOptions = {}
): Promise<{ raw: unknown | null; stderr: string }> {
  const res = await runYtDlp([...buildCommonArgs(opts), "-J", url], opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (!res.ok) {
    return { raw: null, stderr: res.stderr };
  }
  try {
    const raw = JSON.parse(res.stdout);
    return { raw: raw && typeof raw === "object" ? raw : null, stderr: res.stderr };
  } catch {
    return { raw: null, stderr: res.stderr };
  }
}

export function toVideoInfo(raw: unknown, fallbackUrl: string): VideoInfo {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    title: typeof r.title === "string" ? r.title : "video",
    extractor: typeof r.extractor_key === "string" ? r.extractor_key : "unknown",
    duration: typeof r.duration === "number" ? r.duration : null,
    filesize:
      typeof r.filesize === "number"
        ? r.filesize
        : typeof r.filesize_approx === "number"
          ? r.filesize_approx
          : null,
    ext: typeof r.ext === "string" ? r.ext : "mp4",
    webpage_url: typeof r.webpage_url === "string" ? r.webpage_url : fallbackUrl,
  };
}

export async function resolveVideo(url: string, opts: DownloadOptions = {}): Promise<VideoInfo | null> {
  const { raw } = await probe(url, opts);
  return raw ? toVideoInfo(raw, url) : null;
}

/**
 * Mod A. yt-dlp'yi stdout'a yazacak şekilde başlatır; çağıran taraf
 * `child.stdout` üzerinden okur ve gerektiğinde `child.kill()` çağırır.
 */
export function streamVideo(
  url: string,
  formatId: string,
  opts: DownloadOptions = {}
): child_process.ChildProcess {
  const args = [...buildCommonArgs(opts), "-f", formatId, "-o", "-", url];
  return child_process.spawn(YTDLP_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
}

export function cleanupDownload(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Geçici klasör silinemezse işletim sistemi temizler.
  }
}

/**
 * Mod B. Videoyu boş bir geçici klasöre indirir. Klasör baştan boş olduğu için
 * içindeki tek dosya bizim çıktımızdır — yt-dlp'nin ürettiği adı tahmin etmeye
 * gerek kalmaz. Çağıran taraf işi bitince cleanupDownload(dir) çağırmalı.
 */
export async function downloadVideo(
  url: string,
  opts: DownloadOptions = {}
): Promise<DownloadResult | null> {
  let dir: string;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "video-indir-"));
  } catch {
    return null;
  }

  const args = [
    ...buildCommonArgs(opts),
    ...buildFormatArgs(opts.maxFilesize ?? DEFAULT_MAX_FILESIZE, opts.maxHeight ?? DEFAULT_MAX_HEIGHT),
    "-o",
    path.join(dir, "%(title).80s.%(ext)s"),
    url,
  ];

  const res = await runYtDlp(args, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (!res.ok) {
    cleanupDownload(dir);
    return null;
  }

  try {
    const files = fs.readdirSync(dir).filter((f) => !f.endsWith(".part"));
    if (files.length === 0) {
      cleanupDownload(dir);
      return null;
    }
    const filename = files[0];
    const filePath = path.join(dir, filename);
    return { dir, filePath, filename, size: fs.statSync(filePath).size };
  } catch {
    cleanupDownload(dir);
    return null;
  }
}

/** `claude indir` komutunun gövdesi. Repo kalıbı: index.ts ince kalır, mantık burada. */
export async function indirVideo(input: string, opts: IndirOptions): Promise<void> {
  const outDir = opts.out ?? "indirilenler";
  const checked = await checkUrl(input);

  if (!checked.ok || !checked.url) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ ok: false, error: checked.error }, null, 2) + "\n");
    } else {
      console.log(checked.error);
    }
    return;
  }

  const result = await downloadVideo(checked.url);
  if (!result) {
    const message = "Video indirilemedi. Bağlantıyı ve yt-dlp kurulumunu kontrol edin.";
    if (opts.json) {
      process.stdout.write(JSON.stringify({ ok: false, error: message }, null, 2) + "\n");
    } else {
      console.log(message);
    }
    return;
  }

  try {
    fs.mkdirSync(outDir, { recursive: true });
    const target = path.join(outDir, result.filename);
    fs.copyFileSync(result.filePath, target);

    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ ok: true, path: target, filename: result.filename, size: result.size }, null, 2) + "\n"
      );
    } else {
      console.log(`İndirildi: ${target} (${Math.round(result.size / 1024 / 1024)} MB)`);
    }
  } catch (err) {
    const message = (err as Error).message;
    if (opts.json) {
      process.stdout.write(JSON.stringify({ ok: false, error: message }, null, 2) + "\n");
    } else {
      console.log(`Dosya kaydedilemedi: ${message}`);
    }
  } finally {
    cleanupDownload(result.dir);
  }
}
