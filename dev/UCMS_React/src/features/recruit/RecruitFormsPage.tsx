import { type FormEvent, useCallback, useEffect, useState } from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";
import { BusyLabel } from "../../shared/ui/BusyLabel";

type RecruitStatus = "draft" | "recruiting" | "planning" | "interview" | "closed";
interface RecruitmentInstance { id: number; formId?: string | null; title: string; status: RecruitStatus; recruitStart?: string | null; recruitEnd?: string | null; interviewStart?: string | null; interviewEnd?: string | null; formUrl?: string | null; promotionCopy?: string | null; posterUrls: string[]; applicantCount: number; maleCount: number; femaleCount: number; firstPassRate: number; finalPassRate: number; interviewPlanId?: number | null; interviewPlanStatus?: string | null; }
interface RecruitResponseRow { id: number; applicantName: string; studentId?: string | null; gender?: string | null; rating?: string | null; formId: string; }
const STATUS_LABEL: Record<RecruitStatus, string> = { draft: "초안", recruiting: "모집", planning: "면접 계획", interview: "면접", closed: "종료" };
const MAX_POSTER_COUNT = 10;
const MAX_POSTER_BYTES = 8 * 1024 * 1024;
const MAX_POSTERS_TOTAL_BYTES = 10 * 1024 * 1024;

// 2026-08-20: Recruitment management starts with lifecycle cards instead of a global response table.
export function RecruitFormsPage() {
  const [instances, setInstances] = useState<RecruitmentInstance[]>([]);
  const [closedOpen, setClosedOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  useEffect(() => { requestData<{ instances: RecruitmentInstance[] }>("/api/recruit/instances").then((data) => setInstances(data.instances ?? [])).catch((e) => setError(e instanceof Error ? e.message : "모집 목록을 불러오지 못했습니다.")).finally(() => setLoading(false)); }, []);
  async function createDraft() {
    // 2026-08-23: Prevent duplicate draft creation and expose progress while the API responds.
    setIsCreating(true);
    setError(null);
    try {
      const data = await requestData<{ path: string }>("/api/recruit/instances", { method: "POST", body: JSON.stringify({ title: "새 모집" }) });
      navigate(data.path);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "모집 초안을 만들지 못했습니다.");
      setIsCreating(false);
    }
  }
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  const current = instances.filter((item) => item.status !== "closed");
  const closed = instances.filter((item) => item.status === "closed");
  return <section className="stack-page recruit-page">
    <div className="page-heading"><div><h1>모집 관리</h1><p>초안부터 최종 종료까지 모집 단위로 관리합니다.</p></div><button className="recruit-create-button" disabled={isCreating} type="button" onClick={createDraft}>{isCreating ? <BusyLabel text="생성 중..." /> : "모집 생성"}</button></div>
    {current.length ? <div className="data-grid">{current.map((item) => <RecruitCard key={item.id} item={item} />)}</div> : <EmptyState title="진행 중인 모집이 없습니다." />}
    <section className="recruit-closed-section"><button className="section-heading-row" type="button" onClick={() => setClosedOpen((v) => !v)} aria-expanded={closedOpen}><strong>종료된 모집</strong><span>{closedOpen ? "⌄" : ">"} {closed.length}개</span></button>{closedOpen ? <div className="data-grid">{closed.map((item) => <RecruitCard key={item.id} item={item} />)}</div> : null}</section>
  </section>;
}

function RecruitCard({ item }: { item: RecruitmentInstance }) {
  return <button className="data-card clickable-card" type="button" onClick={() => navigate(`/recruit/${item.id}`)}>{item.posterUrls[0] ? <img src={item.posterUrls[0]} alt={`${item.title} 포스터`} /> : null}<div><h2>{item.title}</h2><span className={`status-pill ${item.status}`}>{STATUS_LABEL[item.status]}</span></div><p>{formatPeriod(item.recruitStart, item.recruitEnd)}</p>{item.status !== "draft" ? <p>지원자 {item.applicantCount}명</p> : null}</button>;
}

