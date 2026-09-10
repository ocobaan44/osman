import { analyzeHook, fillTemplate, suggestHookIdeas, suggestHooks } from "../instagram/hooks";
import { scoreDraft, weakestDimensions } from "../instagram/score";
import { buildPlan, ideaToDraft } from "../instagram/plan";
import { analyzePost, buildReport, median } from "../instagram/analytics";
import { checkCompliance, isPublishable, normalize } from "../instagram/compliance";
import { checkPillars, upsertPost } from "../instagram/config";
import { Draft, PostMetrics, Profile } from "../instagram/types";

const profile: Profile = {
  handle: "test",
  niche: "otomotiv",
  followers: 2000,
  postsPerWeek: 5,
  pillars: ["araç seçimi", "bakım maliyeti", "perde arkası"],
  productionMode: "onCamera",
};

describe("analyzeHook", () => {
  it("güçlü hook'un tüm sinyallerini yakalar", () => {
    const a = analyzeHook("Bunu bilmeden 2. el BMW alma");
    expect(a.hasNumber).toBe(true);
    expect(a.hasStakes).toBe(true);
    expect(a.addressesViewer).toBe(true);
    expect(a.isSpecific).toBe(true);
  });

  it("düz anlatımda merak boşluğu bulmaz", () => {
    const a = analyzeHook("bugün servise gittik ve işler yolunda");
    expect(a.hasCuriosityGap).toBe(false);
    expect(a.isContrarian).toBe(false);
    expect(a.isSpecific).toBe(false);
  });

  it("Türkçe büyük I harfini doğru küçültür", () => {
    expect(analyzeHook("Herkes bunu YANLIŞ biliyor").isContrarian).toBe(true);
  });

  it("kelime sayısını ve soru biçimini okur", () => {
    const a = analyzeHook("Hangisini alırsın?");
    expect(a.wordCount).toBe(2);
    expect(a.isQuestion).toBe(true);
  });
});

describe("suggestHooks", () => {
  it("temayı şablona yerleştirir ve istenen sayıda üretir", () => {
    const hooks = suggestHooks("araç seçimi", 5);
    expect(hooks).toHaveLength(5);
    expect(hooks.some((h) => h.includes("araç seçimi"))).toBe(true);
  });

  it("hedefe göre filtreler", () => {
    const ideas = suggestHookIdeas("bakım", 3, "save");
    expect(ideas).toHaveLength(3);
    expect(ideas.every((i) => i.driver === "save")).toBe(true);
  });

  it("hiçbir yer tutucuyu ham bırakmaz", () => {
    for (const hook of suggestHooks("bakım maliyeti", 20)) {
      expect(hook).not.toMatch(/[{}]/);
    }
  });

  it("sayı yer tutucusunu rakamla, geri kalanını boşlukla doldurur", () => {
    expect(fillTemplate("{konu} için {sayı} ipucu", "bakım", 0)).toBe("bakım için 3 ipucu");
    expect(fillTemplate("{yer} çalışanı olarak", "bakım", 0)).toBe(
      "[çalıştığın yer] çalışanı olarak"
    );
  });

  it("her öneri neden işe yaradığını taşır", () => {
    expect(suggestHookIdeas("bakım", 4).every((i) => i.why.length > 0)).toBe(true);
  });
});

