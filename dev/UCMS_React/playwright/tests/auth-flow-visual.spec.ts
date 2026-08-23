import { expect, test } from "@playwright/test";

test("email two-factor step is usable and responsive", async ({ page }, testInfo) => {
  // 2026-08-23: Mock only code delivery so the visual check does not require real Gmail SMTP credentials.
  let startRequests = 0;
  await page.route("**/api/auth/login/start", async (route) => {
    startRequests += 1;
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        success: true,
        data: { authenticated: false, twoFactorRequired: true },
      }),
    });
  });

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill("member@example.com");
  await page.locator('input[type="password"]').fill("example-password");
  await page.locator("form").press("Enter");

  await expect(page.locator('input[autocomplete="one-time-code"]')).toBeVisible();
  await expect(page.locator('input[type="checkbox"]')).toBeVisible();
  await page.getByRole("button", { name: "인증번호 다시 받기" }).click();
  await expect(page.getByText(/새 인증번호를 이메일로 보냈습니다/)).toBeVisible();
  expect(startRequests).toBe(2);
  await page.screenshot({
    path: testInfo.outputPath("email-two-factor.png"),
    fullPage: true,
    animations: "disabled",
  });

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});
