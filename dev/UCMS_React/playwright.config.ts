import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// 2026-08-22: Make local Docker the safe default so UI checks never target the shared dev host implicitly.
const baseURL = process.env.UCMS_BASE_URL ?? "https://localhost";
const authFile = path.join(process.cwd(), "playwright", ".auth", "ucms.json");
const useAuth = process.env.UCMS_USE_AUTH === "1";

// 2026-08-22: Fail before opening a page when an authenticated run has no saved local session.
if (useAuth && !existsSync(authFile)) {
  throw new Error(
    `Authenticated browser run requested, but ${authFile} does not exist. Run npm run browser:session first.`,
  );
}

export default defineConfig({
  testDir: "./playwright/tests",
  outputDir: "./artifacts/playwright/test-results",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: "./artifacts/playwright/report",
        open: "never",
      },
    ],
  ],
  use: {
    baseURL,
    // 2026-08-22: Local nginx serves the Cloudflare origin certificate issued for the UCMS hostname.
    ignoreHTTPSErrors: true,
    storageState: useAuth ? authFile : undefined,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
});
