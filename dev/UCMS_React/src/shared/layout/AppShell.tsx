import { type PropsWithChildren, useRef, useState } from "react";
import { navigate, navGroups, navStandaloneRoutes } from "../../app/router";
import { useCurrentUser } from "../api/user";
import { ApiIssueBanner } from "../ui/ApiIssueBanner";

export function AppShell({ children }: PropsWithChildren) {
  // 2026-07-16: Shell no longer blocks anonymous dashboard rendering; backend APIs still enforce page-level authority.
  const { user: currentUser, error: currentUserError } = useCurrentUser();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

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