export function RecruitInstanceDetailPage({ path }: { path: string }) {
  const id = Number(path.match(/\/recruit\/(\d+)/)?.[1]);
  const [item, setItem] = useState<RecruitmentInstance | null>(null);
  const [responses, setResponses] = useState<RecruitResponseRow[]>([]);
  const [form, setForm] = useState({ title: "", recruitStart: "", recruitEnd: "", interviewStart: "", interviewEnd: "", formUrl: "", promotionCopy: "" });
  const [posterFiles, setPosterFiles] = useState<File[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Array<{ id: number; title: string }>>([]);
  const [generator, setGenerator] = useState({ templateId: "", userEmail: "" });
  const load = useCallback(async () => { setLoading(true); try { const data = await requestData<{ instance: RecruitmentInstance }>(`/api/recruit/instances/${id}`); setItem(data.instance); setIsEditing(data.instance.status === "draft"); setForm({ title: data.instance.title, recruitStart: toLocalInput(data.instance.recruitStart), recruitEnd: toLocalInput(data.instance.recruitEnd), interviewStart: toLocalInput(data.instance.interviewStart), interviewEnd: toLocalInput(data.instance.interviewEnd), formUrl: data.instance.formUrl ?? "", promotionCopy: data.instance.promotionCopy ?? "" }); if (data.instance.formId && data.instance.status !== "draft") { const responseData = await requestData<{ responses: RecruitResponseRow[] }>("/api/recruit/responses"); setResponses((responseData.responses ?? []).filter((row) => row.formId === data.instance.formId)); } } catch (e) { setMessage(e instanceof Error ? e.message : "모집 상세를 불러오지 못했습니다."); } finally { setLoading(false); } }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (item?.status !== "draft") return; requestData<{ templates: Array<{ id: number; title: string }> }>("/api/drive/templates").then((data) => setTemplates(data.templates ?? [])).catch(() => setTemplates([])); }, [item?.status]);
  async function save(event: FormEvent) { event.preventDefault(); if (busyAction) return; setBusyAction("save"); setMessage(null); try { const posters = posterFiles.length ? await Promise.all(posterFiles.map(filePayload)) : undefined; await requestData(`/api/recruit/instances/${id}`, { method: "PATCH", body: JSON.stringify({ ...form, posters }) }); setMessage(item?.status === "draft" ? "초안을 저장했습니다." : "모집 정보를 수정했습니다."); setPosterFiles([]); await load(); } catch (e) { setMessage(e instanceof Error ? e.message : "저장하지 못했습니다."); } finally { setBusyAction(null); } }
  async function generateGoogleForm() { if (busyAction) return; setBusyAction("google-form"); setMessage(null); try { /* 2026-08-23: Save the interview range before the backend derives dynamic form questions. */ await requestData(`/api/recruit/instances/${id}`, { method: "PATCH", body: JSON.stringify(form) }); const data = await requestData<{ formUrl: string }>("/api/drive/forms", { method: "POST", body: JSON.stringify({ recruitmentId: id, templateId: generator.templateId, title: form.title, userEmail: generator.userEmail }) }); setForm((v) => ({ ...v, formUrl: data.formUrl })); setMessage("Google Form을 생성하고 연결했습니다."); await load(); } catch (e) { setMessage(e instanceof Error ? e.message : "Google Form을 생성하지 못했습니다."); } finally { setBusyAction(null); } }
  async function action(endpoint: string) { if (busyAction) return; setBusyAction(endpoint); setMessage(null); try { const data = await requestData<{ path?: string }>(`/api/recruit/instances/${id}/${endpoint}`, { method: "POST" }); if (data.path) navigate(data.path); else await load(); } catch (e) { setMessage(e instanceof Error ? e.message : "작업을 완료하지 못했습니다."); } finally { setBusyAction(null); } }
  async function deleteDraft() {
    if (!window.confirm("이 모집 초안을 삭제할까요? 연결된 Google Form 자체는 삭제되지 않습니다.")) return;
    setIsDeleting(true);
    setBusyAction("delete");
    try {
      await requestData(`/api/recruit/instances/${id}`, { method: "DELETE" });
      navigate("/recruit");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "모집 초안을 삭제하지 못했습니다.");
      setIsDeleting(false);
      setBusyAction(null);
    }
  }
  function cancelEditing() {
    if (!item) return;
    setForm({ title: item.title, recruitStart: toLocalInput(item.recruitStart), recruitEnd: toLocalInput(item.recruitEnd), interviewStart: toLocalInput(item.interviewStart), interviewEnd: toLocalInput(item.interviewEnd), formUrl: item.formUrl ?? "", promotionCopy: item.promotionCopy ?? "" });
    setPosterFiles([]);
    setIsEditing(false);
  }
  function selectPosterFiles(files: FileList | null, input: HTMLInputElement) {
    const selected = Array.from(files ?? []);
    const unsupported = selected.find((file) => !["image/png", "image/jpeg", "image/webp"].includes(file.type));
    const oversized = selected.find((file) => file.size > MAX_POSTER_BYTES);
    const totalBytes = selected.reduce((total, file) => total + file.size, 0);
    let validationMessage = "";
    if (selected.length > MAX_POSTER_COUNT) validationMessage = `모집 포스터는 최대 ${MAX_POSTER_COUNT}장까지 선택할 수 있습니다.`;
    else if (unsupported) validationMessage = `${unsupported.name}: PNG, JPEG, WebP 이미지만 업로드할 수 있습니다.`;
    else if (oversized) validationMessage = `${oversized.name}: 이미지 한 장은 8MB 이하여야 합니다.`;
    else if (totalBytes > MAX_POSTERS_TOTAL_BYTES) validationMessage = "모집 포스터 전체 용량은 10MB 이하여야 합니다.";
    if (validationMessage) {
      // 2026-08-23: Reject oversized poster selections before nginx/base64 expansion and explain the exact limit.
      setPosterFiles([]);
      setMessage(validationMessage);
      input.value = "";
      return;
    }
    setMessage(null);
    setPosterFiles(selected);
  }
  if (loading) return <LoadingState />;
  if (!item) return <ErrorState message={message ?? "모집 인스턴스를 찾지 못했습니다."} />;
  // 2026-08-21: Drafts are always editable; recruiting/interview campaigns require an explicit edit action.
  const canEditActive = item.status === "recruiting" || item.status === "planning" || item.status === "interview";
  const editable = item.status === "draft" || (canEditActive && isEditing);
  // 2026-08-23: Management opens the Google Forms editor while public recruitment keeps the responder URL.
  const formEditUrl = item.formId
    ? `https://docs.google.com/forms/d/${encodeURIComponent(item.formId)}/edit`
    : item.formUrl;
  return <section className="stack-page recruit-page">
    <div className="page-heading"><div><h1>{item.title}</h1><span className={`status-pill ${item.status}`}>{STATUS_LABEL[item.status]}</span></div><div className="toolbar">{canEditActive && !isEditing ? <button className="secondary-button" disabled={Boolean(busyAction)} type="button" onClick={() => setIsEditing(true)}>수정</button> : null}{canEditActive && isEditing ? <button className="secondary-button" disabled={Boolean(busyAction)} type="button" onClick={cancelEditing}>수정 취소</button> : null}{item.status === "draft" ? <button className="danger-button" disabled={Boolean(busyAction)} type="button" onClick={deleteDraft}>{isDeleting ? <BusyLabel text="삭제 중..." /> : "초안 삭제"}</button> : null}{item.status === "draft" ? <button disabled={Boolean(busyAction)} type="button" onClick={() => action("start")}>{busyAction === "start" ? <BusyLabel /> : "모집 시작"}</button> : null}{item.status === "recruiting" ? <button disabled={Boolean(busyAction)} type="button" onClick={() => action("finish-recruiting")}>{busyAction === "finish-recruiting" ? <BusyLabel /> : "모집 종료"}</button> : null}{item.status === "planning" ? <><button disabled={Boolean(busyAction)} type="button" onClick={() => action("interview-plan")}>{busyAction === "interview-plan" ? <BusyLabel /> : "면접 계획하기"}</button>{item.interviewPlanStatus === "active" ? <button disabled={Boolean(busyAction)} type="button" onClick={() => action("start-interview")}>{busyAction === "start-interview" ? <BusyLabel /> : "면접 시작"}</button> : null}</> : null}{item.status === "interview" && item.interviewPlanId ? <button disabled={Boolean(busyAction)} type="button" onClick={() => navigate(`/recruit/interview/plans/${item.interviewPlanId}`)}>면접 타임테이블 보기</button> : null}{item.status === "interview" ? <button disabled={Boolean(busyAction)} type="button" onClick={() => action("finish-interview")}>{busyAction === "finish-interview" ? <BusyLabel /> : "면접 종료"}</button> : null}</div></div>
    {message ? <div className="page-state notice">{message}</div> : null}
    {busyAction ? <div aria-live="polite" className="processing-banner"><BusyLabel text={busyAction === "save" ? "저장 중..." : busyAction === "google-form" ? "Google Form 처리 중..." : busyAction === "delete" ? "삭제 중..." : "처리 중..."} /></div> : null}
    <form className="form-card" onSubmit={save}><label>제목<input disabled={!editable} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><div className="form-grid"><label>모집 시작<input disabled={!editable} required step={600} type="datetime-local" value={form.recruitStart} onChange={(e) => setForm({ ...form, recruitStart: e.target.value })} /></label><label>모집 종료<input disabled={!editable} required step={600} type="datetime-local" value={form.recruitEnd} onChange={(e) => setForm({ ...form, recruitEnd: e.target.value })} /></label><label>면접 시작<input disabled={!editable} required step={600} type="datetime-local" value={form.interviewStart} onChange={(e) => setForm({ ...form, interviewStart: e.target.value })} /></label><label>면접 종료<input disabled={!editable} required step={600} type="datetime-local" value={form.interviewEnd} onChange={(e) => setForm({ ...form, interviewEnd: e.target.value })} /></label></div><label>Google Form 링크{formEditUrl ? <a className="external-form-link" href={formEditUrl} target="_blank" rel="noreferrer">Google Form 수정 화면 열기</a> : <input disabled={!editable || item.status !== "draft"} value={form.formUrl} onChange={(e) => setForm({ ...form, formUrl: e.target.value })} />}</label><label>모집 문구<textarea disabled={!editable} value={form.promotionCopy} onChange={(e) => setForm({ ...form, promotionCopy: e.target.value })} /></label><div className="recruit-poster-preview">{item.posterUrls.map((url, index) => <img key={url} src={url} alt={`${item.title} 포스터 ${index + 1}`} />)}</div>{editable ? <label>모집 포스터<span className="field-help">PNG·JPEG·WebP, 한 장 8MB 이하, 전체 10MB 이하·최대 10장. 새 파일 선택 시 기존 포스터 전체를 교체합니다.</span><input accept="image/png,image/jpeg,image/webp" multiple type="file" onChange={(e) => selectPosterFiles(e.target.files, e.currentTarget)} />{posterFiles.length ? <span className="selected-file-summary">선택: {posterFiles.map((file) => file.name).join(", ")}</span> : null}</label> : null}{editable ? <button type="submit">{item.status === "draft" ? "초안 저장" : "수정 저장"}</button> : null}</form>
    {editable && !item.formId ? <section className="form-card"><h2>Google Form 생성</h2><p>저장된 면접 시작·종료 일시를 기준으로 날짜별 면접 가능 시간 질문을 자동 생성합니다.</p><label>템플릿<select value={generator.templateId} onChange={(e) => setGenerator({ ...generator, templateId: e.target.value })}><option value="">선택</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label><label>편집자 이메일<input type="email" value={generator.userEmail} onChange={(e) => setGenerator({ ...generator, userEmail: e.target.value })} /></label><button disabled={!generator.templateId || !generator.userEmail || !form.title || !form.interviewStart || !form.interviewEnd} type="button" onClick={generateGoogleForm}>Google Form 생성 및 연결</button></section> : null}
    {item.status !== "draft" ? <RecruitMetrics item={item} rows={responses} /> : null}{item.status !== "draft" ? <ApplicantTable rows={responses} /> : null}
  </section>;
}

