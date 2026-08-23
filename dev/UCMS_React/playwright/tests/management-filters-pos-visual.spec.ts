import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // 2026-08-23: Use deterministic management data so desktop/mobile visual checks never mutate dev records.
  await page.route("**/api/user/me", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { user: { id: 1, userId: 1, name: "테스트 관리자", role: "admin", authority: 6, accountType: "human" } } }) }));
  await page.route("**/api/pos/active", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { instance: null } }) }));
});

test("member filters use the themed management card", async ({ page }, testInfo) => {
  await page.route("**/api/members", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { members: [
    { id: "20260001", userId: 1, name: "김회원", studentId: "20260001", major: "컴퓨터공학", phoneNumber: "01011112222", generation: 10, authority: 2, authorityLabel: "부원" },
    { id: "20250002", userId: null, name: "이회원", studentId: "20250002", major: "경영학", phoneNumber: "01033334444", generation: 9, authority: 3, authorityLabel: "임원진" },
  ] } }) }));
  await page.goto("/member");
  await expect(page.getByLabel("회원 검색 필터")).toBeVisible();
  await capture(page, testInfo.outputPath("member-filters.png"));
});

test("recruit applicant filters use the themed management card", async ({ page }, testInfo) => {
  await page.route("**/api/recruit/instances/7", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { instance: { id: 7, formId: "form-7", title: "2026 신규부원 모집", status: "interview", recruitStart: "2026-08-01T00:00:00Z", recruitEnd: "2026-08-20T00:00:00Z", formUrl: "https://docs.google.com/forms/d/example", promotionCopy: "함께할 부원을 모집합니다.", posterUrls: [], applicantCount: 3, maleCount: 2, femaleCount: 1, firstPassRate: 66, finalPassRate: 0, interviewPlanId: 1 } } }) }));
  await page.route("**/api/recruit/responses", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { responses: [
    { id: 1, applicantName: "박지원", studentId: "20260003", gender: "남자", rating: "1차합격", formId: "form-7" },
    { id: 2, applicantName: "최지원", studentId: "20260004", gender: "여자", rating: "대기", formId: "form-7" },
  ] } }) }));
  await page.goto("/recruit/7");
  await expect(page.getByText("지원자 검색")).toBeVisible();
  await capture(page, testInfo.outputPath("recruit-applicant-filters.png"));
});

test("non-selling POS instance exposes a responsive editor", async ({ page }, testInfo) => {
  await page.route("**/api/pos/instances/3", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { instance: { id: 3, instanceName: "동아리제 판매", status: "inactive", creatorName: "테스트 관리자", createdAt: "2026-08-20T09:00:00Z", autoCloseAt: "2026-08-25T12:00:00Z", promotionCopy: "축제 부스에 놀러오세요." }, products: [{ id: 11, name: "에이드", price: 3000, stock: 20 }], salesmans: [{ id: 1, studentId: "20260001", name: "김회원" }], canManage: true } }) }));
  await page.route("**/api/members", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { members: [{ id: "20260001", name: "김회원", studentId: "20260001" }] } }) }));
  await page.goto("/pos/instances/3");
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await expect(page.getByRole("region", { name: "POS 인스턴스 수정" })).toBeVisible();
  await capture(page, testInfo.outputPath("pos-instance-editor.png"));
});

test("calendar bars choose readable text for light and dark event colors", async ({ page }, testInfo) => {
  const start = new Date();
  start.setDate(Math.max(2, Math.min(start.getDate(), 20)));
  const end = new Date(start);
  end.setDate(start.getDate() + 2);
  await page.route("**/api/dashboard", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: {
    calendarEvents: [
      { id: 91, title: "밝은 일정", start: start.toISOString(), end: end.toISOString(), color: "#fff4bd", isMultiple: true },
      { id: 92, title: "어두운 일정", start: start.toISOString(), end: end.toISOString(), color: "#2d1b12", isMultiple: true },
    ], myEvents: [], recruitingEvents: [], notices: [], activePos: null, recruitmentPromotions: [], recruitResultLookup: null,
  } }) }));
  await page.goto("/");
  const lightBar = page.getByRole("button", { name: /밝은 일정/ }).first();
  const darkBar = page.getByRole("button", { name: /어두운 일정/ }).first();
  await expect(lightBar).toHaveCSS("color", "rgb(36, 24, 14)");
  await expect(darkBar).toHaveCSS("color", "rgb(255, 255, 255)");
  await capture(page, testInfo.outputPath("calendar-contrast.png"));
});

