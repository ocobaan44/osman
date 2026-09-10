// `claude viral ...` komut ağacı.

import { Command } from "commander";
import { buildReport } from "./analytics";
import {
  CONFIG_FILE,
  loadPosts,
  loadProfile,
  POSTS_FILE,
  savePosts,
  checkPillars,
  saveProfile,
  upsertPost,
} from "./config";
import { suggestHookIdeas } from "./hooks";
import { buildPlan, ideaToDraft } from "./plan";
import { renderCompliance, renderPlan, renderReport, renderScore } from "./render";
import { checkCompliance, isPublishable } from "./compliance";
import { scoreDraft } from "./score";
import { Driver, Format, PostMetrics, ProductionMode, Profile } from "./types";

const FORMATS: Format[] = ["reel", "carousel", "single", "story"];
const DRIVERS: Driver[] = ["share", "save", "comment", "watch"];

function parseFormat(value: string): Format {
  if (!FORMATS.includes(value as Format)) {
    throw new Error(`Geçersiz biçim: ${value}. Seçenekler: ${FORMATS.join(", ")}`);
  }
  return value as Format;
}

function parseDriver(value: string): Driver {
  if (!DRIVERS.includes(value as Driver)) {
    throw new Error(`Geçersiz hedef: ${value}. Seçenekler: ${DRIVERS.join(", ")}`);
  }
  return value as Driver;
}

