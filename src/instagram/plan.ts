// İçerik takvimi üretici.
//
// Viralliği tek gönderi değil, tekrar belirler: aynı kalıbı farklı temayla
// düzenli yayınlamak algoritmaya hesabın ne hakkında olduğunu öğretir ve her
// gönderi bir öncekinin öğrendiği kitleye dağıtılır. Bu yüzden takvim rastgele
// değil, arketip rotasyonu üzerine kurulur ve deterministiktir: aynı profil
// aynı planı üretir, böylece plan üzerinde konuşulabilir.

import { ContentIdea, Driver, Format, Profile } from "./types";

interface Archetype {
  name: string;
  format: Format;
  driver: Driver;
  /** {tema} yer tutucusu profil temalarıyla doldurulur. */
  hook: string;
  beats: string[];
  /** Yüz ve ses kullanmayan üretim için sahne akışı. */
  facelessBeats: string[];
  caption: string;
  cta: string;
}

const ARCHETYPES: Archetype[] = [
  {
    name: "Uyarı",
    format: "reel",
    driver: "share",
    hook: "Bunu bilmeden {tema} tarafına girme",
    beats: [
      "0-3 sn: uyarıyı kameraya bakarak söyle, arkada konu görünsün",
      "3-10 sn: en pahalı hatayı tek cümlede anlat",
      "10-18 sn: gerçek bir örnekle kanıtla",
      "18-22 sn: kapanışı açılış cümlesine bağla (loop)",
    ],
    facelessBeats: [
      "0-3 sn: uyarı cümlesi tam ekran yazı, arkada sabit araç görüntüsü",
      "3-10 sn: hatayı tek cümlelik yazı olarak ver, altında görsel kanıt",
      "10-18 sn: rakamı ya da belgeyi göster, üstüne kısa açıklama yaz",
      "18-22 sn: açılış cümlesini aynen tekrar yaz (loop)",
    ],
    caption: "{tema} konusunda en sık gördüğüm hata bu.",
    cta: "Bu hatayı yapmak üzere olan birine gönder.",
  },
  {
    name: "Perde arkası",
    format: "reel",
    driver: "watch",
    hook: "{tema} tarafında sana kimsenin göstermediği 3 şey",
    beats: [
      "0-3 sn: beklenmedik bir görüntüyle aç, açıklama yapma",
      "3-12 sn: sürecin kimsenin görmediği adımını göster",
      "12-20 sn: rakam ya da sonuçla bitir",
    ],
    facelessBeats: [
      "0-3 sn: yakın plan detay görüntüsü, yazı yok, merak bırak",
      "3-12 sn: adımları sırayla göster, her kesmede tek satır yazı",
      "12-20 sn: sonucu rakamla tam ekran yaz",
    ],
    caption: "Dışarıdan göründüğü gibi değil.",
    cta: "Merak ettiğin adımı yorumda yaz.",
  },
  {
    name: "Karşılaştırma",
    format: "reel",
    driver: "watch",
    hook: "Ucuz {tema} ucuz değil: sana 3 kat pahalıya patlıyor",
    beats: [
      "0-3 sn: ucuz ve pahalı seçeneği yan yana göster",
      "3-14 sn: 3 somut farkı sırayla ver",
      "14-20 sn: hangisini kimin alması gerektiğini söyle",
    ],
    facelessBeats: [
      "0-3 sn: ekranı ikiye böl, iki seçeneği yan yana yaz",
      "3-14 sn: üç farkı sırayla ekle, her biri tek satır",
      "14-20 sn: kimin hangisini alması gerektiğini tablo olarak göster",
    ],
    caption: "Ucuza aldığını sandığın yerde asıl maliyet başlıyor.",
    cta: "Sen hangisini seçerdin, yorumda yaz.",
  },
  {
    name: "Liste rehberi",
    format: "carousel",
    driver: "save",
    hook: "{tema} hakkında kimsenin söylemediği 5 şey",
    beats: [
      "Kare 1: kapak, sayı ve vaat büyük puntoyla",
      "Kare 2-6: her karede tek madde, tek cümle",
      "Kare 7: maddelerin özeti tek ekranda",
      "Kare 8: kaydetmeye davet",
    ],
    facelessBeats: [
      "Kare 1: kapak, sayı ve vaat büyük puntoyla",
      "Kare 2-6: her karede tek madde, tek cümle, tek görsel",
      "Kare 7: maddelerin özeti tek ekranda",
      "Kare 8: kaydetmeye davet",
    ],
    caption: "Bu listeyi bir yere not etmene gerek yok, kaydetmen yeterli.",
    cta: "Kaydet, lazım olacak.",
  },
  {
    name: "Mit yıkma",
    format: "reel",
    driver: "share",
    hook: "Herkes {tema} konusunda bunu yanlış biliyor",
    beats: [
      "0-3 sn: yaygın inanışı söyle",
      "3-8 sn: 'aslında tam tersi' de ve dur",
      "8-18 sn: neden yanlış olduğunu kanıtla",
      "18-22 sn: doğrusunu tek cümlede ver",
    ],
    facelessBeats: [
      "0-3 sn: yaygın inanışı tam ekran yazı olarak ver",
      "3-8 sn: üstüne kırmızı çarpı koy, bir saniye bekle",
      "8-18 sn: doğru bilgiyi kanıt görüntüsüyle yaz",
      "18-22 sn: doğru cümleyi tek satırda tekrarla",
    ],
    caption: "Bunu hâlâ böyle bilen çok kişi var.",
    cta: "Hâlâ böyle bilen birine gönder.",
  },
  {
    name: "Soru-cevap",
    format: "reel",
    driver: "comment",
    hook: "Sana en çok sorulan 3 {tema} sorusu, üçüncüsü şaşırtıyor",
    beats: [
      "0-3 sn: üçüncü soruyu ekranda göster, cevabını sakla",
      "3-15 sn: net cevap, kaçamak yok",
      "15-20 sn: bir sonraki soruyu izleyiciye sor",
    ],
    facelessBeats: [
      "0-3 sn: üçüncü soruyu tam ekran yaz, cevabı gösterme",
      "3-15 sn: her soruyu ve net cevabını sırayla yazıyla ver",
      "15-20 sn: sıradaki soruyu ekrana yaz ve izleyiciye sor",
    ],
    caption: "Sorunu yaz, sıradaki videoda cevaplayayım.",
    cta: "Sorunu yorumda yaz.",
  },
  {
    name: "Süreç adımları",
    format: "carousel",
    driver: "save",
    hook: "{tema} yapmanın doğru sırası (çoğu kişi ters yapıyor)",
    beats: [
      "Kare 1: kapak, 'yanlış sıra' iddiası",
      "Kare 2: çoğu kişinin yaptığı sıra",
      "Kare 3-7: doğru sıra, her karede tek adım",
      "Kare 8: adımların tamamı tek ekranda",
    ],
    facelessBeats: [
      "Kare 1: kapak, 'yanlış sıra' iddiası",
      "Kare 2: çoğu kişinin yaptığı sıra, üstünde çarpı",
      "Kare 3-7: doğru sıra, her karede tek adım",
      "Kare 8: adımların tamamı tek ekranda",
    ],
    caption: "Sıra değişince sonuç da değişiyor.",
    cta: "Kaydet, uygularken açarsın.",
  },
  {
    name: "Hata itirafı",
    format: "reel",
    driver: "share",
    hook: "{tema} tarafında yaptığım 3 pahalı hata",
    beats: [
      "0-3 sn: 'bana pahalıya patladı' ile aç",
      "3-16 sn: üç hatayı hızlı kesmelerle sırala",
      "16-22 sn: bugün ne yaptığını söyle, açılışa bağla",
    ],
    facelessBeats: [
      "0-3 sn: 'bana pahalıya patladı' cümlesi tam ekran",
      "3-16 sn: üç hatayı numaralı yazıyla sırala, her birine bir görsel",
      "16-22 sn: bugün ne yaptığını yaz, açılış cümlesine bağla",
    ],
    caption: "Bu hataların üçünü de ben yaptım.",
    cta: "Aynı hatayı yapmasın diye birine gönder.",
  },
  {
    name: "İkili seçim",
    format: "reel",
    driver: "comment",
    hook: "{tema} için 2 seçenek var, sen hangisini alırdın?",
    beats: [
      "0-3 sn: iki seçeneği ekranda yan yana göster",
      "3-12 sn: kendi cevabını ve tek gerekçeni ver",
      "12-18 sn: izleyiciyi tartışmaya davet et",
    ],
    facelessBeats: [
      "0-3 sn: iki seçeneği yan yana koy, üstlerine A ve B yaz",
      "3-12 sn: kendi cevabını ve tek gerekçeni yazıyla ver",
      "12-18 sn: 'sen hangisi' sorusunu tam ekran göster",
    ],
    caption: "Bence cevap net ama katılmayan çok olacak.",
    cta: "Cevabını yorumda yaz.",
  },
  {
    name: "Öncesi sonrası",
    format: "reel",
    driver: "watch",
    hook: "{tema} tarafında 30 günde değişen 3 şey",
    beats: [
      "0-3 sn: sonucu önce göster, süreci sakla",
      "3-15 sn: geriye sararak nasıl olduğunu anlat",
      "15-20 sn: aynı sonucu isteyen için tek tavsiye",
    ],
    facelessBeats: [
      "0-3 sn: sonucu göster, üstüne tek kelime yaz",
      "3-15 sn: geri sararak adımları yazıyla ver",
      "15-20 sn: tek cümlelik tavsiyeyi tam ekran yaz",
    ],
    caption: "Sonucu baştan gösterdim, asıl kısım nasıl olduğu.",
    cta: "Aynısını denemek isteyen birine gönder.",
  },
];

