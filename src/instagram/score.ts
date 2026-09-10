// Gönderi taslağını yayınlamadan önce puanlayan motor.
//
// Puanlama, Instagram'ın dağıtım sinyallerinin gerçek ağırlığını taklit eder:
// önce ilk 3 saniyeyi tutan hook, sonra DM ile paylaşılma (erişimin en güçlü
// yordayıcısı), sonra kaydetme ve izlenme tutunması. Beğeni bilinçli olarak
// hiç puanlanmaz; dağıtıma katkısı en zayıf sinyaldir.

import { analyzeHook } from "./hooks";
import { Draft, Format, ScoreDimension, ScoreResult, Driver } from "./types";

/** Düşük eforlu, tek adımlı istek fiilleri. İyi CTA bunlardan birini içerir. */
const CTA_VERBS = ["kaydet", "gönder", "yorum", "yaz", "paylaş", "etiketle", "takip"];

/** Biçim ile hedeflenen davranışın uyumu. Yüksek olan, o biçimin doğal gücü. */
const FORMAT_DRIVER_FIT: Record<Format, Record<Driver, number>> = {
  reel: { watch: 5, share: 5, comment: 4, save: 3 },
  carousel: { save: 5, share: 4, comment: 3, watch: 2 },
  single: { comment: 4, share: 3, save: 3, watch: 1 },
  story: { comment: 5, share: 3, save: 2, watch: 2 },
};

function lower(text: string): string {
  return text.replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase();
}

function scoreHook(draft: Draft): ScoreDimension {
  const a = analyzeHook(draft.hook);
  const parts: string[] = [];
  const fixes: string[] = [];
  let score = 0;

  if (a.wordCount >= 4 && a.wordCount <= 10) {
    score += 6;
    parts.push("uzunluk ideal");
  } else if (a.wordCount <= 3) {
    score += 3;
    fixes.push("Hook çok kısa; ne vaat ettiğini 4-10 kelimeyle netleştir.");
  } else if (a.wordCount <= 14) {
    score += 4;
    fixes.push("Hook biraz uzun; 10 kelimenin altına indir.");
  } else {
    score += 1;
    fixes.push("Hook 14 kelimeyi aşıyor; izleyici bitmeden kaydırır, yarıya böl.");
  }

  if (a.hasCuriosityGap || a.isContrarian) {
    score += 6;
    parts.push(a.isContrarian ? "kalıp kırıyor" : "merak boşluğu açıyor");
  } else {
    score += 2;
    fixes.push("Merak boşluğu yok; bir beklentiyi ters yüz et ya da bir bilgiyi sakla.");
  }

  if (a.hasStakes || a.isQuestion) {
    score += 4;
    parts.push("izleyici için bir bedel/soru var");
  } else {
    score += 1;
    fixes.push("Kayıp riski ekle: bunu bilmezse ne kaybeder?");
  }

  if (a.addressesViewer) {
    score += 4;
    parts.push("doğrudan izleyiciye hitap ediyor");
  } else {
    score += 1;
    fixes.push("İzleyiciye 'sen' diliyle hitap et; genel anlatım durdurmaz.");
  }

  if (a.isSpecific) {
    score += 5;
    parts.push("somut");
  } else {
    score += 1;
    fixes.push("Somutlaştır: rakam, marka ya da yer adı koy.");
  }

  return {
    key: "hook",
    label: "Hook gücü (ilk 3 saniye)",
    score,
    max: 25,
    reason: parts.length > 0 ? parts.join(", ") : "hook zayıf sinyal taşıyor",
    fix: fixes[0],
  };
}

function scoreShareTrigger(draft: Draft): ScoreDimension {
  const a = analyzeHook(draft.hook);
  const text = lower([draft.caption ?? "", draft.cta ?? ""].join(" "));
  const fixes: string[] = [];
  let score = draft.driver === "share" ? 8 : 4;

  if (draft.driver !== "share") {
    fixes.push("Gönderinin ana hedefi paylaşım değil; erişim tavanı buradan düşer.");
  }

  if (a.isContrarian || a.hasStakes) {
    score += 6;
  } else {
    fixes.push("Paylaşılabilirlik düşük: birini uyaran ya da haklı çıkaran bir açı ekle.");
  }

  if (draft.format === "reel") {
    score += 3;
  } else {
    fixes.push("DM paylaşımı en çok reel'de olur; bu fikri reel'e çevirmeyi düşün.");
  }

  if (/gönder|etiketle|paylaş/.test(text)) {
    score += 3;
  } else {
    fixes.push("Metinde paylaşmaya davet yok: 'bunu şu arkadaşına gönder' gibi bir cümle ekle.");
  }

  return {
    key: "share",
    label: "Paylaşım tetikleyicisi (DM/story)",
    score,
    max: 20,
    reason:
      score >= 15
        ? "birinin arkadaşına göndereceği bir sebep var"
        : "gönderilmek için yeterli sebep yok",
    fix: fixes[0],
  };
}

