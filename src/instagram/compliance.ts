// İçerik sınırı denetimi.
//
// docs/icerik-sinirlari.md dosyasındaki kırmızı çizgileri makine tarafında
// uygular. Denetim kelime ve kalıp tabanlıdır: niyeti anlamaz, yalnızca
// bilinen riskli ifadeleri yakalar. Temiz çıkan bir taslak "güvenli" demek
// değil, "bilinen tuzaklara düşmemiş" demektir. Son karar kullanıcıda.

import { Draft } from "./types";

export type ComplianceLevel = "red" | "yellow";

export interface ComplianceIssue {
  level: ComplianceLevel;
  /** Kuralın kısa adı. */
  rule: string;
  /** Metinde yakalanan ifade. */
  match: string;
  /** Neden sorun olduğu ve ne yapılması gerektiği. */
  advice: string;
}

/**
 * Türkçe eklemeli bir dildir: "Borusan'ın", "kampanyası", "bekliyoruz" hepsi
 * kökün ekli halidir. Bu yüzden kalıplarda kökün başına sınır koyup sonuna
 * koymuyoruz. Sonuç kaçırmak yerine fazla yakalamaya meyleder; kırmızı
 * çizgide güvenli olan yön budur.
 */
interface Rule {
  level: ComplianceLevel;
  rule: string;
  pattern: RegExp;
  advice: string;
}

/**
 * Türkçe büyük/küçük harf eşlemesi ve aksan farkları yüzünden metni
 * karşılaştırmadan önce sadeleştiriyoruz. Aksi halde "İNCİROĞLU" ile
 * "inciroglu" farklı görünür.
 */
export function normalize(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/[ıİ]/g, "i")
    .replace(/[şŞ]/g, "s")
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c");
}

const RULES: Rule[] = [
  {
    level: "red",
    rule: "İşveren adı",
    pattern: /\b(inciroglu|borusan|bnext)/,
    advice:
      "İşveren ve grup adı hiç geçmemeli; övgü de bağlantı kurar. Cümleyi işveren adı olmadan kur.",
  },
  {
    level: "red",
    rule: "İç veri",
    pattern: /\b(mbo|csi|karne|prim kriteri|butce hedefi|gerceklesme orani|kar marji|stok adedi)/,
    advice:
      "Bunlar işverenin ticari verisi. Sektör geneli bir örnekle değiştir ya da cümleyi tamamen çıkar.",
  },
  {
    level: "red",
    rule: "Plaka",
    pattern: /\b\d{2}\s?[a-z]{1,3}\s?\d{2,4}\b/,
    advice: "Plaka gerçek bir aracı ve sahibini işaret eder. Kareden ve metinden çıkar.",
  },
  {
    level: "red",
    rule: "Telefon",
    pattern: /(\+90|0)?\s?5\d{2}\s?\d{3}\s?\d{2}\s?\d{2}/,
    advice: "Kişisel iletişim bilgisi paylaşma; hesabı ticari kanala çevirir.",
  },
  {
    level: "red",
    rule: "Bayine yönlendirme",
    pattern: /\b(bana yaz|dm at.*arac|arac bulay|bize gel|showroom.?a bekl|magazamiz)/,
    advice:
      "Hesap kişisel; satış kanalı değil. Yönlendirme konumlanmayı çökertir ve iç politikayla çelişebilir.",
  },
  {
    level: "yellow",
    rule: "Kaynaksız arıza iddiası",
    pattern: /\b(ariza|toplatma|patliyor|hep bozulur|cop motor)/,
    advice:
      "Resmi toplatma kaydı ya da teknik servis bülteni göster. Kaynak yoksa iddiayı kur.",
  },
  {
    level: "yellow",
    rule: "Fiyat iddiası",
    pattern: /\b\d{1,3}([.,]\d{3})+\s?(tl|₺)\b|\b\d+\s?(bin|milyon)\s?(tl|₺)\b/,
    advice:
      "Rakamın kaynağını ve tarihini kareye yaz. Kaynaksız fiyat, ayı geçince yanlış bilgiye dönüşür.",
  },
  {
    level: "yellow",
    rule: "Kampanya ve indirim",
    pattern: /\b(kampanya|indirim|tahsis|teslim tarihi|liste disi)/,
    advice:
      "Yalnızca markanın kamuya ilan ettiği bilgiyi kullan; ilan edilmemiş ticari bilgi paylaşma.",
  },
  {
    level: "yellow",
    rule: "Rakip adı",
    pattern: /\b(mercedes|audi|volvo|jaguar|land rover|volkswagen|tesla)/,
    advice:
      "Karşılaştırma serbest ama ad vererek olumsuz iddia kurma. Ölçülebilir ve kamuya açık veriye bağlı kal.",
  },
];

/** Taslağın tüm metin alanlarını tek gövdede toplar. */
function draftText(draft: Draft): string {
  return [draft.hook, draft.caption ?? "", draft.cta ?? "", ...(draft.beats ?? [])].join("\n");
}

export function checkCompliance(draft: Draft): ComplianceIssue[] {
  const text = normalize(draftText(draft));

  return RULES.flatMap((rule) => {
    const found = text.match(rule.pattern);
    if (!found) return [];
    return [{ level: rule.level, rule: rule.rule, match: found[0].trim(), advice: rule.advice }];
  });
}

/** Kırmızı ihlal varsa gönderi yayınlanmamalı. */
export function isPublishable(issues: ComplianceIssue[]): boolean {
  return !issues.some((issue) => issue.level === "red");
}
