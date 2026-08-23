import { expect, test } from "@playwright/test";

test("fixed recruit apply menu and route stay retired", async ({ page }, testInfo) => {
  // 2026-08-23: Recruitment applications must enter through the active instance's Google Form link.
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("신규부원 지원서 작성", { exact: true })).toHaveCount(0);

  await page.goto("/recruit/apply", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "페이지를 찾을 수 없습니다" })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("retired-recruit-apply.png"),
    fullPage: true,
    animations: "disabled",
  });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.goto("/recurit/apply", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "페이지를 찾을 수 없습니다" })).toBeVisible();
});
