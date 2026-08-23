import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "@playwright/test";

// 2026-08-22: Save authentication against the local stack unless a remote target is explicitly requested.
const baseURL = process.env.UCMS_BASE_URL ?? "https://localhost";
const authDirectory = path.join(process.cwd(), "playwright", ".auth");
const authFile = path.join(authDirectory, "ucms.json");

await mkdir(authDirectory, { recursive: true });

// 2026-08-22: Keep UCMS credentials and email codes out of automation; the user signs in manually once.
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  // 2026-08-22: The local host intentionally reuses the UCMS Cloudflare origin certificate.
  ignoreHTTPSErrors: true,
});
const page = await context.newPage();
const prompt = createInterface({ input, output });

try {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  output.write(`\nOpened ${baseURL}\n`);
  output.write("Complete UCMS email/password login in the browser window.\n");
  await prompt.question("After the UCMS dashboard is visible, return here and press Enter: ");
  await context.storageState({ path: authFile });
  output.write(`Saved the local browser session to ${authFile}\n`);
} finally {
  prompt.close();
  await browser.close();
}
