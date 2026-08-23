import { type FormEvent, useState } from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";

// 2026-08-23: Keep password recovery anonymous and disclose no account existence information.
export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      const result = await requestData<{ message: string }>("/api/auth/password/temporary", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(result.message);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "임시 비밀번호를 요청하지 못했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="login-page" aria-labelledby="forgot-password-title">
      <div className="login-panel email-auth-panel password-reset-panel">
        <h1 id="forgot-password-title">비밀번호 찾기</h1>
        <p>가입할 때 사용한 이메일을 입력하면 임시 비밀번호를 보내드립니다.</p>
        {message ? <div className="page-state success">{message}</div> : null}
        {error ? <div className="page-state error">{error}</div> : null}
        <form className="auth-form" onSubmit={submit}>
          <label>
            이메일
            <input
              autoComplete="email"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button disabled={submitting} type="submit">
            {submitting ? "발송 중..." : "임시 비밀번호 받기"}
          </button>
          <button className="auth-text-link auth-back-link" type="button" onClick={() => navigate("/login")}>
            로그인으로 돌아가기
          </button>
        </form>
      </div>
    </section>
  );
}
