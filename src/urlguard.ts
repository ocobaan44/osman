import * as dns from "dns";

/**
 * Sunucu internete açık ve kullanıcı girdisiyle yt-dlp çalıştırıyor. yt-dlp'nin
 * generic extractor'ı kendisine verilen her adresi açar — bu da filtresiz bırakılırsa
 * bulut metadata servisi (169.254.169.254) veya iç ağ adresleri için bir SSRF aracı
 * haline gelir. Buradaki kontroller o yüzden opsiyonel değil.
 */

const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
  "igshid",
  "igsh",
  "rdt",
  "share_id",
  "trk",
  "trackingId",
  "originalSubdomain",
  "_nc_cat",
];

// Bu hostlarda sorgu dizesinin tamamı takip verisidir; videonun kimliği path'te durur.
// LinkedIn ayrıca soru işaretinden sonrası bırakılırsa çözümlemede takılabiliyor.
const DROP_QUERY_HOSTS = ["linkedin.com", "instagram.com", "tiktok.com"];

const BLOCKED_HOSTNAMES = [
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
];

export function extractUrl(input: string): string | null {
  if (!input || typeof input !== "string") {
    return null;
  }
  // Paylaş menüsü çoğu zaman "Şu videoya bak https://... harika" gibi metin gönderir.
  const match = input.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0] : null;
}

function hostMatches(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

export function normalizeUrl(input: string): string | null {
  const raw = extractUrl(input) ?? (input ?? "").trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");

  if (DROP_QUERY_HOSTS.some((h) => hostMatches(hostname, h))) {
    parsed.search = "";
  } else {
    for (const param of TRACKING_PARAMS) {
      parsed.searchParams.delete(param);
    }
  }
  parsed.hash = "";

  return parsed.toString();
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const octet = parseInt(part, 10);
    if (octet > 255) {
      return null;
    }
    value = value * 256 + octet;
  }
  return value;
}

export function isPrivateIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === null) {
    return false;
  }
  const inRange = (cidr: string, bits: number): boolean => {
    const base = ipv4ToInt(cidr);
    if (base === null) {
      return false;
    }
    const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
    return (value & mask) >>> 0 === (base & mask) >>> 0;
  };

  return (
    inRange("0.0.0.0", 8) ||
    inRange("10.0.0.0", 8) ||
    inRange("100.64.0.0", 10) ||
    inRange("127.0.0.0", 8) ||
    inRange("169.254.0.0", 16) || // bulut metadata
    inRange("172.16.0.0", 12) ||
    inRange("192.0.0.0", 24) ||
    inRange("192.168.0.0", 16) ||
    inRange("198.18.0.0", 15) ||
    inRange("224.0.0.0", 4) ||
    inRange("240.0.0.0", 4)
  );
}

export function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "::1" || lower === "::") {
    return true;
  }
  // IPv4-mapped (::ffff:10.0.0.1) IPv4 kurallarına tabidir.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    return isPrivateIpv4(mapped[1]);
  }
  return /^f[cd][0-9a-f]{2}:/.test(lower) || /^fe[89ab][0-9a-f]:/.test(lower);
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTNAMES.some((h) => hostMatches(host, h))) {
    return true;
  }
  if (host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return isPrivateIpv4(host);
  }
  if (host.includes(":")) {
    return isPrivateIpv6(host);
  }
  return false;
}

/**
 * Hostname'i DNS'te çözüp dönen TÜM adreslerin public olduğunu doğrular. Sadece
 * literal kontrolü yetmez: saldırgan kendi alan adını 127.0.0.1'e yönlendirebilir.
 */
export async function resolvesToPublicHost(hostname: string): Promise<boolean> {
  try {
    const addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true });
    if (addresses.length === 0) {
      return false;
    }
    return addresses.every((a) =>
      a.family === 6 ? !isPrivateIpv6(a.address) : !isPrivateIpv4(a.address)
    );
  } catch {
    return false;
  }
}

export interface SafeUrlResult {
  ok: boolean;
  url?: string;
  error?: string;
}

export async function checkUrl(input: string): Promise<SafeUrlResult> {
  const normalized = normalizeUrl(input);
  if (!normalized) {
    return { ok: false, error: "Geçerli bir video bağlantısı bulunamadı." };
  }

  const hostname = new URL(normalized).hostname;
  if (isBlockedHostname(hostname)) {
    return { ok: false, error: "Bu adres indirilemez." };
  }
  if (!(await resolvesToPublicHost(hostname))) {
    return { ok: false, error: "Bu adres indirilemez." };
  }

  return { ok: true, url: normalized };
}
