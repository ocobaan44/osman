// Hook kütüphanesi ve hook metni analizi.
//
// Instagram'da bir reel'in kaderi ilk 3 saniyede belli olur: izleyici o anda
// kaydırırsa gönderi test havuzundan çıkamaz. Buradaki şablonlar ve sözlükler,
// bir hook'un o 3 saniyeyi tutup tutamayacağını ölçmek için kullanılır.

import { Driver } from "./types";

export interface HookTemplate {
  /** {konu}, {sayı}, {yer} gibi yer tutucular içerir. */
  pattern: string;
  /** Hangi davranışı tetiklemek için tasarlandı. */
  driver: Driver;
  /** Neden işe yaradığının tek cümlelik açıklaması. */
  why: string;
}

export const HOOK_TEMPLATES: HookTemplate[] = [
  {
    pattern: "{konu} hakkında kimsenin söylemediği {sayı} şey",
    driver: "save",
    why: "Sayı beklenti kurar, 'kimsenin söylemediği' merak boşluğu açar.",
  },
  {
    pattern: "{konu} alırken yaptığım {sayı} pahalı hata",
    driver: "share",
    why: "İtiraf tonu güven kurar, hata listesi başkasını korumak için paylaşılır.",
  },
  {
    pattern: "Bunu bilmeden {konu} alma",
    driver: "share",
    why: "Doğrudan emir kipi ve kayıp korkusu, izleyiciyi durdurur.",
  },
  {
    pattern: "{yer} çalışan biri olarak söylüyorum: {iddia}",
    driver: "watch",
    why: "İçeriden bilgi vaadi, izleyiciyi kanıtı görmek için tutar.",
  },
  {
    pattern: "{fiyat} TL ile {konu} arasındaki fark bu",
    driver: "watch",
    why: "Somut rakam ve görsel karşılaştırma vaadi, sonuna kadar izletir.",
  },
  {
    pattern: "Herkes {yanlış} sanıyor. Gerçek şu:",
    driver: "share",
    why: "Karşıt görüş, yorum ve tartışma üretir; tartışma erişim demektir.",
  },
  {
    pattern: "{konu} için 30 saniyede karar verme yöntemi",
    driver: "save",
    why: "Kısa süre + yöntem vaadi, referans değeri taşır ve kaydedilir.",
  },
  {
    pattern: "Müşterim bana bunu sordu, cevabı çoğu kişiyi şaşırtıyor",
    driver: "watch",
    why: "Açık döngü kurar; cevap gelene kadar izleyici çıkamaz.",
  },
  {
    pattern: "{konu} yapmanın doğru sırası (çoğu kişi ters yapıyor)",
    driver: "save",
    why: "Sıra/adım vaadi ve hafif suçlama, kaydetmeyi tetikler.",
  },
  {
    pattern: "Bunu {sayı} yıl önce bilseydim {sonuç}",
    driver: "share",
    why: "Pişmanlık çerçevesi duygusal; aynı durumdaki arkadaşa gönderilir.",
  },
  {
    pattern: "{konu} ile ilgili en çok sorulan soru: {soru}",
    driver: "comment",
    why: "Soruyu görünür kılar, izleyiciyi kendi sorusunu yazmaya davet eder.",
  },
  {
    pattern: "3 saniyede anlarsın: {a} mı {b} mi?",
    driver: "comment",
    why: "İkili seçim, düşük eforlu yorum üretir; yorum dağıtımı besler.",
  },
];

/** Merak boşluğu açan ifadeler. */
const CURIOSITY = [
  "kimsenin",
  "kimse",
  "gerçek",
  "sır",
  "aslında",
  "meğer",
  "bilmediğ",
  "söylemediğ",
  "fark etmediğ",
  "şaşırt",
  "beklemediğ",
];

/** Karşıt görüş / kalıp kırıcı ifadeler. */
const CONTRARIAN = [
  "yanlış",
  "sanıyor",
  "aksine",
  "tam tersi",
  "ters",
  "değil",
  "hata",
  "efsane",
  "abartı",
];

