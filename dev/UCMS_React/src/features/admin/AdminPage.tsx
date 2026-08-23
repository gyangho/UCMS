import { useEffect, useMemo, useState } from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";
import { clearCurrentUser, useCurrentUser } from "../../shared/api/user";

interface GoogleOAuthStatus {
  connected: boolean;
  reason: string | null;
}

interface ReauthenticationUser {
  id: number;
  name: string;
  studentId: string | null;
  authority: string;
  status: "pending_email" | "pending_relink" | "active" | "disabled";
  email: string | null;
  phoneNumber: string | null;
  passwordConfigured: boolean;
  trustedDeviceCount: number;
  memberLinked: boolean;
  isCurrentUser: boolean;
  canForceReauthentication: boolean;
  accountType: "human" | "system";
  systemKey: string | null;
}

interface ImpersonationTarget {
  id: number;
  name: string;
  studentId: string | null;
  authority: string;
  status: "pending_email" | "pending_relink" | "active";
  accountType: "human" | "system";
  systemKey: string | null;
  readOnly: boolean;
}

type AdminTool = "home" | "holidays" | "google" | "users" | "reauthentication" | "impersonation";

interface UserEditDraft {
  id: number;
  name: string;
  email: string;
  phoneNumber: string;
  status: ReauthenticationUser["status"];
}

