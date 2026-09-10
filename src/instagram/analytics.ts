// Yayınlanmış gönderilerin gerçek performansını okur ve neye yatırım
// yapılacağını söyler.
//
// Mutlak sayılar (beğeni, izlenme) hesap büyüdükçe yanıltır. Bu yüzden her
// şey erişime oranlanır: shareRate ve saveRate, bir gönderinin kendi
// takipçi çemberinin dışına çıkıp çıkamadığını gösteren asıl sinyaldir.

import { AccountReport, Format, PostAnalysis, PostMetrics, Profile } from "./types";

function safeDivide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Bir gönderiyi sınıflandırır.
 *
 * - viral-motor: hem çemberin dışına çıkmış hem paylaşılmış
 * - dönüştürüyor: az kişiye ulaşmış ama ulaştığını takipçiye çevirmiş
 * - ölü: ne erişim ne dönüşüm
 */
function classify(
  reachRate: number,
  shareRate: number,
  followRate: number
): PostAnalysis["klass"] {
  if (reachRate >= 1 && shareRate >= 0.01) return "viral-motor";
  if (followRate >= 0.01) return "dönüştürüyor";
  if (reachRate >= 0.4) return "sağlam";
  return "ölü";
}

export function analyzePost(post: PostMetrics, followers: number): PostAnalysis {
  const reachRate = safeDivide(post.reach, followers);
  const shareRate = safeDivide(post.shares, post.reach);
  const saveRate = safeDivide(post.saves, post.reach);
  const followRate = safeDivide(post.follows, post.reach);
  const engagementRate = safeDivide(
    post.likes + post.comments + post.saves + post.shares,
    post.reach
  );
  const retention =
    post.avgWatchSec !== undefined && post.durationSec !== undefined && post.durationSec > 0
      ? post.avgWatchSec / post.durationSec
      : null;

  return {
    post,
    reachRate,
    shareRate,
    saveRate,
    followRate,
    engagementRate,
    retention,
    klass: classify(reachRate, shareRate, followRate),
  };
}

function groupMedianShareRate<K extends string>(
  analyses: PostAnalysis[],
  keyOf: (a: PostAnalysis) => K | undefined
): Array<{ key: K; posts: number; medianShareRate: number }> {
  const buckets = new Map<K, number[]>();

  for (const analysis of analyses) {
    const key = keyOf(analysis);
    if (key === undefined) continue;
    const existing = buckets.get(key);
    if (existing) {
      existing.push(analysis.shareRate);
    } else {
      buckets.set(key, [analysis.shareRate]);
    }
  }

  return [...buckets.entries()]
    .map(([key, rates]) => ({ key, posts: rates.length, medianShareRate: median(rates) }))
    .sort((a, b) => b.medianShareRate - a.medianShareRate);
}

/** Rapordan çıkan sayıları somut aksiyona çevirir. */
function deriveActions(
  analyses: PostAnalysis[],
  topPillars: AccountReport["topPillars"],
  topFormats: AccountReport["topFormats"],
  medianShareRate: number
): string[] {
  const actions: string[] = [];

  const best = topPillars[0];
  if (best && best.posts >= 2) {
    actions.push(
      `"${best.pillar}" teması paylaşımda önde (medyan ${(best.medianShareRate * 100).toFixed(2)}%). ` +
        `Önümüzdeki 2 haftanın gönderilerinin yarısını bu temadan üret.`
    );
  }

  const worst = topPillars[topPillars.length - 1];
  if (worst && topPillars.length >= 3 && worst.posts >= 2) {
    actions.push(
      `"${worst.pillar}" teması sürekli dipte. Bırak ya da açısını tamamen değiştir.`
    );
  }

  const bestFormat = topFormats[0];
  if (bestFormat && bestFormat.posts >= 2) {
    actions.push(
      `${bestFormat.format} biçimi en çok paylaşılan biçim. Haftalık planın ağırlığını buraya kaydır.`
    );
  }

  const viral = analyses.filter((a) => a.klass === "viral-motor");
  if (viral.length > 0) {
    const sample = viral[0].post.hook ?? viral[0].post.id;
    actions.push(
      `${viral.length} gönderi viral-motor sınıfında. En iyisinin ("${sample}") formatını ` +
        `farklı temayla birebir tekrar et; çalışan kalıp tekrarlanır.`
    );
  } else {
    actions.push(
      "Hiçbir gönderi viral-motor sınıfına girmemiş. Sorun dağıtım değil, paylaşılma sebebi: " +
        "hook'ları karşıt görüş ya da uyarı çerçevesine çevir."
    );
  }

  const weakRetention = analyses.filter((a) => a.retention !== null && a.retention < 0.5);
  if (weakRetention.length > analyses.length / 3) {
    actions.push(
      `${weakRetention.length} reel yarısından önce bırakılıyor. Süreleri 25 saniyenin altına indir ` +
        "ve kapanışı açılışa bağla."
    );
  }

  if (medianShareRate < 0.005) {
    actions.push(
      "Medyan paylaşım oranı %0.5'in altında. Her gönderiye tek bir 'bunu şuna gönder' cümlesi ekle."
    );
  }

  return actions;
}

export function buildReport(profile: Profile, posts: PostMetrics[]): AccountReport {
  const analyses = posts.map((post) => analyzePost(post, profile.followers));

  const topPillars = groupMedianShareRate(analyses, (a) => a.post.pillar).map(
    ({ key, posts: n, medianShareRate: rate }) => ({
      pillar: key,
      posts: n,
      medianShareRate: rate,
    })
  );

  const topFormats = groupMedianShareRate<Format>(analyses, (a) => a.post.format).map(
    ({ key, posts: n, medianShareRate: rate }) => ({
      format: key,
      posts: n,
      medianShareRate: rate,
    })
  );

  const medianShareRate = median(analyses.map((a) => a.shareRate));

  return {
    profile,
    postCount: posts.length,
    median: {
      reachRate: median(analyses.map((a) => a.reachRate)),
      shareRate: medianShareRate,
      saveRate: median(analyses.map((a) => a.saveRate)),
      followRate: median(analyses.map((a) => a.followRate)),
    },
    analyses: [...analyses].sort((a, b) => b.shareRate - a.shareRate),
    topPillars,
    topFormats,
    actions: deriveActions(analyses, topPillars, topFormats, medianShareRate),
  };
}
