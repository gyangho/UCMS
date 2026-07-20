import { type PropsWithChildren } from "react";
import { navigate } from "../../app/router";
import { useCurrentUser } from "../api/user";
import { ApiIssueBanner } from "../ui/ApiIssueBanner";

export function PublicShell({ children }: PropsWithChildren) {
  // 2026-07-16: Public shell shows a login entry when /api/user/me has no authenticated session.
  const { user: currentUser, error: currentUserError } = useCurrentUser();

  return (
    <div className="app">
      <header className="app-header public">
        <button
          className="logo-button"
          type="button"
          onClick={() => navigate("/")}
          aria-label="UCMS 홈"
        >
          <span className="logo-text">UCMS</span>
        </button>

        <div className="user-area">
          <button type="button" onClick={() => navigate("/public/recruit-result")}>
            모집 결과 조회
          </button>
          <button type="button" onClick={() => navigate("/public/recruit-response")}>
            지원 응답 조회
          </button>
          <button
            className={currentUser ? "user-button" : "user-button login-button"}
            type="button"
            onClick={() => navigate(currentUser ? "/mypage" : "/login")}
          >
            {currentUser?.name ?? "로그인"}
          </button>
        </div>
      </header>

      <main className="app-main">
        <ApiIssueBanner error={currentUserError} label="/api/user/me" />
        {children}
      </main>
    </div>
  );
}