test("desktop recruitment posters form a continuous strip while mobile spacing stays intact", async ({ page }, testInfo) => {
  // 2026-08-23: Exercise connected desktop poster pages without changing the established mobile carousel.
  const poster = (color: string, pageNumber: number) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="700" height="990"><rect width="700" height="990" fill="${color}"/><text x="350" y="495" text-anchor="middle" font-size="72" fill="#4f2d18">${pageNumber}</text></svg>`)}`;
  await page.route("**/api/dashboard", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: {
    calendarEvents: [], myEvents: [], recruitingEvents: [], notices: [], activePos: null, recruitResultLookup: null,
    recruitmentPromotions: [{ id: 1, title: "11기 모집", promotionCopy: "함께할 부원을 모집합니다.", formUrl: "https://example.com/apply", posterUrls: [poster("#fff0b8", 1), poster("#f5d889", 2), poster("#f0c965", 3)] }],
  } }) }));
  await page.goto("/");
  const carousel = page.locator(".recruit-promotion .promotion-poster-carousel");
  const isMobile = (page.viewportSize()?.width ?? 1440) < 721;
  await expect(carousel).toHaveCSS("gap", isMobile ? "12px" : "2px");
  await expect(carousel).toHaveCSS("padding-left", isMobile ? "12px" : "0px");
  await expect(carousel.locator("img")).toHaveCount(3);
  await capture(page, testInfo.outputPath("dashboard-recruitment-poster-strip.png"));
});

test("event detail omits unrelated participant and settlement cards", async ({ page }, testInfo) => {
  await page.route("**/api/events/5", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { event: {
    id: 5, title: "일반 단일 일정", description: "참가 모집과 정산이 없는 일정", start: "2026-08-24T01:00:00.000Z", end: "2026-08-24T03:00:00.000Z", color: "#f5dfaa", authorName: "테스트 관리자", authority: "부원", isMultiple: false, isRecruiting: false, participants: [], settlement: null, canEdit: true, canDelete: true,
  } } }) }));
  await page.goto("/event/5");
  await expect(page.getByRole("heading", { name: /참여자/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "관련 정산" })).toHaveCount(0);
  await capture(page, testInfo.outputPath("event-detail-without-empty-cards.png"));
});

test("recruitment planning opens the linked plan at interviewer assignment", async ({ page }, testInfo) => {
  await page.route("**/api/recruit/instances/8", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { instance: {
    id: 8, formId: "form-8", title: "8기 모집", status: "planning", recruitStart: "2026-08-01T00:00:00Z", recruitEnd: "2026-08-20T00:00:00Z", interviewStart: "2026-09-01T01:00:00Z", interviewEnd: "2026-09-03T10:00:00Z", formUrl: "https://docs.google.com/forms/d/form-8/viewform", promotionCopy: "함께할 부원을 모집합니다.", posterUrls: [], applicantCount: 12, maleCount: 7, femaleCount: 5, firstPassRate: 0, finalPassRate: 0, interviewPlanId: 36, interviewPlanStatus: "draft",
  } } }) }));
  await page.route("**/api/recruit/responses", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { responses: [] } }) }));
  await page.goto("/recruit/8");
  await expect(page.getByRole("button", { name: "면접 계획하기" })).toBeVisible();
  await expect(page.getByLabel("면접 시작")).toBeVisible();
  await expect(page.getByRole("link", { name: "Google Form 수정 화면 열기" })).toHaveAttribute("href", "https://docs.google.com/forms/d/form-8/edit");
  await capture(page, testInfo.outputPath("recruitment-planning-detail.png"));
});

