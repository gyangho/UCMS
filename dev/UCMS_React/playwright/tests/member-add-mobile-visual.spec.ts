import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // 2026-08-29: Verify the member-entry UI locally with mocked read-only data instead of a real account or database.
  await page.route("**/api/user/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          cacheTtlSeconds: 0,
          user: {
            id: 1,
            userId: 1,
            name: "테스트 관리자",
            role: "admin",
            authority: 6,
            accountType: "human",
            systemKey: null,
            impersonation: null,
          },
        },
      }),
    });
  });
  await page.route("**/api/members", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { members: [] } }),
    });
  });
});

test("member registration fields are touch-friendly", async ({ page }, testInfo) => {
  await page.goto("/member", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "회원 추가", exact: true }).click();

  const studentId = page.getByLabel("학번", { exact: true });
  await expect(studentId).toBeVisible();
  await expect(page.getByLabel("이름", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "새 회원 행 삭제" })).toBeVisible();

  const viewport = page.viewportSize();
  if (viewport && viewport.width <= 760) {
    const fieldBox = await studentId.boundingBox();
    expect(fieldBox?.height ?? 0).toBeGreaterThanOrEqual(48);
    expect(fieldBox?.width ?? 0).toBeGreaterThanOrEqual(250);
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: testInfo.outputPath("member-add.png"),
    fullPage: true,
    animations: "disabled",
  });
});
