export function LoginPage() {
  // 2026-07-16: React login page keeps the legacy Kakao OAuth entry point instead of embedding demo auth state.
  return (
    <section className="login-page" aria-labelledby="login-title">
      <div className="login-panel">
        <h1 id="login-title">UCMS 로그인</h1>
        <p>카카오 계정으로 로그인합니다.</p>
        <a className="kakao-login-button" href="/auth/authorize">
          <img
            src="https://k.kakaocdn.net/14/dn/btqCn0WEmI3/nijroPfbpCa4at5EIsjyf0/o.jpg"
            alt="카카오 로그인"
          />
        </a>
      </div>
    </section>
  );
}