test("linked interview plan editor preloads interviewer assignment", async ({ page }, testInfo) => {
  await page.route("**/api/recruit/forms", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { forms: [{ id: "form-8", title: "8기 모집" }] } }) }));
  await page.route("**/api/interview/interviewers", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { interviewers: [{ id: "20260001", name: "김면접", authority: "임원진" }, { id: "20250002", name: "이면접", authority: "회장" }] } }) }));
  await page.route("**/api/recruit/forms/form-8/interview-dates", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { dates: [{ date: "09/01(화)", questionId: "q1" }] } }) }));
  await page.route("**/api/interview/plans/36", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: {
    plan: { id: 36, recruitmentId: 8, formId: "form-8", formTitle: "8기 모집", title: "8기 모집 면접 계획", status: "draft", panelSize: 2 }, interviewDates: [{ date: "09/01(화)", questionId: "q1" }], interviewers: [{ id: "20260001", name: "김면접", authority: "임원진" }], availability: [], applicants: [], schedule: [], slotLocations: [],
  } }) }));
  await page.goto("/recruit/interview/plans/36/edit/interviewers");
  await expect(page.getByRole("heading", { name: "면접관 추가" })).toBeVisible();
  await expect(page.getByRole("button", { name: "모집 상세 페이지로 이동" })).toBeVisible();
  await capture(page, testInfo.outputPath("linked-interview-plan-editor.png"));
});

test("interview plan detail exposes edit, recruitment return, and minimum interviewer controls", async ({ page }, testInfo) => {
  await page.route("**/api/interview/plans/36", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: {
    plan: { id: 36, recruitmentId: 8, formId: "form-8", formTitle: "8기 모집", title: "8기 모집 면접 계획", status: "draft", panelSize: 2, owner: "테스트 관리자", updatedAt: "2026-08-23T01:00:00Z" }, interviewDates: [{ date: "09/01(화)", questionId: "q1" }], interviewers: [{ id: "20260001", name: "김면접", authority: "임원진" }, { id: "20250002", name: "이면접", authority: "회장" }], availability: [], applicants: [], schedule: [], slotLocations: [],
  } }) }));
  await page.goto("/recruit/interview/plans/36");
  await expect(page.getByRole("button", { name: "수정", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "모집 상세 페이지로 이동" })).toBeVisible();
  await expect(page.getByLabel("최소 면접관 수")).toHaveValue("2");
  await capture(page, testInfo.outputPath("interview-plan-detail-controls.png"));
});

test("form management exposes metadata and Google question editing", async ({ page }, testInfo) => {
  await page.route("**/api/drive/templates", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { templates: [{ id: 1, title: "신규부원 모집 양식", formUrl: "https://docs.google.com/forms/d/template/edit" }] } }) }));
  await page.goto("/drive");
  await expect(page.getByRole("heading", { name: "양식 관리" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Google Form에서 질문 수정" })).toHaveAttribute("target", "_blank");
  await page.getByRole("button", { name: "정보 수정" }).click();
  await expect(page.getByRole("heading", { name: "양식 정보 수정" })).toBeVisible();
  await capture(page, testInfo.outputPath("form-template-management.png"));
});

test("executive navigation exposes form management", async ({ page }, testInfo) => {
  // 2026-08-23: Keep the existing template manager discoverable from both navigation layouts.
  await page.route("**/api/dashboard", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { calendarEvents: [], myEvents: [], recruitingEvents: [], notices: [], activePos: null, recruitmentPromotions: [], recruitResultLookup: null } }) }));
  await page.route("**/api/drive/templates", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { templates: [] } }) }));
  await page.goto("/");
  const isMobile = (page.viewportSize()?.width ?? 1440) < 760;
  if (isMobile) {
    await page.getByRole("button", { name: "전체 메뉴" }).click();
    const mobileMenu = page.getByRole("navigation", { name: "모바일 전체 메뉴" });
    const formManagementButton = mobileMenu.getByRole("button", { name: "양식 관리" });
    await expect(formManagementButton).toBeVisible();
    await formManagementButton.scrollIntoViewIfNeeded();
    await capture(page, testInfo.outputPath("form-management-mobile-navigation.png"));
    await formManagementButton.click();
  } else {
    const desktopMenu = page.getByRole("navigation", { name: "주요 메뉴" });
    await desktopMenu.getByRole("button", { name: "인사", exact: true }).hover();
    await expect(desktopMenu.getByRole("button", { name: "양식 관리" })).toBeVisible();
    await capture(page, testInfo.outputPath("form-management-desktop-navigation.png"));
    await desktopMenu.getByRole("button", { name: "양식 관리" }).click();
  }
  await expect(page).toHaveURL(/\/drive$/);
  await expect(page.getByRole("heading", { name: "양식 관리" })).toBeVisible();
});