// 2026-08-22: Show gender and every evaluation state as one visual snapshot in interview and closed phases.
function RecruitMetrics({ item, rows }: { item: RecruitmentInstance; rows: RecruitResponseRow[] }) {
  const total = item.maleCount + item.femaleCount;
  const maleRate = total ? Math.round(item.maleCount / total * 100) : 0;
  const femaleRate = total ? 100 - maleRate : 0;
  const counts = ratingCounts(rows);
  return <section className="recruit-metrics-grid"><article className="data-card"><h2>지원 현황</h2><p>지원자 {item.applicantCount}명</p>{total ? <div className="gender-ratio" aria-label={`남성 ${maleRate}%, 여성 ${femaleRate}%`}><span className="male" style={{ width: `${maleRate}%` }}>남 {maleRate}%</span><span className="female" style={{ width: `${femaleRate}%` }}>여 {femaleRate}%</span></div> : <p className="muted-copy">성별 집계 데이터가 없습니다.</p>}</article>{["interview", "closed"].includes(item.status) ? <RatingPie counts={counts} total={rows.length} /> : null}</section>;
}

const RATING_COLORS: Record<string, string> = { 대기: "#9ca3af", "1차합격": "#0ea5e9", 불합격: "#ef4444", 느별: "#f59e0b", 느괜: "#3b82f6", 느좋: "#84cc16", 최종합격: "#10b981" };
function ratingCounts(rows: RecruitResponseRow[]) { return rows.reduce<Record<string, number>>((result, row) => { const rating = row.rating || "대기"; result[rating] = (result[rating] || 0) + 1; return result; }, {}); }
function RatingPie({ counts, total }: { counts: Record<string, number>; total: number }) {
  let cursor = 0;
  const segments = Object.entries(RATING_COLORS).map(([rating, color]) => { const start = cursor; cursor += total ? ((counts[rating] || 0) / total) * 100 : 0; return `${color} ${start}% ${cursor}%`; });
  return <article className="data-card rating-overview"><h2>전체 평가 비율</h2><div className="rating-pie" style={{ background: total ? `conic-gradient(${segments.join(",")})` : "#eee5d1" }} aria-label={`지원자 ${total}명의 평가 비율`} /><ul>{Object.entries(RATING_COLORS).map(([rating, color]) => <li key={rating}><i style={{ background: color }} /><span>{rating}</span><strong>{counts[rating] || 0}명</strong></li>)}</ul></article>;
}