// 2026-08-22: The admin landing page is a tool directory; each operation has a focused route.
export function AdminPage({ path = window.location.pathname }: { path?: string }) {
  const tool = adminToolFromPath(path);
  const { user: currentUser } = useCurrentUser();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [googleOAuth, setGoogleOAuth] = useState<GoogleOAuthStatus | null>(null);
  const [googleOAuthStarting, setGoogleOAuthStarting] = useState(false);
  const [users, setUsers] = useState<ReauthenticationUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [forcingUserId, setForcingUserId] = useState<number | null>(null);
  const [editingUser, setEditingUser] = useState<UserEditDraft | null>(null);
  const [managingUserId, setManagingUserId] = useState<number | null>(null);
  const [impersonationTargets, setImpersonationTargets] = useState<ImpersonationTarget[]>([]);
  const [impersonationTargetsLoading, setImpersonationTargetsLoading] = useState(false);
  const [impersonatingUserId, setImpersonatingUserId] = useState<number | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [userAuthority, setUserAuthority] = useState("all");
  const [userStatus, setUserStatus] = useState("all");
  const [targetQuery, setTargetQuery] = useState("");
  const [targetAuthority, setTargetAuthority] = useState("all");
  const [targetType, setTargetType] = useState("all");

  useEffect(() => {
    const googleResult = new URLSearchParams(window.location.search).get("google");
    if (googleResult === "connected") setMessage("Google 계정을 다시 연결했습니다.");
    if (googleResult === "invalid") setError("Google 인증 요청이 만료되었거나 일치하지 않습니다. 다시 연결해 주세요.");
    if (googleResult === "failed") setError("Google 계정 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    if (googleResult) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    let ignore = false;
    if (tool === "google") {
      requestData<GoogleOAuthStatus>("/api/drive/oauth/status")
        .then((status) => !ignore && setGoogleOAuth(status))
        .catch((loadError) => !ignore && setError(errorMessage(loadError, "Google 계정 연결 상태를 확인하지 못했습니다.")));
    }
    if (tool === "reauthentication" || tool === "users") {
      setUsersLoading(true);
      requestData<{ users: ReauthenticationUser[] }>("/api/admin/users")
        .then((data) => !ignore && setUsers(data.users ?? []))
        .catch((loadError) => !ignore && setError(errorMessage(loadError, "사용자 목록을 불러오지 못했습니다.")))
        .finally(() => !ignore && setUsersLoading(false));
    }
    return () => {
      ignore = true;
    };
  }, [tool]);

  useEffect(() => {
    if (tool !== "impersonation" || currentUser?.authority !== 6 || currentUser.impersonation) {
      setImpersonationTargets([]);
      return;
    }
    let ignore = false;
    setImpersonationTargetsLoading(true);
    requestData<{ targets: ImpersonationTarget[] }>("/api/admin/impersonation/targets")
      .then((data) => !ignore && setImpersonationTargets(data.targets ?? []))
      .catch((loadError) => !ignore && setError(errorMessage(loadError, "화면 전환 대상을 불러오지 못했습니다.")))
      .finally(() => !ignore && setImpersonationTargetsLoading(false));
    return () => {
      ignore = true;
    };
  }, [currentUser?.authority, currentUser?.impersonation, tool]);

  const filteredUsers = useMemo(() => {
    const query = userQuery.trim().toLowerCase();
    return users.filter((user) =>
      (!query || [user.name, user.studentId, user.email, user.phoneNumber].some((value) => String(value || "").toLowerCase().includes(query))) &&
      (userAuthority === "all" || user.authority === userAuthority) &&
      (userStatus === "all" || user.status === userStatus),
    );
  }, [userAuthority, userQuery, userStatus, users]);

  const filteredTargets = useMemo(() => {
    const query = targetQuery.trim().toLowerCase();
    return impersonationTargets.filter((target) =>
      (!query || [target.name, target.studentId].some((value) => String(value || "").toLowerCase().includes(query))) &&
      (targetAuthority === "all" || target.authority === targetAuthority) &&
      (targetType === "all" || target.accountType === targetType),
    );
  }, [impersonationTargets, targetAuthority, targetQuery, targetType]);

  async function importHolidays() {
    setError(null);
    setMessage(null);
    try {
      const data = await requestData<{ importedCount: number }>("/api/admin/holidays/import", { method: "POST" });
      setMessage(`${data.importedCount}건의 공휴일을 반영했습니다.`);
    } catch (importError) {
      setError(errorMessage(importError, "공휴일을 불러오지 못했습니다."));
    }
  }

  async function startGoogleOAuth() {
    setError(null);
    setMessage(null);
    setGoogleOAuthStarting(true);
    try {
      const result = await requestData<{ authorizationUrl: string }>("/api/drive/oauth/start", { method: "POST" });
      window.location.assign(result.authorizationUrl);
    } catch (startError) {
      setError(errorMessage(startError, "Google 인증 요청을 시작하지 못했습니다."));
      setGoogleOAuthStarting(false);
    }
  }

  async function forceReauthentication(user: ReauthenticationUser) {
    // 2026-08-22: Session revocation remains meaningful while dev email verification is disabled.
    if (!window.confirm(`${user.name} 사용자의 로그인 세션과 신뢰 기기를 모두 해제할까요? 다음 요청부터 다시 로그인해야 합니다.`)) return;
    setError(null);
    setMessage(null);
    setForcingUserId(user.id);
    try {
      const result = await requestData<{ userId: number; clearedSessionCount: number; revokedTrustedDeviceCount: number }>(
        `/api/admin/users/${user.id}/force-reauthentication`,
        { method: "POST" },
      );
      setUsers((current) => current.map((item) => item.id === result.userId ? { ...item, trustedDeviceCount: 0 } : item));
      setMessage(`${user.name} 사용자의 세션 ${result.clearedSessionCount}개와 신뢰 기기 ${result.revokedTrustedDeviceCount}개를 해제했습니다.`);
    } catch (forceError) {
      setError(errorMessage(forceError, "사용자 재인증을 설정하지 못했습니다."));
    } finally {
      setForcingUserId(null);
    }
  }

  async function impersonate(target: ImpersonationTarget) {
    const reason = window.prompt(
      `${target.name} 화면으로 전환하는 이유를 입력하세요.${target.readOnly ? " 사람 계정은 조회만 가능합니다." : ""}`,
      target.systemKey === "ui-test-admin" ? "Playwright UI 자동화" : "권한별 화면 확인",
    );
    if (!reason) return;
    setError(null);
    setMessage(null);
    setImpersonatingUserId(target.id);
    try {
      await requestData("/api/admin/impersonation/start", {
        method: "POST",
        body: JSON.stringify({ targetUserId: target.id, reason }),
      });
      clearCurrentUser();
      window.location.assign("/dashboard");
    } catch (impersonationError) {
      setError(errorMessage(impersonationError, "사용자 화면으로 전환하지 못했습니다."));
      setImpersonatingUserId(null);
    }
  }

  async function saveUser() {
    if (!editingUser) return;
    setError(null);
    setMessage(null);
    setManagingUserId(editingUser.id);
    try {
      const result = await requestData<{ userId: number; emailChanged: boolean }>(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editingUser.name,
          accountEmail: editingUser.email,
          phoneNumber: editingUser.phoneNumber,
          status: editingUser.status,
        }),
      });
      setUsers((current) => current.map((user) => user.id === result.userId ? {
        ...user,
        name: editingUser.name,
        email: editingUser.email || null,
        phoneNumber: editingUser.phoneNumber || null,
        status: result.emailChanged ? "pending_relink" : editingUser.status,
        passwordConfigured: result.emailChanged ? false : user.passwordConfigured,
        trustedDeviceCount: result.emailChanged || editingUser.status === "disabled" ? 0 : user.trustedDeviceCount,
      } : user));
      setEditingUser(null);
      setMessage(result.emailChanged ? "이메일을 변경해 해당 사용자가 새 이메일로 다시 가입하도록 설정했습니다." : "사용자 정보를 수정했습니다.");
    } catch (saveError) {
      setError(errorMessage(saveError, "사용자 정보를 수정하지 못했습니다."));
    } finally {
      setManagingUserId(null);
    }
  }

  async function removeUser(user: ReauthenticationUser) {
    if (!window.confirm(`${user.name} 계정을 완전히 삭제할까요? 회원 연결이나 작성 데이터가 있으면 서버에서 삭제를 거부합니다.`)) return;
    setError(null);
    setMessage(null);
    setManagingUserId(user.id);
    try {
      await requestData(`/api/admin/users/${user.id}`, { method: "DELETE" });
      setUsers((current) => current.filter((item) => item.id !== user.id));
      if (editingUser?.id === user.id) setEditingUser(null);
      setMessage(`${user.name} 계정을 삭제했습니다.`);
    } catch (deleteError) {
      setError(errorMessage(deleteError, "사용자를 삭제하지 못했습니다."));
    } finally {
      setManagingUserId(null);
    }
  }

  if (tool === "home") return <AdminHub canManageUsers={currentUser?.authority === 6 && !currentUser.impersonation} />;

  return (
    <section className="stack-page">
      <div className="page-heading">
        <div><span className="eyebrow">관리자 도구</span><h1>{adminToolTitle(tool)}</h1></div>
        <button className="secondary-button" type="button" onClick={() => navigate("/admin")}>도구 목록</button>
      </div>
      {message ? <div className="page-state success">{message}</div> : null}
      {error ? <div className="page-state error">{error}</div> : null}

      {tool === "holidays" ? (
        <section className="data-card"><div><h2>공휴일 불러오기</h2><span className="status-pill">API 연동</span></div><p>공휴일 데이터를 일정에 반영합니다.</p><div className="card-actions"><button type="button" onClick={importHolidays}>공휴일 불러오기</button></div></section>
      ) : null}

      {tool === "google" ? (
        // 2026-08-22: The same personal Google OAuth connection now covers Forms and verification mail.
        <section className="data-card"><div><h2>Google 계정 연결</h2><span className={`status-pill ${googleOAuth?.connected ? "completed" : ""}`}>{googleOAuth ? googleOAuth.connected ? "연결됨" : "재연결 필요" : "확인 중"}</span></div><p>{googleOAuth?.connected ? "Google Form 생성 계정이 정상적으로 연결되어 있습니다." : "Google Drive와 Forms 권한을 다시 승인해 주세요."}</p>{googleOAuth && !googleOAuth.connected ? <div className="card-actions"><button disabled={googleOAuthStarting} type="button" onClick={startGoogleOAuth}>{googleOAuthStarting ? "Google로 이동 중..." : "Google 계정 다시 연결"}</button></div> : null}</section>
      ) : null}

      {tool === "impersonation" ? (
        <section className="data-card"><div><h2>사용자 화면으로 전환</h2><span className="status-pill">감사 로그 적용</span></div><p>시스템 테스트 관리자는 변경할 수 있고, 사람 계정은 조회 전용으로 전환됩니다.</p><FilterPanel query={targetQuery} onQuery={setTargetQuery} selects={[{ value: targetAuthority, onChange: setTargetAuthority, label: "권한", options: uniqueValues(impersonationTargets.map((target) => target.authority)) }, { value: targetType, onChange: setTargetType, label: "계정 유형", options: ["human", "system"] }]} />{impersonationTargetsLoading ? <div className="page-state">전환 가능한 사용자를 불러오는 중입니다.</div> : <TargetTable targets={filteredTargets} activeId={impersonatingUserId} onSelect={impersonate} />}</section>
      ) : null}

      {tool === "reauthentication" ? (
        <section className="data-card"><div><h2>사용자 재인증 관리</h2><span className="status-pill">세션 재인증</span></div><p>선택한 사용자의 세션과 신뢰 기기를 폐기해 다음 요청부터 다시 로그인하도록 합니다.</p><FilterPanel query={userQuery} onQuery={setUserQuery} selects={[{ value: userAuthority, onChange: setUserAuthority, label: "권한", options: uniqueValues(users.map((user) => user.authority)) }, { value: userStatus, onChange: setUserStatus, label: "상태", options: uniqueValues(users.map((user) => user.status)) }]} />{usersLoading ? <div className="page-state">사용자 목록을 불러오는 중입니다.</div> : <ReauthenticationTable users={filteredUsers} activeId={forcingUserId} onForce={forceReauthentication} />}</section>
      ) : null}

      {tool === "users" ? (
        <section className="data-card">
          <div><h2>사용자 계정 관리</h2><span className="status-pill">admin 전용</span></div>
          <p>사용자 기본정보를 수정하거나, 회원 연결과 작성 데이터가 없는 잘못 생성된 일반 계정을 삭제합니다.</p>
          <FilterPanel query={userQuery} onQuery={setUserQuery} selects={[{ value: userAuthority, onChange: setUserAuthority, label: "권한", options: uniqueValues(users.map((user) => user.authority)) }, { value: userStatus, onChange: setUserStatus, label: "상태", options: uniqueValues(users.map((user) => user.status)) }]} />
          {editingUser ? <UserEditForm draft={editingUser} busy={managingUserId === editingUser.id} onChange={setEditingUser} onCancel={() => setEditingUser(null)} onSave={saveUser} /> : null}
          {usersLoading ? <div className="page-state">사용자 목록을 불러오는 중입니다.</div> : <UserManagementTable users={filteredUsers} activeId={managingUserId} onEdit={(user) => setEditingUser({ id: user.id, name: user.name, email: user.email ?? "", phoneNumber: user.phoneNumber ?? "", status: user.status })} onDelete={removeUser} />}
        </section>
      ) : null}
    </section>
  );
}

