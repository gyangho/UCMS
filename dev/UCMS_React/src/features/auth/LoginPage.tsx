import { type FormEvent, useState } from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";

type AuthMode = "login" | "register";
type AuthStep = "credentials" | "verify";

const EMPTY_FORM = {
  email: "",
  password: "",
  passwordConfirm: "",
  name: "",
  phone: "",
  code: "",
  trustDevice: false,
};

// 2026-08-22: UCMS-native email/password authentication replaces the retired Kakao entry point.
export function LoginPage({ initialMode = "login" }: { initialMode?: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [step, setStep] = useState<AuthStep>("credentials");
  const [form, setForm] = useState(EMPTY_FORM);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setStep("credentials");
    setMessage(null);
    setError(null);
    setForm(EMPTY_FORM);
    navigate(nextMode === "login" ? "/login" : "/register");
  }

  async function submitCredentials(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (mode === "register" && form.password !== form.passwordConfirm) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "register") {
        const result = await requestData<{
          authenticated: boolean;
          emailVerificationRequired: boolean;
        }>("/api/auth/register/start", {
          method: "POST",
          body: JSON.stringify({
            email: form.email,
            password: form.password,
            name: form.name,
            phone: form.phone,
          }),
        });
        // 2026-08-22: Dev registration can finish immediately while production still enters verification.
        if (result.authenticated) {
          window.location.assign("/dashboard");
        } else {
          setStep("verify");
          setMessage("회원가입 인증번호를 이메일로 보냈습니다.");
        }
      } else {
        const result = await requestData<{
          authenticated: boolean;
          twoFactorRequired: boolean;
        }>("/api/auth/login/start", {
          method: "POST",
          body: JSON.stringify({ email: form.email, password: form.password }),
        });
        if (result.authenticated) {
          window.location.assign("/dashboard");
        } else {
          setStep("verify");
          setMessage("로그인 인증번호를 이메일로 보냈습니다.");
        }
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "인증 요청을 처리하지 못했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyEmail(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await requestData("/api/auth/email/verify", {
        method: "POST",
        body: JSON.stringify({
          code: form.code,
          trustDevice: mode === "login" && form.trustDevice,
        }),
      });
      window.location.assign("/dashboard");
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "인증번호를 확인하지 못했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function resendEmailCode() {
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      // 2026-08-23: Reuse the rate-limited start endpoints so resends replace the active session challenge.
      if (mode === "register") {
        await requestData("/api/auth/register/start", {
          method: "POST",
          body: JSON.stringify({
            email: form.email,
            password: form.password,
            name: form.name,
            phone: form.phone,
          }),
        });
      } else {
        await requestData("/api/auth/login/start", {
          method: "POST",
          body: JSON.stringify({ email: form.email, password: form.password }),
        });
      }
      setMessage("새 인증번호를 이메일로 보냈습니다. 5분 안에 입력해 주세요.");
    } catch (resendError) {
      setError(
        resendError instanceof Error
          ? resendError.message
          : "인증번호를 다시 보내지 못했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="login-page" aria-labelledby="login-title">
      <div className="login-panel email-auth-panel">
        <div className="auth-mode-tabs" role="tablist" aria-label="인증 방식">
          <button
            aria-selected={mode === "login"}
            className={mode === "login" ? "active" : ""}
            role="tab"
            type="button"
            onClick={() => changeMode("login")}
          >
            로그인
          </button>
          <button
            aria-selected={mode === "register"}
            className={mode === "register" ? "active" : ""}
            role="tab"
            type="button"
            onClick={() => changeMode("register")}
          >
            회원가입
          </button>
        </div>
        <h1 id="login-title">{mode === "login" ? "UCMS 로그인" : "UCMS 회원가입"}</h1>
        <p>
          {step === "verify"
            ? "이메일로 받은 6자리 인증번호를 5분 안에 입력하세요."
            : mode === "login"
              ? "이메일과 비밀번호로 로그인합니다."
              : "계정과 기본 사용자 정보를 입력합니다."}
        </p>
        {message ? <div className="page-state success">{message}</div> : null}
        {error ? <div className="page-state error">{error}</div> : null}

        {step === "credentials" ? (
          <form className="auth-form" onSubmit={submitCredentials}>
            <label>
              이메일
              <input
                autoComplete="email"
                required
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </label>
            <label>
              비밀번호
              <input
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={10}
                required
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
            </label>
            {mode === "login" ? (
              <button className="auth-text-link forgot-password-link" type="button" onClick={() => navigate("/forgot-password")}>
                비밀번호 찾기
              </button>
            ) : null}
            {mode === "register" ? (
              <>
                <label>
                  비밀번호 확인
                  <input
                    autoComplete="new-password"
                    minLength={10}
                    required
                    type="password"
                    value={form.passwordConfirm}
                    onChange={(event) => setForm({ ...form, passwordConfirm: event.target.value })}
                  />
                </label>
                {/* 2026-08-23: Student ID and major belong to member records, not account signup. */}
                <div className="form-grid auth-identity-grid">
                  <label>이름<input autoComplete="name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
                  <label>전화번호<input autoComplete="tel" inputMode="tel" required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
                </div>
              </>
            ) : null}
            <button disabled={submitting} type="submit">
              {submitting ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={verifyEmail}>
            <label>
              인증번호
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                pattern="[0-9]{6}"
                required
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value.replace(/\D/g, "") })}
              />
            </label>
            {mode === "login" ? (
              <label className="trusted-device-option">
                <input
                  type="checkbox"
                  checked={form.trustDevice}
                  onChange={(event) => setForm({ ...form, trustDevice: event.target.checked })}
                />
                이 기기에서는 30일 동안 이메일 인증하지 않기
              </label>
            ) : null}
            <button disabled={submitting} type="submit">{submitting ? "확인 중..." : "인증하고 계속"}</button>
            <button className="secondary-button" disabled={submitting} type="button" onClick={resendEmailCode}>인증번호 다시 받기</button>
            <button className="secondary-button" type="button" onClick={() => setStep("credentials")}>정보 다시 입력</button>
          </form>
        )}
      </div>
    </section>
  );
}