function parseCount(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} sayı olmalı: ${value}`);
  }
  return parsed;
}

function print(text: string): void {
  process.stdout.write(text);
}

function parseProductionMode(value: string): ProductionMode {
  if (value === "onCamera" || value === "faceless") return value;
  throw new Error(`Geçersiz çekim biçimi: ${value}. onCamera veya faceless kullan.`);
}

function printJson(value: unknown): void {
  print(`${JSON.stringify(value, null, 2)}\n`);
}

export function registerInstagramCommands(program: Command): void {
  const viral = program
    .command("viral")
    .description("Instagram büyüme sistemi: plan, skor, ölçüm");

  viral
    .command("init")
    .description(`Profil dosyası oluşturur (${CONFIG_FILE})`)
    .option("--handle <handle>", "Instagram kullanıcı adı")
    .option("--niche <niche>", "Hesabın konusu")
    .option("--followers <n>", "Takipçi sayısı")
    .option("--posts-per-week <n>", "Haftalık gönderi sayısı")
    .option("--pillars <list>", "Virgülle ayrılmış ana temalar")
    .option("--production-mode <mode>", "Çekim biçimi: onCamera|faceless")
    .action((opts) => {
      const existing = loadProfile(process.cwd());
      const profile: Profile = {
        ...existing,
        handle: (opts.handle as string) ?? existing.handle,
        niche: (opts.niche as string) ?? existing.niche,
        followers: opts.followers
          ? parseCount(opts.followers as string, "Takipçi sayısı")
          : existing.followers,
        postsPerWeek: opts.postsPerWeek
          ? parseCount(opts.postsPerWeek as string, "Haftalık gönderi sayısı")
          : existing.postsPerWeek,
        pillars: opts.pillars
          ? (opts.pillars as string).split(",").map((p) => p.trim()).filter(Boolean)
          : existing.pillars,
        productionMode: opts.productionMode
          ? parseProductionMode(opts.productionMode as string)
          : existing.productionMode,
      };

      const file = saveProfile(process.cwd(), profile);
      print(`Profil yazıldı: ${file}\n`);
      printJson(profile);

      const warnings = checkPillars(profile.pillars);
      if (warnings.length > 0) {
        print("\nUYARI\n");
        for (const warning of warnings) print(`  - ${warning}\n`);
      }
    });

  viral
    .command("plan")
    .description("Haftalık içerik takvimi üretir")
    .option("--weeks <n>", "Kaç haftalık plan", "4")
    .option("--start <date>", "Başlangıç tarihi (YYYY-AA-GG)")
    .option("--json", "JSON olarak yaz", false)
    .option("--score", "Her fikri ayrıca puanla", false)
    .action((opts) => {
      const profile = loadProfile(process.cwd());
      const weeks = parseCount(opts.weeks as string, "Hafta sayısı");
      const startDate = opts.start ? new Date(opts.start as string) : undefined;

      if (startDate && Number.isNaN(startDate.getTime())) {
        throw new Error(`Geçersiz tarih: ${opts.start}`);
      }

      const ideas = buildPlan(profile, { weeks, startDate });

      if (opts.json) {
        printJson(
          opts.score
            ? ideas.map((idea) => ({ ...idea, score: scoreDraft(ideaToDraft(idea)) }))
            : ideas
        );
        return;
      }

      print(renderPlan(ideas));

      if (opts.score) {
        for (const idea of ideas) {
          const result = scoreDraft(ideaToDraft(idea));
          print(`${idea.id} ${idea.hook} → ${result.total}/${result.max} (${result.grade})\n`);
        }
      }
    });

  viral
    .command("score")
    .description("Bir gönderi taslağını yayınlamadan önce puanlar")
    .requiredOption("--hook <text>", "İlk 3 saniyede söylenecek cümle")
    .option("--format <format>", `Biçim: ${FORMATS.join("|")}`, "reel")
    .option("--driver <driver>", `Hedef davranış: ${DRIVERS.join("|")}`, "share")
    .option("--duration <sec>", "Reel süresi (saniye)")
    .option("--caption <text>", "Açıklama metni")
    .option("--cta <text>", "Eylem çağrısı")
    .option("--beats <list>", "Sahne/kare akışı, | ile ayrılmış")
    .option("--loop", "Kapanış açılışa bağlanıyor", false)
    .option("--no-captions", "Ekranda yanık altyazı yok")
    .option("--json", "JSON olarak yaz", false)
    .action((opts) => {
      const draft = {
        hook: opts.hook as string,
        format: parseFormat(opts.format as string),
        driver: parseDriver(opts.driver as string),
        durationSec: opts.duration
          ? parseCount(opts.duration as string, "Süre")
          : undefined,
        caption: opts.caption as string | undefined,
        cta: opts.cta as string | undefined,
        beats: opts.beats ? (opts.beats as string).split("|").map((b) => b.trim()) : undefined,
        loops: opts.loop as boolean,
        captionsBurned: opts.captions as boolean,
      };
      const result = scoreDraft(draft);
      const issues = checkCompliance(draft);

      if (opts.json) {
        printJson({ ...result, compliance: { publishable: isPublishable(issues), issues } });
        return;
      }

      print(renderScore(result));
      print(renderCompliance(issues));
    });

  viral
    .command("hooks")
    .description("Bir tema için hook önerileri üretir")
    .option("--pillar <text>", "Tema. Verilmezse profildeki ilk tema kullanılır")
    .option("--count <n>", "Kaç öneri", "8")
    .option("--driver <driver>", `Sadece bu hedefe yönelik hook'lar: ${DRIVERS.join("|")}`)
    .option("--json", "JSON olarak yaz", false)
    .action((opts) => {
      const profile = loadProfile(process.cwd());
      const pillar =
        (opts.pillar as string | undefined) ?? profile.pillars[0] ?? profile.niche;
      const count = parseCount(opts.count as string, "Öneri sayısı");
      const driver = opts.driver ? parseDriver(opts.driver as string) : undefined;
      const ideas = suggestHookIdeas(pillar, count, driver);
      const scored = ideas.map((idea) => ({
        ...idea,
        strength: scoreDraft({ hook: idea.hook, format: "reel", driver: idea.driver })
          .dimensions[0].score,
      }));

      if (opts.json) {
        printJson(scored);
        return;
      }

      print(`\n"${pillar}" için hook önerileri\n`);
      print("Köşeli parantezler senin dolduracağın boşluklar.\n\n");
      scored.forEach((idea, i) => {
        print(`${String(i + 1).padStart(2)}. ${idea.hook}\n`);
        print(`    hook gücü ${idea.strength}/25 · hedef: ${idea.driver} · ${idea.why}\n`);
      });
      print("\n");
    });

  viral
    .command("track")
    .description(`Yayınlanmış bir gönderinin sonuçlarını kaydeder (${POSTS_FILE})`)
    .requiredOption("--id <id>", "Gönderi kimliği")
    .requiredOption("--reach <n>", "Erişilen hesap sayısı")
    .option("--date <date>", "Yayın tarihi (YYYY-AA-GG)")
    .option("--format <format>", `Biçim: ${FORMATS.join("|")}`, "reel")
    .option("--pillar <text>", "Tema")
    .option("--hook <text>", "Kullanılan hook")
    .option("--shares <n>", "Paylaşım sayısı", "0")
    .option("--saves <n>", "Kaydetme sayısı", "0")
    .option("--likes <n>", "Beğeni sayısı", "0")
    .option("--comments <n>", "Yorum sayısı", "0")
    .option("--follows <n>", "Bu gönderiden gelen takipçi", "0")
    .option("--avg-watch <sec>", "Ortalama izlenme süresi (saniye)")
    .option("--duration <sec>", "Gönderi süresi (saniye)")
    .action((opts) => {
      const post: PostMetrics = {
        id: opts.id as string,
        date: (opts.date as string) ?? new Date().toISOString().slice(0, 10),
        format: parseFormat(opts.format as string),
        pillar: opts.pillar as string | undefined,
        hook: opts.hook as string | undefined,
        reach: parseCount(opts.reach as string, "Erişim"),
        shares: parseCount(opts.shares as string, "Paylaşım"),
        saves: parseCount(opts.saves as string, "Kaydetme"),
        likes: parseCount(opts.likes as string, "Beğeni"),
        comments: parseCount(opts.comments as string, "Yorum"),
        follows: parseCount(opts.follows as string, "Takip"),
        avgWatchSec: opts.avgWatch
          ? parseCount(opts.avgWatch as string, "Ortalama izlenme")
          : undefined,
        durationSec: opts.duration ? parseCount(opts.duration as string, "Süre") : undefined,
      };

      const posts = upsertPost(loadPosts(process.cwd()), post);
      const file = savePosts(process.cwd(), posts);
      print(`Kaydedildi: ${file} (${posts.length} gönderi)\n`);
    });

  viral
    .command("report")
    .description("Kaydedilmiş gönderileri analiz eder ve ne yapılacağını söyler")
    .option("--json", "JSON olarak yaz", false)
    .action((opts) => {
      const profile = loadProfile(process.cwd());
      const posts = loadPosts(process.cwd());

      if (posts.length === 0) {
        print(
          `Henüz kayıtlı gönderi yok. Önce 'claude viral track' ile sonuç gir.\n` +
            `Veri dosyası: ${POSTS_FILE}\n`
        );
        return;
      }

      const report = buildReport(profile, posts);

      if (opts.json) {
        printJson(report);
        return;
      }

      print(renderReport(report));
    });
}