function AdminHub({ canManageUsers }: { canManageUsers: boolean }) {
  const tools = [
    ["공휴일 불러오기", "일정에 공휴일 데이터를 반영합니다.", "/admin/holidays"],
    ["Google 계정 연결", "Google Form 생성 계정을 관리합니다.", "/admin/google"],
    ["사용자 재인증 강제하기", "로그인 세션과 신뢰 기기를 해제합니다.", "/admin/reauthentication"],
    ...(canManageUsers ? [["사용자 계정 관리", "잘못 생성된 계정을 수정하거나 안전하게 삭제합니다.", "/admin/users"], ["사용자 화면으로 전환", "권한별 화면을 감사 로그와 함께 확인합니다.", "/admin/impersonation"]] : []),
  ];
  return <section className="stack-page"><div className="page-heading"><div><span className="eyebrow">관리자</span><h1>관리 기능</h1></div></div><div className="admin-tool-list">{tools.map(([title, description, href]) => <button className="admin-tool-row" key={href} type="button" onClick={() => navigate(href)}><span><strong>{title}</strong><small>{description}</small></span><b aria-hidden="true">›</b></button>)}</div></section>;
}

function FilterPanel({ query, onQuery, selects }: { query: string; onQuery: (value: string) => void; selects: Array<{ value: string; onChange: (value: string) => void; label: string; options: string[] }> }) {
  return <div className="admin-filter-grid"><label>검색<input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="이름, 학번, 이메일" /></label>{selects.map((select) => <label key={select.label}>{select.label}<select value={select.value} onChange={(event) => select.onChange(event.target.value)}><option value="all">전체</option>{select.options.map((option) => <option key={option} value={option}>{displayAccountType(option)}</option>)}</select></label>)}</div>;
}

