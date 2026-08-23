import { useEffect, useMemo, useState } from "react";

export type PrivateRouteId =
  | "dashboard"
  | "admin"
  | "mypage"
  | "mypage-password"
  | "member"
  | "recruit-forms"
  | "recruit-detail"
  | "recruit-shared-doc"
  | "interview-plans"
  | "interview-active-schedules"
  | "interview-plan-create"
  | "interview-plan-edit"
  | "interview-plan-detail"
  | "event-calendar"
  | "event-my-events"
  | "event-create"
  | "event-detail"
  | "event-edit"
  | "drive-generate-form"
  | "finance"
  | "finance-create"
  | "finance-detail"
  | "finance-edit"
  | "pos-instances"
  | "pos-instance-detail"
  | "pos-sale"
  | "pos-records"
  | "board-notices"
  | "board-notice-detail"
  | "board-inquiries"
  | "board-inquiry-detail"
  | "board-faqs"
  | "board-faq-detail";

export type PublicRouteId =
  | "login"
  | "register"
  | "forgot-password"
  | "public-recruit-result"
  | "public-recruit-response";

export type AppRoute =
  | {
      kind: "private";
      id: PrivateRouteId;
      path: string;
      title: string;
    }
  | {
      kind: "public";
      id: PublicRouteId;
      path: string;
      title: string;
    }
  | {
      kind: "not-found";
      path: string;
    };

// 2026-08-23: Retired Kakao, auth-code, and fixed /recruit/apply routes are intentionally absent.
// 2026-07-16: Route labels were normalized while preserving paths used by the Node API-backed React pages.
const routeTable: Array<Exclude<AppRoute, { kind: "not-found" }>> = [
  {
    kind: "private",
    id: "dashboard",
    path: "/",
    title: "대시보드"
  },
  {
    kind: "private",
    id: "admin",
    path: "/admin",
    title: "관리자"
  },
  {
    kind: "private",
    id: "mypage",
    path: "/mypage",
    title: "마이페이지"
  },
  {
    kind: "private",
    id: "mypage-password",
    path: "/mypage/password",
    title: "비밀번호 변경"
  },
  {
    kind: "private",
    id: "member",
    path: "/member",
    title: "회원 관리"
  },
  {
    kind: "private",
    id: "recruit-forms",
    path: "/recruit",
    title: "모집 관리"
  },
  {
    kind: "private",
    id: "interview-plans",
    path: "/recruit/interview/plans",
    title: "면접 계획"
  },
  {
    kind: "private",
    id: "interview-active-schedules",
    path: "/recruit/interview/schedules",
    title: "확정 면접 스케줄"
  },
  {
    kind: "private",
    id: "event-calendar",
    path: "/event",
    title: "일정"
  },
  {
    kind: "private",
    id: "event-my-events",
    path: "/event/myevents",
    title: "내 일정"
  },
  {
    kind: "private",
    id: "drive-generate-form",
    path: "/drive",
    title: "양식 관리"
  },
  {
    kind: "private",
    id: "finance",
    path: "/finance",
    title: "정산 관리"
  },
  {
    kind: "private",
    id: "pos-instances",
    path: "/pos/instances",
    title: "POS 인스턴스"
  },
  {
    kind: "private",
    id: "pos-records",
    path: "/pos/instances/:id/records",
    title: "POS 기록"
  },
  {
    kind: "private",
    id: "board-notices",
    path: "/board/notices",
    title: "공지사항"
  },
  {
    kind: "private",
    id: "board-inquiries",
    path: "/board/inquiries",
    title: "문의 게시판"
  },
  {
    kind: "private",
    id: "board-faqs",
    path: "/board/faq",
    title: "FAQ"
  },
  {
    kind: "public",
    id: "login",
    path: "/login",
    title: "로그인"
  },
  {
    kind: "public",
    id: "register",
    path: "/register",
    title: "회원가입"
  },
  {
    kind: "public",
    id: "forgot-password",
    path: "/forgot-password",
    title: "비밀번호 찾기"
  },
  {
    kind: "public",
    id: "public-recruit-result",
    path: "/public/recruit-result",
    title: "모집 결과 조회"
  },
  {
    kind: "public",
    id: "public-recruit-response",
    path: "/public/recruit-response",
    title: "지원 응답 조회"
  }
];

const hiddenNavIds: PrivateRouteId[] = [
  "dashboard",
  "admin",
  "mypage",
  "mypage-password",
  "recruit-detail",
  "event-my-events",
  "event-create",
  "event-detail",
  "event-edit",
  "finance-create",
  "finance-detail",
  "finance-edit",
  "pos-records",
  "pos-instance-detail",
  "pos-sale",
  "interview-plans"
];

export const navRoutes = routeTable.filter(
  (route) => route.kind === "private" && !hiddenNavIds.includes(route.id)
);

export const navStandaloneRoutes = getPrivateRoutes(["board-notices"]);

export const navGroups: Array<{
  title: string;
  routes: Array<Extract<AppRoute, { kind: "private" }>>;
}> = [
  {
    title: "회계",
    routes: getPrivateRoutes(["finance", "pos-instances"])
  },
  {
    title: "인사",
    routes: getPrivateRoutes([
      "member",
      "recruit-forms",
      "interview-plans",
      "interview-active-schedules",
      "drive-generate-form"
    ])
  },
  {
    title: "일정",
    routes: getPrivateRoutes(["event-calendar", "event-my-events"])
  },
  {
    title: "문의",
    routes: getPrivateRoutes(["board-inquiries", "board-faqs"])
  }
];

