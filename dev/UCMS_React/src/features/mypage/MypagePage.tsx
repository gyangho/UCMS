import { navigate } from "../../app/router";
import {
  logoutCurrentUser,
  useCurrentUser,
  withdrawCurrentUser
} from "../../shared/api/user";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";

export function MypagePage() {
  // 2026-07-16: Mypage now renders the authenticated /api/user/me profile and removes demo account fields.
  const { user: currentUser, isLoading, error } = useCurrentUser();

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