function TargetTable({ targets, activeId, onSelect }: { targets: ImpersonationTarget[]; activeId: number | null; onSelect: (target: ImpersonationTarget) => void }) {
  if (!targets.length) return <div className="page-state">조건에 맞는 사용자가 없습니다.</div>;
  return <div className="table-wrap"><table className="data-table admin-user-table"><thead><tr><th>계정</th><th>학번</th><th>권한</th><th>모드</th><th>작업</th></tr></thead><tbody>{targets.map((target) => <tr key={target.id}><td>{target.name}{target.systemKey === "ui-test-admin" ? <span className="status-pill completed">테스트 계정</span> : null}</td><td>{target.studentId ?? "시스템/일반 계정"}</td><td>{target.authority}</td><td>{target.readOnly ? "조회 전용" : "테스트 변경 허용"}</td><td><button disabled={activeId === target.id} type="button" onClick={() => onSelect(target)}>{activeId === target.id ? "전환 중" : "화면 전환"}</button></td></tr>)}</tbody></table></div>;
}

function ReauthenticationTable({ users, activeId, onForce }: { users: ReauthenticationUser[]; activeId: number | null; onForce: (user: ReauthenticationUser) => void }) {
  if (!users.length) return <div className="page-state">조건에 맞는 사용자가 없습니다.</div>;
  return <div className="table-wrap"><table className="data-table admin-user-table"><thead><tr><th>이름</th><th>계정</th><th>권한</th><th>신뢰 기기</th><th>작업</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.email ?? user.studentId ?? "로그인 미설정"}</td><td>{user.authority}</td><td>{user.accountType === "system" ? "시스템 계정" : `${user.trustedDeviceCount}대`}</td><td><button className="danger-button" disabled={!user.canForceReauthentication || activeId === user.id} type="button" onClick={() => onForce(user)}>{user.isCurrentUser ? "현재 계정" : activeId === user.id ? "처리 중" : "재인증 강제"}</button></td></tr>)}</tbody></table></div>;
}