function ApplicantTable({ rows }: { rows: RecruitResponseRow[] }) {
  const [filters, setFilters] = useState({ query: "", gender: "", rating: "" });
  const filtered = rows.filter((row) => { const keyword = filters.query.trim().toLocaleLowerCase("ko-KR"); return (!keyword || `${row.applicantName} ${row.studentId ?? ""}`.toLocaleLowerCase("ko-KR").includes(keyword)) && (!filters.gender || row.gender === filters.gender) && (!filters.rating || (row.rating || "대기") === filters.rating); });
  if (!rows.length) return <EmptyState title="지원자가 없습니다." />;
  return <section className="applicant-list-section"><div className="filter-panel applicant-filter-panel"><label>지원자 검색<input placeholder="이름 또는 학번" value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })} /></label><label>성별<select value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })}><option value="">전체</option><option>남자</option><option>여자</option></select></label><label>평가<select className="rating-select" value={filters.rating} onChange={(e) => setFilters({ ...filters, rating: e.target.value })}><option value="">전체</option>{Object.keys(RATING_COLORS).map((rating) => <option key={rating}>{rating}</option>)}</select></label><span className="filter-result"><strong>{filtered.length}</strong>명</span></div>{filtered.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>학번</th><th>이름</th><th>성별</th><th>평가</th></tr></thead><tbody>{filtered.map((row) => <tr className="clickable-row" key={row.id} onClick={() => window.open(`/recruit/responses/${row.id}`, "_blank", "noopener,noreferrer")}><td>{row.studentId ?? "-"}</td><td>{row.applicantName}</td><td>{row.gender ?? "-"}</td><td><span className={`rating-badge rating-${row.rating || "대기"}`}>{row.rating || "대기"}</span></td></tr>)}</tbody></table></div> : <EmptyState title="조건에 맞는 지원자가 없습니다." />}</section>;
}
function formatPeriod(start?: string | null, end?: string | null) { return start || end ? `${start ? new Date(start).toLocaleDateString("ko-KR") : "-"} ~ ${end ? new Date(end).toLocaleDateString("ko-KR") : "-"}` : "모집 기간 미정"; }
function toLocalInput(value?: string | null) { if (!value) return ""; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function filePayload(file: File) { return new Promise<{ fileName: string; dataUrl: string }>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ fileName: file.name, dataUrl: String(reader.result) }); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
