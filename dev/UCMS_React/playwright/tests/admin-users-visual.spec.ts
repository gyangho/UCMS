import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // 2026-08-23: Exercise admin-only user maintenance without touching real accounts.
  await page.route("**/api/user/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          cacheTtlSeconds: 0,
          user: {
            id: 1, userId: 1, name: "테스트 관리자", role: "admin", authority: 6,
            accountType: "human", systemKey: null, impersonation: null,
          },
        },
      }),
    });
  });
  await page.route("**/api/admin/users", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          users: [
            { id: 1, name: "테스트 관리자", studentId: "20260001", authority: "admin", status: "active", email: "admin@example.com", phoneNumber: "01011112222", passwordConfigured: true, trustedDeviceCount: 1, memberLinked: true, isCurrentUser: true, canForceReauthentication: false, accountType: "human", systemKey: null },
            { id: 2, name: "잘못 연결된 계정", studentId: null, authority: "일반", status: "active", email: "member@example.com", phoneNumber: "01033334444", passwordConfigured: true, trustedDeviceCount: 0, memberLinked: false, isCurrentUser: false, canForceReauthentication: true, accountType: "human", systemKey: null },
          ],
        },
      }),
    });
  });
});

test("administrator can review and edit an unlinked user", async ({ page }, testInfo) => {
  await page.goto("/admin/users", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "사용자 계정 관리", exact: true }).first()).toBeVisible();
  await expect(page.getByText("잘못 연결된 계정")).toBeVisible();
  await expect(page.getByRole("button", { name: "삭제" }).nth(1)).toBeEnabled();
  await page.getByRole("button", { name: "수정" }).nth(1).click();
  await expect(page.getByRole("textbox", { name: "이메일", exact: true })).toHaveValue("member@example.com");
  await expect(page.getByText(/이메일을 바꾸면 기존 비밀번호/)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("admin-user-editor.png"),
    fullPage: true,
    animations: "disabled",
  });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