function UserEditForm({ draft, busy, onChange, onCancel, onSave }: { draft: UserEditDraft; busy: boolean; onChange: (draft: UserEditDraft) => void; onCancel: () => void; onSave: () => void }) {
  // 2026-08-23: Keep destructive account maintenance explicit and separate from member authority editing.
  return <div className="admin-user-editor"><div className="admin-filter-grid"><label>이름<input value={draft.name} maxLength={50} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></label><label>이메일<input type="email" value={draft.email} onChange={(event) => onChange({ ...draft, email: event.target.value })} /></label><label>전화번호<input value={draft.phoneNumber} onChange={(event) => onChange({ ...draft, phoneNumber: event.target.value })} /></label><label>상태<select value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value as UserEditDraft["status"] })}><option value="pending_email">이메일 인증 대기</option><option value="pending_relink">재가입 대기</option><option value="active">활성</option><option value="disabled">비활성</option></select></label></div><p className="muted-copy">이메일을 바꾸면 기존 비밀번호와 로그인 세션이 폐기되고 새 이메일로 다시 가입해야 합니다.</p><div className="card-actions"><button type="button" disabled={busy || !draft.name.trim()} onClick={onSave}>{busy ? "저장 중" : "저장"}</button><button className="secondary-button" type="button" disabled={busy} onClick={onCancel}>취소</button></div></div>;
}

function UserManagementTable({ users, activeId, onEdit, onDelete }: { users: ReauthenticationUser[]; activeId: number | null; onEdit: (user: ReauthenticationUser) => void; onDelete: (user: ReauthenticationUser) => void }) {
  if (!users.length) return <div className="page-state">조건에 맞는 사용자가 없습니다.</div>;
  return <div className="table-wrap user-management-table"><table className="data-table admin-user-table"><thead><tr><th>이름</th><th>이메일</th><th>전화번호</th><th>연결</th><th>상태</th><th>작업</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td data-label="이름">{user.name}</td><td data-label="이메일">{user.email ?? "미설정"}</td><td data-label="전화번호">{user.phoneNumber ?? "미설정"}</td><td data-label="연결">{user.memberLinked ? `회원 ${user.studentId ?? "연결"}` : "일반 계정"}</td><td data-label="상태">{displayAccountType(user.status)}</td><td data-label="작업"><div className="table-actions"><button type="button" disabled={user.isCurrentUser || user.accountType === "system" || activeId === user.id} onClick={() => onEdit(user)}>수정</button><button className="danger-button" type="button" disabled={user.isCurrentUser || user.accountType === "system" || user.memberLinked || activeId === user.id} onClick={() => onDelete(user)}>삭제</button></div></td></tr>)}</tbody></table></div>;
}

function adminToolFromPath(path: string): AdminTool {
  if (path.endsWith("/holidays")) return "holidays";
  if (path.endsWith("/google")) return "google";
  if (path.endsWith("/users")) return "users";
  if (path.endsWith("/reauthentication")) return "reauthentication";
  if (path.endsWith("/impersonation")) return "impersonation";
  return "home";
}

function adminToolTitle(tool: AdminTool) {
  return { home: "관리 기능", holidays: "공휴일 불러오기", google: "Google 계정 연결", users: "사용자 계정 관리", reauthentication: "사용자 재인증 강제하기", impersonation: "사용자 화면으로 전환" }[tool];
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function displayAccountType(value: string) {
  if (value === "human") return "사용자 계정";
  if (value === "system") return "시스템 계정";
  if (value === "pending_email") return "이메일 인증 대기";
  if (value === "pending_relink") return "전환 대기";
  if (value === "active") return "활성";
  if (value === "disabled") return "비활성";
  return value;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
