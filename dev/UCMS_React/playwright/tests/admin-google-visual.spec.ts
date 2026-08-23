import { expect, test } from "@playwright/test";

test("Google reconnect state explains Forms permission", async ({ page }, testInfo) => {
  // 2026-08-22: Keep this visual state deterministic without depending on a real administrator token.
  await page.route("**/api/user/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          cacheTtlSeconds: 1800,
          user: {
            id: 1,
            userId: 1,
            name: "시스템 관리자",
            email: null,
            studentId: null,
            department: null,
            major: null,
            phone: null,
            role: "admin",
            authority: 4,
            accountType: "system",
            systemKey: "ui-test-admin",
            profileImage: null,
            thumbnailImage: null,
            joinedAt: null,
            impersonation: null,
          },
        },
      }),
    });
  });
  await page.route("**/api/drive/oauth/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { connected: false, reason: "RECONNECT_REQUIRED_FOR_FORMS" },
      }),
    });
  });

  await page.goto("/admin/google", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Google 계정 다시 연결" })).toBeVisible();
  await expect(page.getByText(/Google Drive와 Forms 권한/)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("google-reconnect.png"),
    fullPage: true,
    animations: "disabled",
  });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