export function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useCurrentRoute(): AppRoute {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handleRouteChange = () => setPath(window.location.pathname);

    window.addEventListener("popstate", handleRouteChange);
    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  return useMemo(() => matchRoute(path), [path]);
}

function matchRoute(path: string): AppRoute {
  // 2026-08-23: Do not let retired application URLs fall back to the broader /recruit section route.
  if (path === "/recruit/apply" || path === "/recurit/apply") {
    return { kind: "not-found", path };
  }

  if (path === "/dashboard") {
    return routeTable.find((route) => route.id === "dashboard")!;
  }

  if (/^\/board\/notices\/\d+$/.test(path)) {
    return {
      kind: "private",
      id: "board-notice-detail",
      path,
      title: "공지사항"
    };
  }

  if (/^\/board\/inquiries\/\d+$/.test(path)) {
    return {
      kind: "private",
      id: "board-inquiry-detail",
      path,
      title: "문의 게시판"
    };
  }

  if (/^\/board\/faq\/\d+$/.test(path)) {
    return {
      kind: "private",
      id: "board-faq-detail",
      path,
      title: "FAQ"
    };
  }

  if (/^\/recruit\/responses\/\d+$/.test(path)) {
    return {
      kind: "private",
      id: "recruit-shared-doc",
      path,
      title: "공유 문서"
    };
  }

  if (/^\/recruit\/\d+$/.test(path)) {
    return {
      kind: "private",
      id: "recruit-detail",
      path,
      title: "모집 상세"
    };
  }

  // 2026-07-23: Keep the multi-step interview planner inside the React route table.
  if (path === "/recruit/interview/new" || path === "/recruit/interview/plan") {
    return {
      kind: "private",
      id: "interview-plan-create",
      path,
      title: "면접 계획 생성"
    };
  }

  // 2026-08-23: Linked plans open directly at interviewer assignment for editing.
  if (/^\/recruit\/interview\/plans\/\d+\/edit\/interviewers$/.test(path)) {
    return {
      kind: "private",
      id: "interview-plan-edit",
      path,
      title: "면접 계획 수정"
    };
  }

  if (/^\/recruit\/interview\/plans\/\d+$/.test(path)) {
    return {
      kind: "private",
      id: "interview-plan-detail",
      path,
      title: "면접 계획 상세"
    };
  }

  if (path === "/event/new") {
    return {
      kind: "private",
      id: "event-create",
      path,
      title: "일정 생성"
    };
  }

  if (/^\/event\/\d+\/edit$/.test(path)) {
    return {
      kind: "private",
      id: "event-edit",
      path,
      title: "일정 수정"
    };
  }

  if (/^\/event\/\d+$/.test(path)) {
    return {
      kind: "private",
      id: "event-detail",
      path,
      title: "일정 상세"
    };
  }

  // 2026-07-23: Settlement creation/editing use dedicated React pages.
  if (path === "/finance/new") {
    return {
      kind: "private",
      id: "finance-create",
      path,
      title: "정산 생성"
    };
  }

  if (/^\/finance\/\d+\/edit$/.test(path)) {
    return {
      kind: "private",
      id: "finance-edit",
      path,
      title: "정산 수정"
    };
  }

  if (/^\/finance\/\d+$/.test(path)) {
    return {
      kind: "private",
      id: "finance-detail",
      path,
      title: "정산 상세"
    };
  }

  if (/^\/pos\/instances\/\d+\/records$/.test(path)) {
    return {
      kind: "private",
      id: "pos-records",
      path,
      title: "POS 기록"
    };
  }

  if (/^\/pos\/instances\/\d+$/.test(path)) {
    return {
      kind: "private",
      id: "pos-instance-detail",
      path,
      title: "POS 인스턴스 상세"
    };
  }

  if (/^\/pos\/\d+$/.test(path)) {
    return {
      kind: "private",
      id: "pos-sale",
      path,
      title: "POS 판매"
    };
  }

  if (path === "/pos") {
    return routeTable.find((route) => route.id === "pos-instances")!;
  }

  if (path === "/drive/generateform") {
    return routeTable.find((route) => route.id === "drive-generate-form")!;
  }

  if (path === "/event/calendar") {
    return routeTable.find((route) => route.id === "event-calendar")!;
  }

  const exactRoute = routeTable.find((route) => route.path === path);

  if (exactRoute) {
    return exactRoute;
  }

  const sectionRoute = routeTable
    .filter((route) => route.path !== "/")
    .sort((a, b) => b.path.length - a.path.length)
    .find((route) => path.startsWith(`${route.path}/`));

  if (sectionRoute) {
    return {
      ...sectionRoute,
      path
    };
  }

  return {
    kind: "not-found",
    path
  };
}

function getPrivateRoutes(ids: PrivateRouteId[]) {
  return ids
    .map((id) => routeTable.find((route) => route.kind === "private" && route.id === id))
    .filter((route): route is Extract<AppRoute, { kind: "private" }> => Boolean(route));
}