/** Kayıp korkusu ve aciliyet. */
const STAKES = [
  "alma",
  "yapma",
  "sakın",
  "dikkat",
  "kaybet",
  "pahalı",
  "zarar",
  "pişman",
  "geç kalma",
  "önce",
];

/** İzleyiciye doğrudan hitap. */
const SECOND_PERSON = ["sen", "senin", "sana", "seni", "kendi", "bunu", "şunu"];

export interface HookAnalysis {
  wordCount: number;
  hasNumber: boolean;
  hasCuriosityGap: boolean;
  isContrarian: boolean;
  hasStakes: boolean;
  addressesViewer: boolean;
  isQuestion: boolean;
  /** Marka, yer, rakam gibi somut sözcükler içeriyor mu. */
  isSpecific: boolean;
}

const NUMBER_RE = /\d/;
const PROPER_NOUN_RE = /(?:^|\s)[A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,}/;

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

/**
 * Bir hook metnini yapısal olarak çözümler. Türkçe küçük harfe çevirirken
 * I/İ ayrımını korumak için özel dönüşüm kullanılır.
 */
export function analyzeHook(hook: string): HookAnalysis {
  const lower = hook.replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase();
  const words = hook.trim().split(/\s+/).filter(Boolean);

  return {
    wordCount: words.length,
    hasNumber: NUMBER_RE.test(hook),
    hasCuriosityGap: containsAny(lower, CURIOSITY),
    isContrarian: containsAny(lower, CONTRARIAN),
    hasStakes: containsAny(lower, STAKES),
    addressesViewer: containsAny(lower, SECOND_PERSON),
    isQuestion: hook.trim().endsWith("?"),
    isSpecific: NUMBER_RE.test(hook) || PROPER_NOUN_RE.test(hook),
  };
}

/** Sayı yer tutucusu için dönüşümlü kullanılan değerler. */
const COUNTS = [3, 5, 7];

/**
 * Kullanıcının kendi bilgisiyle doldurması gereken yer tutucular. Bunlar
 * uydurulmaz: köşeli parantez içinde boşluk olarak bırakılır ki hook'u
 * kopyalayan kişi neyi yazacağını görsün.
 */
const BLANKS: Record<string, string> = {
  yer: "[çalıştığın yer]",
  iddia: "[iddian]",
  yanlış: "[yaygın yanlış]",
  soru: "[soru]",
  sonuç: "[ne değişirdi]",
  fiyat: "[fiyat]",
  a: "[A]",
  b: "[B]",
};

/** Şablondaki tüm yer tutucuları doldurur; hiçbiri ham kalmaz. */
export function fillTemplate(pattern: string, pillar: string, index: number): string {
  // \w Türkçe harfleri kapsamadığı için ({sayı}, {yanlış}) sınıf yerine
  // kapanış parantezine kadar her şey alınır.
  return pattern.replace(/\{([^}]+)\}/gu, (match, name: string) => {
    if (name === "konu") return pillar;
    if (name === "sayı") return String(COUNTS[index % COUNTS.length]);
    return BLANKS[name] ?? match;
  });
}

export interface HookIdea {
  hook: string;
  driver: Driver;
  why: string;
}

/** Bir temaya göre hook şablonlarını doldurur ve neden işe yaradığını taşır. */
export function suggestHookIdeas(
  pillar: string,
  count: number,
  driver?: Driver
): HookIdea[] {
  const pool = driver
    ? HOOK_TEMPLATES.filter((t) => t.driver === driver)
    : HOOK_TEMPLATES;
  const source = pool.length > 0 ? pool : HOOK_TEMPLATES;

  return Array.from({ length: count }, (_, i) => {
    const template = source[i % source.length];
    return {
      hook: fillTemplate(template.pattern, pillar, i),
      driver: template.driver,
      why: template.why,
    };
  });
}

/** Sadece hook metinlerini döner. */
export function suggestHooks(pillar: string, count: number, driver?: Driver): string[] {
  return suggestHookIdeas(pillar, count, driver).map((idea) => idea.hook);
}
