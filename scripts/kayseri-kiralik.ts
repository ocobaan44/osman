/**
 * Kayseri Talas/Melikgazi bölgesinde 25.000–40.000 TL arası
 * kiralık 2+1 eşyalı daire ilanlarını listeler.
 *
 * Kullanım:
 *   npx ts-node scripts/kayseri-kiralik.ts
 *   npx ts-node scripts/kayseri-kiralik.ts --min 20000 --max 35000
 *   npx ts-node scripts/kayseri-kiralik.ts --json   (JSON dosyasına kaydeder)
 */

import { chromium, Page } from "@playwright/test";
import * as fs from "fs";

const args = process.argv.slice(2);
const MIN_PRICE = parseInt(args[args.indexOf("--min") + 1] ?? "25000");
const MAX_PRICE = parseInt(args[args.indexOf("--max") + 1] ?? "40000");
const SAVE_JSON = args.includes("--json");

interface Listing {
  baslik: string;
  fiyat: string;
  konum: string;
  metrekare: string;
  oda: string;
  url: string;
  kaynak: string;
}

// ── Emlakjet ─────────────────────────────────────────────────────────────────

async function scrapeEmlakjet(page: Page): Promise<Listing[]> {
  const url =
    `https://www.emlakjet.com/kiralik-daire/kayseri-talas/` +
    `?oda_sayisi=2%2B1&esyali=1&fiyat_min=${MIN_PRICE}&fiyat_max=${MAX_PRICE}`;

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);

  return page.evaluate(() => {
    const results: Listing[] = [];
    const cards = document.querySelectorAll("[class*='listing-card'], [class*='ListingCard'], article[data-id]");
    cards.forEach((card) => {
      const baslik =
        card.querySelector("h2, h3, [class*='title'], [class*='Title']")?.textContent?.trim() ?? "";
      const fiyat =
        card.querySelector("[class*='price'], [class*='Price'], [class*='fiyat']")?.textContent?.trim() ?? "";
      const konum =
        card.querySelector("[class*='location'], [class*='Location'], [class*='adres']")?.textContent?.trim() ?? "";
      const metrekare =
        card.querySelector("[class*='m2'], [class*='sqm'], [class*='alan']")?.textContent?.trim() ?? "";
      const href = (card.querySelector("a") as HTMLAnchorElement)?.href ?? "";
      if (baslik || fiyat) {
        results.push({ baslik, fiyat, konum, metrekare, oda: "2+1", url: href, kaynak: "emlakjet" });
      }
    });
    return results;
  }) as Promise<Listing[]>;
}

// ── Hepsiemlak ───────────────────────────────────────────────────────────────

async function scrapeHepsiemlak(page: Page): Promise<Listing[]> {
  const url =
    `https://www.hepsiemlak.com/talas-kiralik/daire-2-1-esyali` +
    `?minPrice=${MIN_PRICE}&maxPrice=${MAX_PRICE}`;

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);

  return page.evaluate(() => {
    const results: Listing[] = [];
    const cards = document.querySelectorAll(
      ".listing-item, .listingBox, [class*='listing'], [class*='property-item']"
    );
    cards.forEach((card) => {
      const baslik =
        card.querySelector("h2, h3, .listing-title, [class*='title']")?.textContent?.trim() ?? "";
      const fiyat =
        card.querySelector(".price, [class*='price'], [class*='Price']")?.textContent?.trim() ?? "";
      const konum =
        card.querySelector(".location, [class*='location'], [class*='address']")?.textContent?.trim() ?? "";
      const metrekare =
        card.querySelector("[class*='m2'], [class*='area']")?.textContent?.trim() ?? "";
      const href = (card.querySelector("a") as HTMLAnchorElement)?.href ?? "";
      if (baslik || fiyat) {
        results.push({ baslik, fiyat, konum, metrekare, oda: "2+1", url: href, kaynak: "hepsiemlak" });
      }
    });
    return results;
  }) as Promise<Listing[]>;
}

// ── Sahibinden ───────────────────────────────────────────────────────────────

async function scrapeSahibinden(page: Page): Promise<Listing[]> {
  const url =
    `https://www.sahibinden.com/kiralik-daire/kayseri-talas` +
    `?a0=1&a2_min=2&a2_max=2&a3=1&price_min=${MIN_PRICE}&price_max=${MAX_PRICE}`;

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);

  return page.evaluate(() => {
    const results: Listing[] = [];
    const rows = document.querySelectorAll("tr.searchResultsItem, .classified-list li, [class*='result-item']");
    rows.forEach((row) => {
      const baslik =
        row.querySelector(".classifiedTitle, h3, [class*='title']")?.textContent?.trim() ?? "";
      const fiyat =
        row.querySelector(".classified-price, [class*='price']")?.textContent?.trim() ?? "";
      const konum =
        row.querySelector(".location, [class*='location']")?.textContent?.trim() ?? "";
      const metrekare =
        row.querySelector("[class*='m2'], [class*='area']")?.textContent?.trim() ?? "";
      const href = (row.querySelector("a") as HTMLAnchorElement)?.href ?? "";
      if (baslik || fiyat) {
        results.push({ baslik, fiyat, konum, metrekare, oda: "2+1", url: href, kaynak: "sahibinden" });
      }
    });
    return results;
  }) as Promise<Listing[]>;
}

// ── Ana fonksiyon ─────────────────────────────────────────────────────────────

function yazdir(listings: Listing[]): void {
  if (listings.length === 0) {
    console.log("  (ilan bulunamadı)");
    return;
  }
  listings.forEach((l, i) => {
    console.log(`  ${i + 1}. ${l.baslik}`);
    console.log(`     Fiyat   : ${l.fiyat}`);
    if (l.konum)     console.log(`     Konum   : ${l.konum}`);
    if (l.metrekare) console.log(`     Alan    : ${l.metrekare}`);
    if (l.url)       console.log(`     Link    : ${l.url}`);
    console.log();
  });
}

(async () => {
  console.log(`\nKayseri Talas • Kiralık 2+1 Eşyalı • ${MIN_PRICE.toLocaleString("tr")}–${MAX_PRICE.toLocaleString("tr")} TL\n`);
  console.log("Tarayıcı başlatılıyor...\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "tr-TR",
  });

  const allListings: Listing[] = [];

  const scrapers: [string, (p: Page) => Promise<Listing[]>][] = [
    ["Emlakjet", scrapeEmlakjet],
    ["Hepsiemlak", scrapeHepsiemlak],
    ["Sahibinden", scrapeSahibinden],
  ];

  for (const [name, fn] of scrapers) {
    console.log(`=== ${name} ===`);
    const page = await context.newPage();
    try {
      const listings = await fn(page);
      yazdir(listings);
      allListings.push(...listings);
    } catch (err) {
      console.log(`  Hata: ${(err as Error).message}\n`);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  console.log(`\nToplam ${allListings.length} ilan bulundu.`);

  if (SAVE_JSON) {
    const out = "kayseri-ilanlar.json";
    fs.writeFileSync(out, JSON.stringify(allListings, null, 2));
    console.log(`JSON kaydedildi: ${out}`);
  }
})();
