import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

test("yerel sayfa ekran görüntüsü", async ({ page }) => {
  await page.setContent(`
    <!DOCTYPE html>
    <html lang="tr">
      <head><title>Playwright Test Sayfası</title></head>
      <body>
        <h1>Merhaba Playwright!</h1>
        <p>Tarayıcı başarıyla açıldı.</p>
      </body>
    </html>
  `);
  await expect(page).toHaveTitle("Playwright Test Sayfası");
  await expect(page.locator("h1")).toHaveText("Merhaba Playwright!");

  const screenshotPath = path.join("e2e", "screenshots", "example.png");
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath });
});
