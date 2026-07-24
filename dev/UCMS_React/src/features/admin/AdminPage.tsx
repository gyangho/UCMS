import { useEffect, useState } from "react";
import { requestData } from "../../shared/api/http";

interface GoogleOAuthStatus {
  connected: boolean;
  reason: string | null;
  authorizationUrl: string | null;
}

export function AdminPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [googleOAuth, setGoogleOAuth] = useState<GoogleOAuthStatus | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadGoogleOAuthStatus() {
      try {
        const status = await requestData<GoogleOAuthStatus>(
          "/api/drive/oauth/status",
        );
        if (!ignore) {
          setGoogleOAuth(status);
        }
      } catch (statusError) {
        if (!ignore) {
          setError(
            statusError instanceof Error
              ? statusError.message
              : "Google 계정 연결 상태를 확인하지 못했습니다.",
          );
        }
      }
    }

    // 2026-07-23: Google OAuth 재연결 기능은 관리자 화면에서만 노출합니다.
    loadGoogleOAuthStatus();
    return () => {
      ignore = true;
    };
  }, []);

  // 2026-07-16: Holiday import now calls the contract API so admin actions are checked against the Node backend.
  async function importHolidays() {
    setError(null);
    setMessage(null);
    try {
      const data = await requestData<{ imported: number }>("/api/admin/holidays/import", {
        method: "POST"
      });
      setMessage(`${data.imported}건의 공휴일을 반영했습니다.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "공휴일을 불러오지 못했습니다.");
    }
  }

  return (
    <section className="stack-page narrow">
      <div className="page-heading">
        <div>
          <h1>관리자 페이지</h1>
        </div>
      </div>

      {message ? <div className="page-state success">{message}</div> : null}
      {error ? <div className="page-state error">{error}</div> : null}

      <section className="data-card">
        <div>
          <h2>공휴일 불러오기</h2>
          <span className="status-pill">API 연동</span>
        </div>
        <p>공휴일 데이터를 일정에 반영합니다.</p>
        <div className="card-actions">
          <button type="button" onClick={importHolidays}>
            공휴일 불러오기
          </button>
        </div>
      </section>

      <section className="data-card">
        <div>
          <h2>Google 계정 연결</h2>
          <span
            className={`status-pill ${
              googleOAuth?.connected ? "completed" : ""
            }`}
          >
            {googleOAuth
              ? googleOAuth.connected
                ? "연결됨"
                : "재연결 필요"
              : "확인 중"}
          </span>
        </div>
        <p>
          {googleOAuth?.connected
            ? "Google Form 생성에 사용하는 계정이 정상적으로 연결되어 있습니다."
            : "Google Form 생성용 계정 연결이 만료된 경우 다시 승인할 수 있습니다."}
        </p>
        {!googleOAuth?.connected && googleOAuth?.authorizationUrl ? (
          <div className="card-actions">
            <button
              type="button"
              onClick={() =>
                window.location.assign(googleOAuth.authorizationUrl!)
              }
            >
              Google 계정 다시 연결
            </button>
          </div>
        ) : null}
      </section>
    </section>
  );
}
