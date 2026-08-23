import { expect, test } from "@playwright/test";

const routes = (process.env.UCMS_PATHS ?? "/")
  .split(",")
  .map((route) => route.trim())
  .filter(Boolean);

for (const route of routes) {
  test(`${route} renders without a horizontal overflow`, async ({ page }, testInfo) => {
    const pageErrors: string[] = [];

    // 2026-08-22: Capture browser-side failures together with desktop/mobile visual evidence.
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response, `No document response was received for ${route}`).not.toBeNull();
    expect(response?.status(), `Unexpected HTTP status for ${route}`).toBeLessThan(400);

    await expect(page.locator("body")).toBeVisible();
    await page.waitForTimeout(1_000);

    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    await page.screenshot({
      path: testInfo.outputPath("full-page.png"),
      fullPage: true,
      animations: "disabled",
    });

    expect(horizontalOverflow, "The page overflows horizontally").toBeLessThanOrEqual(1);
    expect(pageErrors, "Uncaught page errors were reported").toEqual([]);
  });
}