describe("scoreDraft", () => {
  const strong: Draft = {
    hook: "Bunu bilmeden 2. el BMW alma",
    format: "reel",
    driver: "share",
    durationSec: 20,
    caption: "Bu hatayı yapan çok kişi var.\n\nDetaylar aşağıda.",
    cta: "Araba bakan bir arkadaşına gönder.",
    beats: ["0-3 sn uyarı", "3-10 sn hata", "10-18 sn kanıt", "18-20 sn loop"],
    loops: true,
    captionsBurned: true,
  };

  it("güçlü taslağa A verir", () => {
    const result = scoreDraft(strong);
    expect(result.grade).toBe("A");
    expect(result.total).toBeGreaterThanOrEqual(80);
  });

  it("zayıf taslağa D verir", () => {
    const result = scoreDraft({ hook: "güzel bir gün", format: "single", driver: "watch" });
    expect(result.grade).toBe("D");
    expect(result.total).toBeLessThan(50);
  });

  it("toplam puan boyutların toplamına eşittir", () => {
    const result = scoreDraft(strong);
    const sum = result.dimensions.reduce((acc, d) => acc + d.score, 0);
    expect(result.total).toBe(sum);
    expect(result.max).toBe(100);
  });

  it("hiçbir boyut kendi tavanını aşmaz", () => {
    for (const draft of [strong, { hook: "x", format: "story", driver: "save" } as Draft]) {
      for (const d of scoreDraft(draft).dimensions) {
        expect(d.score).toBeGreaterThanOrEqual(0);
        expect(d.score).toBeLessThanOrEqual(d.max);
      }
    }
  });

  it("uzun reel süresini tutunma boyutundan düşürür", () => {
    const short = scoreDraft({ ...strong, durationSec: 18 });
    const long = scoreDraft({ ...strong, durationSec: 120 });
    const dimension = (r: typeof short) => r.dimensions.find((d) => d.key === "retention")!.score;
    expect(dimension(long)).toBeLessThan(dimension(short));
  });

  it("eksik açıklama ve CTA için sıfır verip düzeltme önerir", () => {
    const result = scoreDraft({ hook: strong.hook, format: "reel", driver: "share" });
    const caption = result.dimensions.find((d) => d.key === "caption")!;
    const cta = result.dimensions.find((d) => d.key === "cta")!;
    expect(caption.score).toBe(0);
    expect(cta.score).toBe(0);
    expect(cta.fix).toBeDefined();
  });

  it("çoklu istek içeren CTA'yı cezalandırır", () => {
    const single = scoreDraft({ ...strong, cta: "Kaydet." });
    const multi = scoreDraft({ ...strong, cta: "Kaydet, yorum yaz ve arkadaşına gönder." });
    const ctaScore = (r: typeof single) => r.dimensions.find((d) => d.key === "cta")!.score;
    expect(ctaScore(multi)).toBeLessThan(ctaScore(single));
  });

  it("carousel'i tutunma yerine yapı üzerinden değerlendirir", () => {
    const result = scoreDraft({
      hook: "5 adımda doğru sıra",
      format: "carousel",
      driver: "save",
      beats: ["k1", "k2", "k3", "k4", "k5", "k6"],
    });
    const retention = result.dimensions.find((d) => d.key === "retention")!;
    expect(retention.label).toBe("Akış ve yapı");
    expect(retention.score).toBe(12);
  });
});

describe("weakestDimensions", () => {
  it("en çok puan kaybedilen boyutu başa koyar", () => {
    const result = scoreDraft({ hook: "bugün hava güzel", format: "single", driver: "watch" });
    const weakest = weakestDimensions(result, 2);
    expect(weakest.length).toBeLessThanOrEqual(2);
    const loss = (d: (typeof weakest)[number]) => d.max - d.score;
    expect(loss(weakest[0])).toBeGreaterThanOrEqual(loss(weakest[1]));
  });
});

describe("buildPlan", () => {
  it("hafta başına istenen sayıda gönderi üretir", () => {
    const ideas = buildPlan(profile, { weeks: 4, startDate: new Date("2026-01-05") });
    expect(ideas).toHaveLength(20);
  });

  it("aynı girdi için aynı planı üretir", () => {
    const options = { weeks: 2, startDate: new Date("2026-01-05") };
    expect(buildPlan(profile, options)).toEqual(buildPlan(profile, options));
  });

  it("tarihleri artan sırada ve hafta sınırları içinde verir", () => {
    const ideas = buildPlan(profile, { weeks: 2, startDate: new Date("2026-01-05") });
    const days = ideas.map((i) => i.day);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
    expect(Math.max(...days)).toBeLessThanOrEqual(14);
  });

  it("temaları ve biçimleri dönüşümlü kullanır", () => {
    const ideas = buildPlan(profile, { weeks: 3, startDate: new Date("2026-01-05") });
    expect(new Set(ideas.map((i) => i.pillar)).size).toBe(profile.pillars.length);
    expect(new Set(ideas.map((i) => i.format)).size).toBeGreaterThan(1);
  });

  it("tema listesi boşsa niş adına düşer", () => {
    const ideas = buildPlan({ ...profile, pillars: [] }, { weeks: 1 });
    expect(ideas.every((i) => i.pillar === profile.niche)).toBe(true);
  });

  it("ürettiği her fikir en az B alır", () => {
    for (const idea of buildPlan(profile, { weeks: 2, startDate: new Date("2026-01-05") })) {
      const result = scoreDraft(ideaToDraft(idea));
      expect(["A", "B"]).toContain(result.grade);
    }
  });
});