function scoreSaveTrigger(draft: Draft): ScoreDimension {
  const a = analyzeHook(draft.hook);
  const beats = draft.beats?.length ?? 0;
  const fixes: string[] = [];
  let score = draft.driver === "save" ? 6 : 3;

  if (draft.driver !== "save") {
    fixes.push("Kaydetme hedeflenmemiş; sonradan lazım olacak bir bilgi katmanı ekle.");
  }

  if (draft.format === "carousel") {
    score += 3;
  } else if (draft.format === "reel") {
    score += 2;
  } else {
    fixes.push("Kaydedilen içerik çoğunlukla carousel ya da reel oluyor.");
  }

  if (beats >= 3) {
    score += 3;
  } else {
    fixes.push("Yapı yok: en az 3 adımlık liste ya da sıra kur, referans değeri doğsun.");
  }

  if (a.hasNumber) {
    score += 3;
  } else {
    fixes.push("Hook'a sayı koy ('3 adım', '5 hata'); sayılı içerik daha çok kaydedilir.");
  }

  return {
    key: "save",
    label: "Kaydetme değeri",
    score,
    max: 15,
    reason: score >= 11 ? "sonradan dönülecek bilgi taşıyor" : "tek seferlik izlenip unutulur",
    fix: fixes[0],
  };
}

function scoreRetention(draft: Draft): ScoreDimension {
  const beats = draft.beats?.length ?? 0;

  if (draft.format !== "reel") {
    const fixes: string[] = [];
    let score: number;
    if (beats >= 6) {
      score = 12;
    } else if (beats >= 4) {
      score = 9;
      fixes.push("Kare sayısını 6-8'e çıkar; her kare bir sonrakini merak ettirsin.");
    } else if (beats >= 2) {
      score = 6;
      fixes.push("Akış çok kısa; içeriği adımlara böl.");
    } else {
      score = 3;
      fixes.push("Hiç akış tanımlanmamış; kare kare ne anlatacağını yaz.");
    }
    return {
      key: "retention",
      label: "Akış ve yapı",
      score,
      max: 15,
      reason: `${beats} adımlık akış`,
      fix: fixes[0],
    };
  }

  const duration = draft.durationSec ?? 0;
  const fixes: string[] = [];
  let score = 0;

  if (duration >= 7 && duration <= 25) {
    score += 6;
  } else if (duration > 25 && duration <= 45) {
    score += 4;
    fixes.push("Süreyi 25 saniyenin altına indir; tam izlenme oranı orada zirve yapar.");
  } else if (duration > 45 && duration <= 90) {
    score += 2;
    fixes.push("45 saniyeyi aşan reel'de tutunma çöker; ya kısalt ya ikiye böl.");
  } else if (duration > 90) {
    score += 1;
    fixes.push("Bu uzunluk reel için fazla; 90+ saniyeyi ancak çok güçlü bir hikâye taşır.");
  } else {
    score += 3;
    fixes.push("7 saniyenin altı, mesajı kurmadan bitiyor.");
  }

  if (draft.loops) {
    score += 4;
  } else {
    fixes.push("Kapanışı açılışa bağla (loop); tekrar izlenme tutunmayı ikiye katlar.");
  }

  if (beats >= 3) {
    score += 3;
  } else {
    fixes.push("En az 3 sahne planla; sabit tek çekim izleyiciyi kaybettirir.");
  }

  if (draft.captionsBurned) {
    score += 2;
  } else {
    fixes.push("Ekrana yanık altyazı ekle; izleyicilerin çoğu sesi kapalı izliyor.");
  }

  return {
    key: "retention",
    label: "İzlenme tutunması",
    score,
    max: 15,
    reason: `${duration} sn, ${beats} sahne${draft.loops ? ", loop var" : ""}`,
    fix: fixes[0],
  };
}

function scoreClarity(draft: Draft): ScoreDimension {
  const a = analyzeHook(draft.hook);
  const fit = FORMAT_DRIVER_FIT[draft.format][draft.driver];
  const fixes: string[] = [];
  let score = fit;

  if (fit < 4) {
    fixes.push(
      `${draft.format} biçimi "${draft.driver}" hedefi için zayıf; biçimi ya da hedefi değiştir.`
    );
  }

  if (a.isSpecific) {
    score += 5;
  } else if (a.addressesViewer) {
    score += 3;
    fixes.push("Konu net değil; kime ve neye dair olduğunu ilk cümlede söyle.");
  } else {
    score += 1;
    fixes.push("Gönderi kime hitap ettiğini söylemiyor; hedef kitleyi hook'ta adlandır.");
  }

  return {
    key: "clarity",
    label: "Netlik ve biçim uyumu",
    score,
    max: 10,
    reason: `${draft.format} + ${draft.driver} uyumu ${fit}/5`,
    fix: fixes[0],
  };
}

