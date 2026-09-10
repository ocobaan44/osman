// Terminal çıktısı biçimlendirme.

import { weakestDimensions } from "./score";
import { AccountReport, ContentIdea, ScoreResult } from "./types";

function bar(score: number, max: number, width = 20): string {
  const filled = max > 0 ? Math.round((score / max) * width) : 0;
  return `${"█".repeat(filled)}${"░".repeat(Math.max(width - filled, 0))}`;
}

function pct(value: number, digits = 2): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function renderScore(result: ScoreResult): string {
  const lines: string[] = [];
  lines.push(`\nSKOR: ${result.total}/${result.max}  (${result.grade})`);
  lines.push(result.verdict);
  lines.push("");

  for (const d of result.dimensions) {
    lines.push(
      `${d.label.padEnd(34)} ${bar(d.score, d.max)} ${String(d.score).padStart(2)}/${d.max}  ${d.reason}`
    );
  }

  // En çok puan kaybedilen boyut başa gelsin: önce onu düzeltmek en çok kazandırır.
  const fixes = weakestDimensions(result, result.dimensions.length);
  if (fixes.length > 0) {
    lines.push("\nÖNCE ŞUNU DÜZELT:");
    for (const d of fixes) {
      lines.push(`  - [${d.label}] ${d.fix}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function renderPlan(ideas: ContentIdea[]): string {
  const lines: string[] = [];
  lines.push(`\n${ideas.length} gönderilik plan\n`);

  for (const idea of ideas) {
    lines.push(
      `${idea.date}  ${idea.id}  ${idea.format.padEnd(8)} ${idea.driver.padEnd(7)} ${idea.pillar}`
    );
    lines.push(`   HOOK: ${idea.hook}`);
    for (const beat of idea.beats) {
      lines.push(`   · ${beat}`);
    }
    lines.push(`   CTA: ${idea.cta}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

export function renderReport(report: AccountReport): string {
  const lines: string[] = [];
  lines.push(`\n@${report.profile.handle} — ${report.postCount} gönderi analiz edildi\n`);

  lines.push("MEDYAN ORANLAR");
  lines.push(`  Erişim / takipçi   ${pct(report.median.reachRate)}`);
  lines.push(`  Paylaşım / erişim  ${pct(report.median.shareRate)}`);
  lines.push(`  Kaydetme / erişim  ${pct(report.median.saveRate)}`);
  lines.push(`  Takip / erişim     ${pct(report.median.followRate)}`);

  lines.push("\nGÖNDERİLER (paylaşım oranına göre)");
  for (const a of report.analyses) {
    const retention = a.retention === null ? "  -  " : pct(a.retention, 0).padStart(5);
    lines.push(
      `  ${a.post.date}  ${a.post.format.padEnd(8)} ` +
        `erişim ${pct(a.reachRate, 0).padStart(6)}  ` +
        `paylaşım ${pct(a.shareRate).padStart(6)}  ` +
        `kaydetme ${pct(a.saveRate).padStart(6)}  ` +
        `izlenme ${retention}  ${a.klass}`
    );
  }

  if (report.topPillars.length > 0) {
    lines.push("\nTEMALAR (paylaşım oranı medyanı)");
    for (const p of report.topPillars) {
      lines.push(`  ${p.pillar.padEnd(28)} ${pct(p.medianShareRate).padStart(6)}  (${p.posts} gönderi)`);
    }
  }

  if (report.topFormats.length > 0) {
    lines.push("\nBİÇİMLER (paylaşım oranı medyanı)");
    for (const f of report.topFormats) {
      lines.push(`  ${f.format.padEnd(28)} ${pct(f.medianShareRate).padStart(6)}  (${f.posts} gönderi)`);
    }
  }

  lines.push("\nBU HAFTA NE YAP");
  for (const action of report.actions) {
    lines.push(`  - ${action}`);
  }

  return `${lines.join("\n")}\n`;
}