describe("median", () => {
  it("tek ve çift uzunlukta doğru sonuç verir", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe("analyzePost", () => {
  const base: PostMetrics = {
    id: "a",
    date: "2026-01-05",
    format: "reel",
    reach: 10000,
    shares: 200,
    saves: 300,
    likes: 500,
    comments: 40,
    follows: 120,
    avgWatchSec: 12,
    durationSec: 20,
  };

  it("oranları erişime göre hesaplar", () => {
    const a = analyzePost(base, 2000);
    expect(a.reachRate).toBe(5);
    expect(a.shareRate).toBe(0.02);
    expect(a.retention).toBe(0.6);
    expect(a.klass).toBe("viral-motor");
  });

  it("erişimi sıfır gönderide bölme hatası vermez", () => {
    const a = analyzePost({ ...base, reach: 0 }, 2000);
    expect(a.shareRate).toBe(0);
    expect(a.klass).toBe("ölü");
  });

  it("süre bilgisi yoksa izlenme oranını boş bırakır", () => {
    const a = analyzePost({ ...base, avgWatchSec: undefined, durationSec: undefined }, 2000);
    expect(a.retention).toBeNull();
  });

  it("az erişip çok takipçi getiren gönderiyi dönüştürüyor sayar", () => {
    const a = analyzePost({ ...base, reach: 400, shares: 1, follows: 20 }, 2000);
    expect(a.klass).toBe("dönüştürüyor");
  });
});

describe("buildReport", () => {
  const posts: PostMetrics[] = [
    { id: "1", date: "2026-01-05", format: "reel", pillar: "araç seçimi", hook: "Bunu bilmeden alma", reach: 20000, shares: 400, saves: 600, likes: 900, comments: 80, follows: 250, avgWatchSec: 14, durationSec: 20 },
    { id: "2", date: "2026-01-07", format: "carousel", pillar: "bakım maliyeti", reach: 1200, shares: 4, saves: 90, likes: 100, comments: 5, follows: 6 },
    { id: "3", date: "2026-01-09", format: "reel", pillar: "araç seçimi", reach: 15000, shares: 260, saves: 400, likes: 700, comments: 60, follows: 180, avgWatchSec: 11, durationSec: 22 },
    { id: "4", date: "2026-01-11", format: "carousel", pillar: "bakım maliyeti", reach: 900, shares: 2, saves: 40, likes: 60, comments: 2, follows: 3 },
  ];

  it("temaları paylaşım oranına göre sıralar", () => {
    const report = buildReport(profile, posts);
    expect(report.topPillars[0].pillar).toBe("araç seçimi");
    expect(report.topFormats[0].format).toBe("reel");
  });

  it("gönderileri paylaşım oranına göre sıralı döner", () => {
    const rates = buildReport(profile, posts).analyses.map((a) => a.shareRate);
    expect([...rates].sort((a, b) => b - a)).toEqual(rates);
  });

  it("kazanan temayı ve biçimi aksiyona çevirir", () => {
    const actions = buildReport(profile, posts).actions.join(" ");
    expect(actions).toContain("araç seçimi");
    expect(actions).toContain("reel");
  });

  it("hiç viral gönderi yoksa sebebi söyler", () => {
    const weak = posts.map((p) => ({ ...p, reach: 200, shares: 0, follows: 0 }));
    const actions = buildReport(profile, weak).actions.join(" ");
    expect(actions).toContain("viral-motor sınıfına girmemiş");
  });

  it("tek gönderiyle de çalışır", () => {
    const report = buildReport(profile, [posts[0]]);
    expect(report.postCount).toBe(1);
    expect(report.median.shareRate).toBeCloseTo(0.02);
  });
});

describe("upsertPost", () => {
  const post: PostMetrics = { id: "x", date: "2026-01-05", format: "reel", reach: 10, shares: 1, saves: 1, likes: 1, comments: 0, follows: 0 };

  it("yeni kaydı ekler", () => {
    expect(upsertPost([], post)).toHaveLength(1);
  });

  it("aynı id'li kaydın üzerine yazar", () => {
    const updated = upsertPost([post], { ...post, reach: 99 });
    expect(updated).toHaveLength(1);
    expect(updated[0].reach).toBe(99);
  });

  it("girdi dizisini değiştirmez", () => {
    const original = [post];
    upsertPost(original, { ...post, id: "y" });
    expect(original).toHaveLength(1);
  });
});

describe("checkPillars", () => {
  it("kısa tema adlarını uyarısız geçirir", () => {
    expect(checkPillars(["ikinci el BMW", "BMW servisi"])).toEqual([]);
  });

  it("hook cümlesini bozacak kadar uzun temayı uyarır", () => {
    const warnings = checkPillars(["servis ve satış sonrası perde arkası"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("servis ve satış sonrası perde arkası");
  });

  it("sadece sorunlu temaları bildirir", () => {
    const warnings = checkPillars(["ikinci el BMW", "çok uzun bir tema adı buraya sığmaz"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("çok uzun");
  });

  it("uzun tek kelimeyi de karakter sınırından yakalar", () => {
    expect(checkPillars(["a".repeat(30)])).toHaveLength(1);
  });
});

describe("bmwgunu profili", () => {
  const pillars = ["ikinci el BMW", "BMW bakım maliyeti", "BMW servisi", "BMW model seçimi"];

  it("gerçek profilin temaları hook şablonlarına sığar", () => {
    expect(checkPillars(pillars)).toEqual([]);
  });

  it("üretilen her fikir en az B alır", () => {
    const profile: Profile = {
      handle: "bmwgunu",
      niche: "BMW sahipliği ve ikinci el otomotiv",
      followers: 1000,
      postsPerWeek: 3,
      pillars,
      productionMode: "faceless",
    };
    for (const idea of buildPlan(profile, { weeks: 4, startDate: new Date("2026-09-10") })) {
      expect(["A", "B"]).toContain(scoreDraft(ideaToDraft(idea)).grade);
    }
  });
});

describe("checkCompliance", () => {
  const base: Draft = { hook: "x", format: "reel", driver: "share" };

  it("temiz taslakta uyarı üretmez", () => {
    const issues = checkCompliance({
      ...base,
      hook: "İkinci el alırken çoğu kişi bu belgeyi istemiyor",
      caption: "Ekspertiz raporunda bakılacak üç kalem var.",
      cta: "Kaydet, lazım olacak.",
    });
    expect(issues).toEqual([]);
    expect(isPublishable(issues)).toBe(true);
  });

  it("işveren adını kırmızı olarak yakalar", () => {
    const issues = checkCompliance({ ...base, caption: "Borusan tarafında böyle olmuyor" });
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("red");
    expect(isPublishable(issues)).toBe(false);
  });

  it("Türkçe büyük harf ve aksan farkını atlar", () => {
    expect(checkCompliance({ ...base, hook: "İNCİROĞLU" })[0]?.rule).toBe("İşveren adı");
  });

  it("plakayı yakalar", () => {
    const issues = checkCompliance({ ...base, caption: "Aracın plakası 38 ABC 123 idi" });
    expect(issues.some((i) => i.rule === "Plaka" && i.level === "red")).toBe(true);
  });

  it("iç veri jargonunu yakalar", () => {
    expect(checkCompliance({ ...base, caption: "CSI puanımız yükseldi" })[0].level).toBe("red");
  });

  it("kaynaksız fiyat iddiasını sarı olarak işaretler", () => {
    const issues = checkCompliance({ ...base, caption: "Bu araç 1.250.000 TL" });
    expect(issues.some((i) => i.rule === "Fiyat iddiası" && i.level === "yellow")).toBe(true);
    expect(isPublishable(issues)).toBe(true);
  });

  it("beats içindeki ihlali de görür", () => {
    const issues = checkCompliance({ ...base, beats: ["Kare 1: showroom'a bekliyoruz"] });
    expect(issues.some((i) => i.level === "red")).toBe(true);
  });

  it("normalize Türkçe karakterleri sadeleştirir", () => {
    expect(normalize("İŞÇİ ÖĞÜT")).toBe("isci ogut");
  });
});

describe("faceless plan", () => {
  it("yüzsüz modda kameraya konuşma yönergesi vermez", () => {
    const faceless: Profile = { ...profile, productionMode: "faceless" };
    const beats = buildPlan(faceless, { weeks: 3, startDate: new Date("2026-09-10") })
      .flatMap((i) => i.beats)
      .join(" ");
    expect(beats).not.toMatch(/kameraya|kamera önünde/i);
  });

  it("kamera modunda akış değişir", () => {
    const options = { weeks: 2, startDate: new Date("2026-09-10") };
    const onCam = buildPlan(profile, options).map((i) => i.beats.join("|"));
    const off = buildPlan({ ...profile, productionMode: "faceless" }, options).map((i) =>
      i.beats.join("|")
    );
    expect(onCam).not.toEqual(off);
  });
});