test("all React date-time pickers use ten-minute increments", async ({ page }) => {
  // 2026-08-23: Verify schedule, recruitment, interview, and POS date-time controls at the DOM contract level.
  await page.route("**/api/members", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { members: [] } }) }));
  await page.goto("/event/new");
  await expect(page.locator('input[type="datetime-local"]')).toHaveCount(2);
  for (const input of await page.locator('input[type="datetime-local"]').all()) {
    await expect(input).toHaveAttribute("step", "600");
  }

  await page.route("**/api/pos/instances", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { instances: [], canCreate: true } }) }));
  await page.goto("/pos/instances");
  await page.getByRole("button", { name: "새 인스턴스" }).click();
  await expect(page.getByLabel("자동 판매 종료 시간")).toHaveAttribute("step", "600");
});

test("recruit poster size error and save progress are visible", async ({ page }, testInfo) => {
  // 2026-08-23: Exercise client-side upload limits and the long-running save indicator without writing real data.
  await page.route("**/api/recruit/instances/4", async (route) => {
    if (route.request().method() === "PATCH") {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: {} }) });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { instance: {
      id: 4, title: "10기 모집", status: "draft", recruitStart: "2026-09-01T01:00:00Z", recruitEnd: "2026-09-10T09:00:00Z", interviewStart: "2026-09-12T01:00:00Z", interviewEnd: "2026-09-13T09:00:00Z", formUrl: "", promotionCopy: "함께할 신입 부원을 모집합니다.", posterUrls: [], applicantCount: 0, maleCount: 0, femaleCount: 0, firstPassRate: 0, finalPassRate: 0,
    } } }) });
  });
  await page.route("**/api/drive/templates", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { templates: [] } }) }));
  await page.goto("/recruit/4");
  await page.getByLabel("모집 포스터").setInputFiles({ name: "oversized.png", mimeType: "image/png", buffer: Buffer.alloc(8 * 1024 * 1024 + 1) });
  await expect(page.getByText(/이미지 한 장은 8MB 이하여야 합니다/)).toBeVisible();
  await page.getByRole("button", { name: "초안 저장" }).click();
  await expect(page.getByText("저장 중...")).toBeVisible();
  await capture(page, testInfo.outputPath("recruit-upload-limit-and-loading.png"));
});

test("POS poster size error and creation progress are visible", async ({ page }, testInfo) => {
  // 2026-08-23: Verify the 10MB PDF guard and spinner for POS creation on both configured viewports.
  await page.route("**/api/pos/instances", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { id: 9, path: "/pos/instances/9" } }) });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { instances: [], canCreate: true } }) });
  });
  await page.route("**/api/members", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { members: [{ id: "20260001", name: "김판매", studentId: "20260001" }] } }) }));
  await page.goto("/pos/instances");
  await page.getByRole("button", { name: "새 인스턴스" }).click();
  await page.getByLabel("홍보 포스터(A4 PDF)").setInputFiles({ name: "oversized.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(page.getByText("홍보 포스터 PDF는 10MB 이하여야 합니다.")).toBeVisible();
  await page.getByLabel("인스턴스 이름").fill("축제 판매");
  await page.getByPlaceholder("이름 또는 학번 검색").fill("김판매");
  await page.getByRole("button", { name: /김판매/ }).click();
  await page.getByLabel("품목명").fill("레몬에이드");
  await page.getByLabel("가격").fill("3000");
  await page.getByLabel("재고").fill("20");
  await page.getByRole("button", { name: "품목 추가" }).click();
  await page.getByRole("button", { name: "인스턴스 생성" }).click();
  await expect(page.getByText("처리 중...")).toBeVisible();
  await capture(page, testInfo.outputPath("pos-upload-limit-and-loading.png"));
});

test("mypage exposes the password change form", async ({ page }, testInfo) => {
  // 2026-08-23: Keep the new security control readable and usable on desktop and mobile.
  await page.goto("/mypage");
  await expect(page.getByRole("heading", { name: "비밀번호 변경" })).toBeVisible();
  await expect(page.getByLabel("현재 비밀번호")).toBeVisible();
  await expect(page.getByLabel("새 비밀번호", { exact: true })).toBeVisible();
  await expect(page.getByLabel("새 비밀번호 확인")).toBeVisible();
  await capture(page, testInfo.outputPath("mypage-password-change.png"));
});

async function capture(page: import("@playwright/test").Page, path: string) {
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}
