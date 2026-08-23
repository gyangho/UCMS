import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // 2026-08-22: Keep public auth screenshots deterministic when only the Vite UI is running.
  await page.route("**/api/user/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { cacheTtlSeconds: 0, user: null },
      }),
    });
  });
});

test("dev login and registration forms do not expose an email-code step", async ({ page }, testInfo) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "UCMS 로그인" })).toBeVisible();
  await expect(page.locator('input[autocomplete="one-time-code"]')).toHaveCount(0);
  await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);

  // 2026-08-22: Guard the finished theme states that were missing from the original native-auth form.
  const loginSubmit = page.locator(".auth-form > button[type='submit']");
  await expect(loginSubmit).toHaveCSS("background-color", "rgb(90, 58, 29)");
  await loginSubmit.hover();
  await expect(loginSubmit).toHaveCSS("background-color", "rgb(67, 41, 19)");
  await page.locator('input[type="email"]').focus();
  await expect(page.locator('input[type="email"]')).toHaveCSS("border-radius", "10px");
  expect(await page.locator('input[type="email"]').evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");

  await page.screenshot({
    path: testInfo.outputPath("dev-login.png"),
    fullPage: true,
    animations: "disabled",
  });

  await page.getByRole("tab", { name: "회원가입" }).click();
  await expect(page.getByRole("heading", { name: "UCMS 회원가입" })).toBeVisible();
  // 2026-08-23: Account signup no longer asks for member-only student ID or major fields.
  await expect(page.getByLabel("이름")).toBeVisible();
  await expect(page.getByLabel("전화번호")).toBeVisible();
  await expect(page.getByLabel("학번")).toHaveCount(0);
  await expect(page.getByLabel("전공")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "회원가입", exact: true })).toBeVisible();
  await expect(page.locator('input[autocomplete="one-time-code"]')).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("dev-register.png"),
    fullPage: true,
    animations: "disabled",
  });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("password recovery is reachable from login and stays responsive", async ({ page }, testInfo) => {
  // 2026-08-23: Mock delivery so visual verification never resets a real account password.
  await page.route("**/api/auth/password/temporary", (route) => route.fulfill({
    contentType: "application/json",
    status: 200,
    body: JSON.stringify({
      success: true,
      data: { message: "가입된 이메일이라면 임시 비밀번호를 발송했습니다." },
    }),
  }));

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const recoveryLink = page.getByRole("button", { name: "비밀번호 찾기" });
  await expect(recoveryLink).toBeVisible();
  await expect(recoveryLink).toHaveCSS("font-size", "12px");
  await recoveryLink.click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole("heading", { name: "비밀번호 찾기" })).toBeVisible();
  await page.getByLabel("이메일").fill("member@example.com");
  await page.getByRole("button", { name: "임시 비밀번호 받기" }).click();
  await expect(page.getByText("가입된 이메일이라면 임시 비밀번호를 발송했습니다.")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("forgot-password.png"),
    fullPage: true,
    animations: "disabled",
  });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
