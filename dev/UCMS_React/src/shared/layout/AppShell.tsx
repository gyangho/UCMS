import { type PropsWithChildren, useEffect, useRef, useState } from "react";
import { navigate } from "../../app/router";
import { requestData } from "../api/http";
import { clearCurrentUser, useCurrentUser } from "../api/user";
import { ApiIssueBanner } from "../ui/ApiIssueBanner";

export function AppShell({ children }: PropsWithChildren) {
  // 2026-07-16: Shell no longer blocks anonymous dashboard rendering; backend APIs still enforce page-level authority.
  const { user: currentUser, error: currentUserError } = useCurrentUser();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activePosId, setActivePosId] = useState<number | null>(null);
  const [impersonationEnding, setImpersonationEnding] = useState(false);
  const [impersonationError, setImpersonationError] = useState<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // 2026-08-20: Member festival navigation appears only while a POS sale is active.
    requestData<{ instance: { id: number } | null }>("/api/pos/active")
      .then((data) => setActivePosId(data.instance?.id ?? null))
      .catch(() => setActivePosId(null));
  }, []);

  const authority = currentUser?.authority ?? 0;
  const navStandaloneRoutes = [
    { id: "board-notices", path: "/board/notices", title: "공지사항" },
  ];
  const navGroups = [
    {
      title: "신규부원 모집",
      // 2026-08-23: Applications open through each recruitment's external Google Form, not a fixed UCMS route.
      routes: [
        {
          id: "recruit-result",
          path: "/public/recruit-result",
          title: "지원 결과 확인",
        },
        {
          id: "recruit-response",
          path: "/public/recruit-response",
          title: "내 지원서 보기",
        },
      ],
    },
    ...(authority >= 2
      ? [
          {
            title: "일정",
            routes: [
              { id: "event-calendar", path: "/event", title: "일정" },
              {
                id: "event-my-events",
                path: "/event/myevents",
                title: "내 일정",
              },
            ],
          },
        ]
      : []),
    ...(authority >= 3 || (authority >= 2 && activePosId)
      ? [
          {
            title: "축제 부스 관리",
            routes: [
              ...(authority >= 3
                ? [
                    {
                      id: "pos-instances",
                      path: "/pos/instances",
                      title: "POS 인스턴스 관리",
                    },
                  ]
                : []),
              ...(activePosId
                ? [
                    {
                      id: "pos-sale",
                      path: `/pos/${activePosId}`,
                      title: "판매 페이지",
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),
    ...(authority >= 3
      ? [
          {
            title: "회계",
            routes: [{ id: "finance", path: "/finance", title: "정산 관리" }],
          },
          {
            title: "인사",
            routes: [
              { id: "member", path: "/member", title: "회원 관리" },
              { id: "recruit-forms", path: "/recruit", title: "모집 관리" },
              // 2026-08-23: Expose the existing Google Form template manager to executive users.
              { id: "drive-generate-form", path: "/drive", title: "양식 관리" },
              {
                id: "interview-schedules",
                path: "/recruit/interview/schedules",
                title: "확정 면접 스케줄",
              },
            ],
          },
        ]
      : []),
    {
      title: "문의",
      routes: [
        {
          id: "board-inquiries",
          path: "/board/inquiries",
          title: "문의 게시판",
        },
        { id: "board-faqs", path: "/board/faq", title: "FAQ" },
      ],
    },
  ];

  function openNavGroup(groupTitle: string) {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setOpenGroup(groupTitle);
  }

  function scheduleCloseNavGroup() {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setOpenGroup(null);
      closeTimerRef.current = null;
    }, 260);
  }

  async function endImpersonation() {
    setImpersonationEnding(true);
    setImpersonationError(null);
    try {
      await requestData<{ active: false }>("/api/admin/impersonation/exit", {
        method: "POST",
      });
      // 2026-08-22: Drop the effective-user cache before returning to the authenticated administrator.
      clearCurrentUser();
      window.location.assign("/dashboard");
    } catch (requestError) {
      setImpersonationError(
        requestError instanceof Error
          ? requestError.message
          : "원래 관리자 계정으로 돌아가지 못했습니다.",
      );
      setImpersonationEnding(false);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-top">
          <button
            className="logo-button"
            type="button"
            onClick={() => navigate("/")}
            aria-label="UCMS 홈"
          >
            {/* 2026-08-21: Carry the bakery-club logo palette into the persistent application brand. */}
            <img className="logo-image" src="/images/ucms-logo.png" alt="" />
            <span className="logo-text">UCMS</span>
          </button>

          <div className="user-area">
            {currentUser ? (
              <button
                className="user-button"
                type="button"
                onClick={() => navigate("/mypage")}
              >
                <span>{currentUser.name}</span>
              </button>
            ) : (
              <button
                className="user-button login-button"
                type="button"
                onClick={() => navigate("/login")}
              >
                <span>로그인</span>
              </button>
            )}
            <button
              className="menu-toggle"
              type="button"
              onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
              aria-label="전체 메뉴"
            >
              ≡
            </button>
          </div>
        </div>

        <nav className="main-nav desktop-nav" aria-label="주요 메뉴">
          {navStandaloneRoutes.map((route) => (
            <button
              className="nav-direct-button"
              key={route.id}
              type="button"
              onClick={() => navigate(route.path)}
            >
              {route.title}
            </button>
          ))}
          {navGroups.map((group) => (
            <div
              className="nav-group"
              key={group.title}
              onMouseEnter={() => openNavGroup(group.title)}
              onMouseLeave={scheduleCloseNavGroup}
            >
              <button
                className="nav-group-trigger"
                type="button"
                onClick={() =>
                  setOpenGroup((currentGroup) =>
                    currentGroup === group.title ? null : group.title,
                  )
                }
              >
                {group.title}
              </button>
              <div
                className={[
                  "nav-dropdown",
                  openGroup === group.title ? "open" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onMouseEnter={() => openNavGroup(group.title)}
                onMouseLeave={scheduleCloseNavGroup}
              >
                {group.routes.map((route) => (
                  <button
                    key={route.id}
                    type="button"
                    onClick={() => {
                      navigate(route.path);
                      setOpenGroup(null);
                    }}
                  >
                    {route.title}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {currentUser && currentUser.authority >= 4 ? (
            <button
              className="admin-nav-button"
              type="button"
              onClick={() => navigate("/admin")}
            >
              관리자
            </button>
          ) : null}
        </nav>

        <nav
          className={["mobile-menu", isMobileMenuOpen ? "open" : ""]
            .filter(Boolean)
            .join(" ")}
          aria-label="모바일 전체 메뉴"
        >
          {navStandaloneRoutes.length > 0 ? (
            <section>
              {navStandaloneRoutes.map((route) => (
                <button
                  key={route.id}
                  type="button"
                  onClick={() => {
                    navigate(route.path);
                    setIsMobileMenuOpen(false);
                  }}
                >
                  {route.title}
                </button>
              ))}
            </section>
          ) : null}
          {navGroups.map((group) => (
            <section key={group.title}>
              <h2>{group.title}</h2>
              {group.routes.map((route) => (
                <button
                  key={route.id}
                  type="button"
                  onClick={() => {
                    navigate(route.path);
                    setIsMobileMenuOpen(false);
                  }}
                >
                  {route.title}
                </button>
              ))}
            </section>
          ))}
          {currentUser && currentUser.authority >= 4 ? (
            <section>
              <h2>관리자</h2>
              <button
                type="button"
                onClick={() => {
                  navigate("/admin");
                  setIsMobileMenuOpen(false);
                }}
              >
                관리자 페이지
              </button>
            </section>
          ) : null}
        </nav>
      </header>

      {currentUser?.impersonation ? (
        <aside className="impersonation-banner" role="status">
          <div>
            <strong>{currentUser.impersonation.targetName} 화면으로 확인 중</strong>
            <span>
              시작 관리자: {currentUser.impersonation.actorName}
              {currentUser.impersonation.readOnly
                ? " · 사람 계정은 조회 전용"
                : " · 시스템 테스트 계정"}
            </span>
            {impersonationError ? (
              <span className="impersonation-error">{impersonationError}</span>
            ) : null}
          </div>
          <button
            type="button"
            disabled={impersonationEnding}
            onClick={endImpersonation}
          >
            {impersonationEnding ? "복귀 중" : "관리자 계정으로 복귀"}
          </button>
        </aside>
      ) : null}

      <main className="app-main">
        <ApiIssueBanner
          error={currentUserError}
          label="사용자 정보"
          message="사용자 정보를 확인하지 못했습니다. 잠시 후 새로고침해주세요."
        />
        {children}
      </main>
    </div>
  );
}