/** Haftada n gönderiyi 7 güne olabildiğince eşit dağıtır. */
function weekdayOffsets(postsPerWeek: number): number[] {
  const count = Math.min(Math.max(postsPerWeek, 1), 7);
  return Array.from({ length: count }, (_, i) => Math.floor((i * 7) / count));
}

function addDays(start: Date, days: number): Date {
  const next = new Date(start.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface PlanOptions {
  weeks: number;
  /** Planın ilk günü. Verilmezse bugünden başlar. */
  startDate?: Date;
}

/**
 * Arketipleri ve profil temalarını farklı adımlarla döndürerek takvim üretir.
 * İki rotasyon farklı hızda ilerlediği için aynı arketip aynı temaya ancak
 * uzun aralıklarla denk gelir; içerik tekrarı böyle önlenir.
 */
export function buildPlan(profile: Profile, options: PlanOptions): ContentIdea[] {
  const start = options.startDate ?? new Date();
  const faceless = profile.productionMode === "faceless";
  const offsets = weekdayOffsets(profile.postsPerWeek);
  const pillars = profile.pillars.length > 0 ? profile.pillars : [profile.niche];
  const ideas: ContentIdea[] = [];

  let slot = 0;
  for (let week = 0; week < options.weeks; week += 1) {
    for (const offset of offsets) {
      const archetype = ARCHETYPES[slot % ARCHETYPES.length];
      const pillar = pillars[slot % pillars.length];
      const dayIndex = week * 7 + offset;
      const date = addDays(start, dayIndex);

      ideas.push({
        id: `p${String(slot + 1).padStart(3, "0")}`,
        day: dayIndex + 1,
        date: isoDate(date),
        format: archetype.format,
        driver: archetype.driver,
        pillar,
        hook: archetype.hook.replace(/\{tema\}/g, pillar),
        beats: faceless ? archetype.facelessBeats : archetype.beats,
        caption: `${archetype.caption.replace(/\{tema\}/g, pillar)}\n\n${archetype.cta}`,
        cta: archetype.cta,
      });

      slot += 1;
    }
  }

  return ideas;
}

/** Plandaki bir fikri, skorlanabilir taslağa çevirir. */
export function ideaToDraft(idea: ContentIdea) {
  return {
    hook: idea.hook,
    format: idea.format,
    driver: idea.driver,
    durationSec: idea.format === "reel" ? 22 : undefined,
    caption: idea.caption,
    cta: idea.cta,
    beats: idea.beats,
    loops: idea.beats.some((b) => b.includes("loop") || b.includes("açılışa bağla")),
    captionsBurned: true,
  };
}

export { ARCHETYPES };
