import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

// 2026-08-22: Keep impersonation smoke tests local by default.
const baseURL = process.env.UCMS_BASE_URL ?? "https://localhost";
const authFile = path.join(process.cwd(), "playwright", ".auth", "ucms.json");
const artifactDirectory = path.join(process.cwd(), "artifacts", "playwright");
await access(authFile);
await mkdir(artifactDirectory, { recursive: true });

// 2026-08-22: Exercise the real admin UI once, then persist only the regenerated impersonation cookie.
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: authFile,
  // 2026-08-22: The local host intentionally reuses the UCMS Cloudflare origin certificate.
  ignoreHTTPSErrors: true,
});
const page = await context.newPage();

try {
  await page.goto(`${baseURL}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1_000);
  await page.screenshot({
    path: path.join(artifactDirectory, "impersonation-admin-loaded.png"),
    fullPage: true,
  });

  const existingBanner = page.locator(".impersonation-banner");
  if (!(await existingBanner.isVisible().catch(() => false))) {
    const systemRow = page
      .locator("tbody tr")
      .filter({ hasText: "UCMS UI 테스트 관리자" })
      .filter({ hasText: "테스트 변경 허용" })
      .first();
    if (!(await systemRow.isVisible().catch(() => false))) {
      const [currentUserResponse, targetsResponse] = await Promise.all([
        context.request.get(`${baseURL}/api/user/me`),
        context.request.get(`${baseURL}/api/admin/impersonation/targets`),
      ]);
      throw new Error(
        `The system test administrator is not visible. URL=${page.url()} ` +
          `user=${currentUserResponse.status()} ${await currentUserResponse.text()} ` +
          `targets=${targetsResponse.status()} ${await targetsResponse.text()}`,
      );
    }

    // 2026-08-22: Keep visual evidence of both the human-admin controls and active impersonation banner.
    await page.screenshot({
      path: path.join(artifactDirectory, "impersonation-admin-before.png"),
      fullPage: true,
    });
    page.once("dialog", (dialog) => dialog.accept("Playwright UI 자동화"));
    await systemRow.getByRole("button", { name: "화면 전환" }).click();
    await page.waitForURL(/\/dashboard(?:\?.*)?$/, { timeout: 15_000 });
    await page.locator(".impersonation-banner").waitFor({ state: "visible" });
  }

  await page.screenshot({
    path: path.join(artifactDirectory, "impersonation-banner-after.png"),
    fullPage: true,
  });

  await context.storageState({ path: authFile });
  console.log(`Saved the system test administrator session to ${authFile}`);
} finally {
  await browser.close();
}