function scoreCaption(draft: Draft): ScoreDimension {
  const caption = draft.caption?.trim() ?? "";

  if (caption.length === 0) {
    return {
      key: "caption",
      label: "Açıklama metni",
      score: 0,
      max: 8,
      reason: "açıklama yok",
      fix: "Açıklama yaz; ilk satır hook'u tekrarlamalı, kesilmeden okunmalı.",
    };
  }

  const firstLine = caption.split("\n")[0].trim();
  const firstLineWords = firstLine.split(/\s+/).filter(Boolean).length;
  const a = analyzeHook(firstLine);
  const fixes: string[] = [];
  let score = 2;

  if (firstLineWords <= 12) {
    score += 3;
  } else {
    fixes.push("İlk satır uzun; Instagram '...daha fazla' ile kesiyor, 12 kelimeye indir.");
  }

  if (a.hasCuriosityGap || a.isQuestion || a.isContrarian) {
    score += 3;
  } else {
    fixes.push("İlk satır merak uyandırmıyor; soruyla ya da iddiayla başlat.");
  }

  return {
    key: "caption",
    label: "Açıklama metni",
    score,
    max: 8,
    reason: `ilk satır ${firstLineWords} kelime`,
    fix: fixes[0],
  };
}

function scoreCta(draft: Draft): ScoreDimension {
  const cta = draft.cta?.trim() ?? "";

  if (cta.length === 0) {
    return {
      key: "cta",
      label: "Eylem çağrısı",
      score: 0,
      max: 7,
      reason: "eylem çağrısı yok",
      fix: "Tek bir net istek ekle: kaydet, gönder ya da yorum yaz.",
    };
  }

  const text = lower(cta);
  const asks = CTA_VERBS.filter((verb) => text.includes(verb));
  const fixes: string[] = [];
  let score = 2;

  if (asks.length >= 1) {
    score += 3;
  } else {
    fixes.push("Çağrı belirsiz; 'kaydet', 'gönder' gibi tek adımlı bir fiil kullan.");
  }

  if (asks.length <= 1) {
    score += 2;
  } else {
    fixes.push(`${asks.length} ayrı istek var; birini seç, çoklu istek hepsini zayıflatır.`);
  }

  return {
    key: "cta",
    label: "Eylem çağrısı",
    score,
    max: 7,
    reason: asks.length === 1 ? "tek ve net istek" : `${asks.length} istek tespit edildi`,
    fix: fixes[0],
  };
}

function grade(total: number): ScoreResult["grade"] {
  if (total >= 80) return "A";
  if (total >= 65) return "B";
  if (total >= 50) return "C";
  return "D";
}

const VERDICTS: Record<ScoreResult["grade"], string> = {
  A: "Yayınla. Bu taslak test havuzunu geçecek sinyallerin çoğunu taşıyor.",
  B: "Yayınlanabilir ama en düşük iki boyutu düzeltirsen erişim belirgin artar.",
  C: "Henüz yayınlama. Hook ve paylaşım tetikleyicisini yeniden yaz.",
  D: "Bu fikri bu haliyle yayınlamak zaman kaybı. Baştan kur.",
};

/** Taslağı puanlar ve her boyut için somut düzeltme döner. */
export function scoreDraft(draft: Draft): ScoreResult {
  const dimensions = [
    scoreHook(draft),
    scoreShareTrigger(draft),
    scoreSaveTrigger(draft),
    scoreRetention(draft),
    scoreClarity(draft),
    scoreCaption(draft),
    scoreCta(draft),
  ];

  const total = dimensions.reduce((sum, d) => sum + d.score, 0);
  const max = dimensions.reduce((sum, d) => sum + d.max, 0);
  const g = grade(total);

  return { total, max, grade: g, verdict: VERDICTS[g], dimensions };
}

/** En çok puan kaybedilen boyutları, kayıp büyüklüğüne göre sıralar. */
export function weakestDimensions(result: ScoreResult, count = 3): ScoreDimension[] {
  return [...result.dimensions]
    .filter((d) => d.fix !== undefined)
    .sort((a, b) => b.max - b.score - (a.max - a.score))
    .slice(0, count);
}
