import { defineConfig } from "@playwright/test";
import * as path from "path";

export default defineConfig({
  testDir: "./e2e",
  use: {
    headless: false,
    launchOptions: {
      executablePath: path.join(__dirname, ".browsers", "chrome-linux", "chrome"),
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--ignore-certificate-errors"],
    },
    screenshot: "only-on-failure",
  },
});
