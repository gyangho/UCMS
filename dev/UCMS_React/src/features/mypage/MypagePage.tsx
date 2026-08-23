import { type FormEvent, useState } from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";
import { BusyLabel } from "../../shared/ui/BusyLabel";
import {
  logoutCurrentUser,
  useCurrentUser,
  withdrawCurrentUser
} from "../../shared/api/user";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";

export function MypagePage() {
  // 2026-07-16: Mypage now renders the authenticated /api/user/me profile and removes demo account fields.
  const { user: currentUser, isLoading, error } = useCurrentUser();
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  async function submitPasswordChange(event: FormEvent) {
    event.preventDefault();
    setPasswordMessage(null);
    setPasswordError(null);
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setChangingPassword(true);
    try {
      const result = await requestData<{ message: string }>("/api/auth/password/change", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      setPasswordMessage(result.message);
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      window.setTimeout(() => window.location.assign("/login"), 1500);
    } catch (changeError) {
      setPasswordError(changeError instanceof Error ? changeError.message : "비밀번호를 변경하지 못했습니다.");
      setChangingPassword(false);
    }
  }

  async function logout() {
    await logoutCurrentUser();
    navigate("/");
  }

  async function withdraw() {
    await withdrawCurrentUser("사용자 요청");
    navigate("/");
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (error || !currentUser) {
    return <ErrorState message="사용자 정보를 불러오지 못했습니다." />;
  }

  return (
    <section className="stack-page narrow">
      <div className="page-heading">
        <div>
          <h1>마이페이지</h1>
        </div>
      </div>

      <section className="profile-card">
        <div className="profile-avatar" aria-hidden="true">
          {currentUser.name.slice(0, 1)}
        </div>
        <div>
          <h2>{currentUser.name}</h2>
          <p>{currentUser.role ?? "-"}</p>
          <dl className="profile-details">
            <div>
              <dt>학번</dt>
              <dd>{currentUser.studentId ?? "-"}</dd>
            </div>
            <div>
              <dt>소속</dt>
              <dd>{currentUser.department ?? "-"}</dd>
            </div>
            <div>
              <dt>전공</dt>
              <dd>{currentUser.major ?? "-"}</dd>
            </div>
            <div>
              <dt>이메일</dt>
              <dd>{currentUser.email ?? "-"}</dd>
            </div>
            <div>
              <dt>연락처</dt>
              <dd>{currentUser.phone ?? "-"}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="settings-panel password-settings-panel">
        <div>
          <h2>비밀번호 변경</h2>
          <p>변경 후 모든 기기에서 로그아웃되며 새 비밀번호로 다시 로그인해야 합니다.</p>
        </div>
        {passwordMessage ? <div className="page-state success">{passwordMessage}</div> : null}
        {passwordError ? <div className="page-state error">{passwordError}</div> : null}
        <form className="auth-form" onSubmit={submitPasswordChange}>
          <label>현재 비밀번호<input autoComplete="current-password" required type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} /></label>
          <label>새 비밀번호<input autoComplete="new-password" minLength={10} maxLength={128} required type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} /></label>
          <label>새 비밀번호 확인<input autoComplete="new-password" minLength={10} maxLength={128} required type="password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} /></label>
          <button disabled={changingPassword} type="submit">{changingPassword ? <BusyLabel text="변경 중..." /> : "비밀번호 변경"}</button>
        </form>
      </section>

      <section className="settings-panel">
        <button type="button" onClick={logout}>
          로그아웃
        </button>
        <button className="danger-button" type="button" onClick={withdraw}>
          탈퇴하기
        </button>
      </section>
    </section>
  );
}
