import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";

const TIME_SLOTS = [
  "09:00~10:00", "10:00~11:00", "11:00~12:00", "12:00~13:00",
  "13:00~14:00", "14:00~15:00", "15:00~16:00", "16:00~17:00",
  "17:00~18:00", "18:00~19:00", "19:00~20:00"
];

interface InterviewPlan {
  id: number;
  recruitmentId?: number | null;
  title: string;
  formId?: string;
  formTitle?: string | null;
  status?: string | null;
  owner?: string | null;
  updatedAt?: string | null;
}

interface InterviewForm {
  id: string;
  title: string;
  formType?: string;
  createdAt?: string | null;
}

interface InterviewDate {
  id?: number;
  date: string;
  questionId: string;
}

interface Interviewer {
  id: string;
  name: string;
  authority?: string | null;
  thumbnailImage?: string | null;
}

interface Availability {
  id?: number;
  interviewerId: string;
  date: string;
  timeSlot: string;
}

interface Applicant {
  id: number;
  studentId?: string | null;
  name: string;
  rating?: string | null;
}

interface ScheduleItem {
  id: number;
  start: string;
  end: string;
  applicantName?: string | null;
  interviewerNames?: string[];
  location?: string | null;
}

interface InterviewPlanDetail extends InterviewPlan {
  panelSize?: number;
  createdAt?: string | null;
}

interface SlotLocation {
  date: string;
  timeSlot: string;
  location: string;
}

interface ActiveInterviewSchedule {
  plan: InterviewPlanDetail;
  schedule: Array<{
    id: number;
    date: string;
    timeSlot: string;
    applicantId?: number | null;
    applicantStudentId?: string | null;
    applicantName: string;
    rating?: string | null;
    interviewerNames: string[];
    location?: string | null;
  }>;
}

export function InterviewPlansPage() {
  const [plans, setPlans] = useState<InterviewPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function loadPlans() {
      try {
        const data = await requestData<{ plans: InterviewPlan[] }>("/api/interview/plans");
        if (!ignore) setPlans(data.plans ?? []);
      } catch (loadError) {
        if (!ignore) setError(loadError instanceof Error ? loadError.message : "면접 계획을 불러오지 못했습니다.");
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }
    loadPlans();
    return () => { ignore = true; };
  }, []);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <section className="stack-page interview-page">
      <div className="interview-hero compact-hero">
        <div>
          {/* 2026-07-23: Keep interview headings Korean-only without English eyebrow text. */}
          <h1>면접 타임테이블</h1>
          <p>지원자와 면접관의 가능한 시간을 모아 면접 계획을 관리합니다.</p>
        </div>
        <button className="hero-button" type="button" onClick={() => navigate("/recruit")}>모집 관리로 이동</button>
      </div>

      <div className="section-heading-row"><h2>면접 계획 목록</h2><span>{plans.length}개</span></div>
      {plans.length === 0 ? (
        <EmptyState title="면접 계획이 없습니다. 새 계획을 만들어보세요." />
      ) : (
        <div className="interview-plan-grid">
          {plans.map((plan) => (
            <article
              className="interview-plan-card clickable-row"
              key={plan.id}
              tabIndex={0}
              onClick={() => navigate(`/recruit/interview/plans/${plan.id}`)}
              onKeyDown={(event) => event.key === "Enter" && navigate(`/recruit/interview/plans/${plan.id}`)}
            >
              <div className="plan-card-top">
                <span className={`status-pill ${statusClass(plan.status)}`}>{formatPlanStatus(plan.status)}</span>
                <span>{plan.updatedAt ? formatDate(plan.updatedAt) : "-"}</span>
              </div>
              <h2>{plan.title}</h2>
              <p>{plan.formTitle ?? "연결된 지원 폼 없음"}</p>
              <div className="plan-card-footer">
                <span>담당 {plan.owner ?? "-"}</span>
                {plan.recruitmentId ? <button className="text-button" type="button" onClick={(event) => { event.stopPropagation(); navigate(`/recruit/${plan.recruitmentId}`); }}>모집 상세 페이지로 이동</button> : null}
                <strong>상세 보기 →</strong>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function ActiveInterviewSchedulesPage() {
  const [activeSchedules, setActiveSchedules] = useState<ActiveInterviewSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 2026-07-23: Show only confirmed plans and their persisted interview schedule in the personnel menu.
  useEffect(() => {
    let ignore = false;
    requestData<{ activeSchedules: ActiveInterviewSchedule[] }>(
      "/api/interview/schedules/active",
    )
      .then((data) => {
        if (!ignore) setActiveSchedules(data.activeSchedules ?? []);
      })
      .catch((loadError) => {
        if (!ignore) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "확정 면접 스케줄을 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <section className="stack-page active-interview-schedules-page">
      <div className="page-heading">
        <div>
          <h1>확정 면접 스케줄</h1>
          <p>현재 확정 상태인 면접 계획과 배정 결과를 확인합니다.</p>
        </div>
        {/* 2026-07-23: 공통 툴바 버튼 디자인이 적용되도록 이동 버튼을 툴바 영역에 배치합니다. */}
        <div className="toolbar">
          <button type="button" onClick={() => navigate("/recruit/interview/plans")}>
            면접 계획 관리
          </button>
        </div>
      </div>

      {activeSchedules.length === 0 ? (
        <EmptyState title="현재 확정된 면접 스케줄이 없습니다." />
      ) : (
        activeSchedules.map(({ plan, schedule }) => (
          <section className="active-schedule-plan" key={plan.id}>
            <header>
              <div>
                <h2>{plan.title}</h2>
                <p>{plan.formTitle ?? "연결된 지원 폼 없음"}</p>
              </div>
              <div className="toolbar">
                {plan.recruitmentId ? <button type="button" onClick={() => navigate(`/recruit/${plan.recruitmentId}`)}>모집 상세 페이지로 이동</button> : null}
                <span className="status-pill active">확정</span>
              </div>
            </header>
            {schedule.length === 0 ? (
              <EmptyState title="저장된 면접 스케줄이 없습니다." />
            ) : (
              <div className="table-wrap">
                <table className="data-table confirmed-schedule-table">
                  <thead>
                    <tr>
                      <th>면접 날짜</th>
                      <th>시간대</th>
                      <th>면접관</th>
                      <th>장소</th>
                      <th>피면접자</th>
                      <th>평가</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((item) => (
                      <tr
                        className={item.applicantId ? "clickable-row" : undefined}
                        key={`${plan.id}-${item.id}-${item.applicantStudentId}`}
                        onClick={() => {
                          if (item.applicantId) {
                            navigate(`/recruit/responses/${item.applicantId}`);
                          }
                        }}
                      >
                        <td>{item.date}</td>
                        <td>{item.timeSlot}</td>
                        <td>{item.interviewerNames.join(", ") || "-"}</td>
                        <td>{item.location || "-"}</td>
                        <td>{item.applicantName}</td>
                        <td>
                          <span className={`status-pill ${ratingClass(item.rating)}`}>
                            {item.rating ?? "대기"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))
      )}
    </section>
  );
}

export function InterviewPlanCreatePage({ path = window.location.pathname }: { path?: string }) {
  // 2026-08-23: A linked edit route opens at interviewer assignment and preloads the complete saved plan.
  const draftParams = new URLSearchParams(window.location.search);
  const pathPlanId = Number(path.match(/^\/recruit\/interview\/plans\/(\d+)\/edit\/interviewers$/)?.[1] || 0);
  const draftPlanId = pathPlanId || Number(draftParams.get("planId") || 0);
  const presetFormId = draftParams.get("formId") ?? "";
  const presetTitle = draftParams.get("title") ?? "";
  const [step, setStep] = useState(pathPlanId ? 2 : 0);
  const [forms, setForms] = useState<InterviewForm[]>([]);
  const [interviewers, setInterviewers] = useState<Interviewer[]>([]);
  const [selectedFormId, setSelectedFormId] = useState(presetFormId);
  const [dates, setDates] = useState<InterviewDate[]>([]);
  const [title, setTitle] = useState(presetTitle);
  const [selectedInterviewerIds, setSelectedInterviewerIds] = useState<string[]>([]);
  const [availabilityKeys, setAvailabilityKeys] = useState<string[]>([]);
  const [slotLocations, setSlotLocations] = useState<Record<string, string>>({});
  const [panelSize, setPanelSize] = useState(2);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recruitmentId, setRecruitmentId] = useState<number | null>(null);

  // 2026-07-23: Port the EJS four-step interview planner into one stateful React workflow.
  useEffect(() => {
    let ignore = false;
    Promise.all([
      requestData<{ forms: InterviewForm[] }>("/api/recruit/forms"),
      requestData<{ interviewers: Interviewer[] }>("/api/interview/interviewers"),
      draftPlanId ? requestData<{
        plan: InterviewPlanDetail;
        interviewDates: InterviewDate[];
        interviewers: Interviewer[];
        availability: Availability[];
        slotLocations: SlotLocation[];
      }>(`/api/interview/plans/${draftPlanId}`) : Promise.resolve(null)
    ]).then(([formData, interviewerData, detailData]) => {
      if (!ignore) {
        setForms(formData.forms ?? []);
        setInterviewers(interviewerData.interviewers ?? []);
        if (detailData) {
          setSelectedFormId(detailData.plan.formId ?? "");
          setTitle(detailData.plan.title);
          setRecruitmentId(detailData.plan.recruitmentId ?? null);
          setPanelSize(Math.max(1, Number(detailData.plan.panelSize ?? 2)));
          setSelectedInterviewerIds(detailData.interviewers.map((item) => item.id));
          setAvailabilityKeys(detailData.availability.map((item) => availabilityKey(item.interviewerId, item.date, item.timeSlot)));
          setSlotLocations(Object.fromEntries(detailData.slotLocations.map((item) => [`${item.date}|${item.timeSlot}`, item.location])));
          if (detailData.interviewDates.length > 0) setDates(detailData.interviewDates);
        }
      }
    }).catch((loadError) => {
      if (!ignore) setError(loadError instanceof Error ? loadError.message : "면접 계획 정보를 불러오지 못했습니다.");
    });
    return () => { ignore = true; };
  }, [draftPlanId]);

  useEffect(() => {
    if (!selectedFormId) {
      setDates([]);
      return;
    }
    let ignore = false;
    setIsLoading(true);
    requestData<{ dates: InterviewDate[] }>(`/api/recruit/forms/${selectedFormId}/interview-dates`)
      .then((data) => { if (!ignore) setDates(data.dates ?? []); })
      .catch((loadError) => { if (!ignore) setError(loadError instanceof Error ? loadError.message : "면접 날짜를 분석하지 못했습니다."); })
      .finally(() => { if (!ignore) setIsLoading(false); });
    return () => { ignore = true; };
  }, [selectedFormId]);

  const selectedInterviewers = interviewers.filter((item) => selectedInterviewerIds.includes(item.id));
  const filteredInterviewers = interviewers.filter((item) =>
    `${item.name} ${item.authority ?? ""}`.toLocaleLowerCase("ko-KR").includes(query.toLocaleLowerCase("ko-KR"))
  );

  function next() {
    setError(null);
    if (step === 1 && (!selectedFormId || !title.trim() || dates.length === 0)) {
      setError("지원 폼, 계획 제목, 면접 날짜를 모두 확인해주세요.");
      return;
    }
    if (step === 2 && selectedInterviewerIds.length === 0) {
      setError("면접관을 한 명 이상 선택해주세요.");
      return;
    }
    setStep((current) => Math.min(3, current + 1));
  }

  async function createPlan() {
    if (availabilityKeys.length === 0) {
      setError("면접관의 가능한 시간을 한 개 이상 선택해주세요.");
      return;
    }
    const usedSlots = new Set(availabilityKeys.map((key) => {
      const [, date, timeSlot] = key.split("|");
      return `${date}|${timeSlot}`;
    }));
    if ([...usedSlots].some((key) => !slotLocations[key]?.trim())) {
      setError("면접이 가능한 모든 시간대의 면접 장소를 입력해주세요.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await requestData<{ path: string }>("/api/interview/plans", {
        method: "POST",
        body: JSON.stringify({
          planId: draftPlanId || undefined,
          formId: selectedFormId,
          title: title.trim(),
          panelSize,
          interviewDates: dates,
          interviewerIds: selectedInterviewerIds,
          availability: availabilityKeys.map(parseAvailabilityKey),
          // 2026-08-20: Persist one venue for each date/time slot used by the plan.
          slotLocations: [...usedSlots].map((key) => {
            const [date, timeSlot] = key.split("|");
            return { date, timeSlot, location: slotLocations[key].trim() };
          })
        })
      });
      navigate(data.path);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "면접 계획을 만들지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="interview-wizard">
      {recruitmentId ? <div className="toolbar interview-return-toolbar"><button type="button" onClick={() => navigate(`/recruit/${recruitmentId}`)}>모집 상세 페이지로 이동</button></div> : null}
      <div className="wizard-progress" aria-label="면접 계획 생성 단계">
        {["안내", "폼 선택", "면접관", "시간 설정"].map((label, index) => (
          <div className={index <= step ? "active" : ""} key={label}><span>{index + 1}</span><strong>{label}</strong></div>
        ))}
      </div>

      {error ? <div className="page-state error">{error}</div> : null}

      {step === 0 ? (
        <div className="wizard-intro">
          <h1>면접 타임테이블 생성</h1>
          <p>지원자들의 면접 가능 시간과 면접관 일정을 분석해 계획을 준비합니다.</p>
          <button className="hero-button" type="button" onClick={next}>면접 계획 생성 시작</button>
          <div className="wizard-step-cards">
            {[
              ["1", "폼 선택", "지원 폼과 면접 날짜를 확인합니다."],
              ["2", "면접관 추가", "참여할 운영진을 선택합니다."],
              ["3", "시간 설정", "면접관별 가능한 시간을 설정합니다."],
              ["4", "계획 생성", "정보를 저장하고 스케줄을 생성합니다."]
            ].map(([number, label, description]) => (
              <article key={number}><span>{number}</span><h2>{label}</h2><p>{description}</p></article>
            ))}
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <WizardPanel title="응답 폼 선택" description="면접 대상 지원 폼을 선택해주세요.">
          <div className="select-card-grid">
            {forms.map((form) => (
              <button
                className={form.id === selectedFormId ? "select-card selected" : "select-card"}
                key={form.id}
                type="button"
                disabled={Boolean(draftPlanId) && Boolean(selectedFormId) && form.id !== selectedFormId}
                onClick={() => setSelectedFormId(form.id)}
              ><strong>{form.title}</strong><span>생성일 {form.createdAt ? formatDate(form.createdAt) : "-"}</span></button>
            ))}
          </div>
          {selectedFormId ? (
            <div className="wizard-form-summary">
              <label>면접 계획 제목<input value={title} placeholder="예: 7기 신입부원 면접" onChange={(event) => setTitle(event.target.value)} /></label>
              <div><strong>면접 일정</strong><div className="date-chip-list">{dates.map((item) => <span key={`${item.date}-${item.questionId}`}>{item.date}</span>)}</div></div>
              {isLoading ? <p>면접 날짜를 분석하고 있습니다...</p> : null}
            </div>
          ) : null}
        </WizardPanel>
      ) : null}

      {step === 2 ? (
        <WizardPanel title="면접관 추가" description="면접에 참여할 운영진을 선택해주세요.">
          <input className="wizard-search" value={query} placeholder="면접관 이름을 검색하세요" onChange={(event) => setQuery(event.target.value)} />
          <div className="selected-chip-box"><strong>선택된 면접관 ({selectedInterviewers.length}명)</strong><div className="selected-chip-list">
            {selectedInterviewers.map((item) => <button key={item.id} type="button" onClick={() => toggleInterviewer(item.id)}>{item.name} ({item.authority}) ×</button>)}
          </div></div>
          <div className="interviewer-select-grid">
            {filteredInterviewers.map((item) => (
              <button className={selectedInterviewerIds.includes(item.id) ? "selected" : ""} key={item.id} type="button" onClick={() => toggleInterviewer(item.id)}>
                <span className="member-avatar">{item.name.slice(0, 1)}</span><span><strong>{item.name}</strong><small>{item.authority}</small></span>
              </button>
            ))}
          </div>
        </WizardPanel>
      ) : null}

      {step === 3 ? (
        <WizardPanel title="면접관 시간 설정" description="각 면접관이 참여 가능한 시간대를 선택해주세요.">
          <div className="plan-summary-strip"><span>폼 <strong>{forms.find((item) => item.id === selectedFormId)?.title}</strong></span><span>면접일 <strong>{dates.length}일</strong></span><label>최소 면접관 수<input min={1} max={selectedInterviewerIds.length} type="number" value={panelSize} onChange={(event) => setPanelSize(Number(event.target.value))} /></label></div>
          <section className="form-card"><h2>시간대별 면접 장소</h2>{dates.map((item) => <fieldset key={`location-${item.date}`}><legend>{item.date}</legend><div className="form-grid">{TIME_SLOTS.map((slot) => { const key = `${item.date}|${slot}`; const used = availabilityKeys.some((availability) => availability.endsWith(`|${item.date}|${slot}`)); return <label key={key}>{slot}<input disabled={!used} required={used} value={slotLocations[key] ?? ""} placeholder={used ? "예: 학생회관 301호" : "사용하지 않는 시간"} onChange={(event) => setSlotLocations((current) => ({ ...current, [key]: event.target.value }))} /></label>; })}</div></fieldset>)}</section>
          <div className="availability-list">
            {selectedInterviewers.map((interviewer) => (
              <section className="availability-person" key={interviewer.id}>
                <header><span className="member-avatar">{interviewer.name.slice(0, 1)}</span><div><h2>{interviewer.name}</h2><p>{interviewer.authority}</p></div></header>
                {dates.map((item) => (
                  <fieldset key={`${interviewer.id}-${item.date}`}>
                    <legend>{item.date}</legend>
                    <div className="time-slot-grid">
                      {TIME_SLOTS.map((slot) => {
                        const key = availabilityKey(interviewer.id, item.date, slot);
                        return <label key={slot}><input checked={availabilityKeys.includes(key)} type="checkbox" onChange={() => toggleAvailability(key)} /><span>{slot}</span></label>;
                      })}
                    </div>
                    <div className="availability-shortcuts"><button type="button" onClick={() => setDateAvailability(interviewer.id, item.date, false)}>가능 시간 없음</button><button type="button" onClick={() => setDateAvailability(interviewer.id, item.date, true)}>모든 시간 참여</button></div>
                  </fieldset>
                ))}
              </section>
            ))}
          </div>
        </WizardPanel>
      ) : null}

      {step > 0 ? (
        <div className="wizard-actions">
          <button className="secondary-button" type="button" onClick={() => setStep((current) => current - 1)}>뒤로 가기</button>
          {step < 3 ? <button type="button" onClick={next}>다음 단계</button> : <button disabled={isLoading} type="button" onClick={createPlan}>{isLoading ? "저장 중..." : draftPlanId ? "면접 계획 저장" : "면접 계획 생성"}</button>}
        </div>
      ) : null}
    </section>
  );

  function toggleInterviewer(id: string) {
    setSelectedInterviewerIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAvailability(key: string) {
    setAvailabilityKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  function setDateAvailability(interviewerId: string, date: string, all: boolean) {
    const prefix = `${interviewerId}|${date}|`;
    setAvailabilityKeys((current) => [
      ...current.filter((key) => !key.startsWith(prefix)),
      ...(all ? TIME_SLOTS.map((slot) => availabilityKey(interviewerId, date, slot)) : [])
    ]);
  }
}

function WizardPanel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="wizard-panel"><header><h1>{title}</h1><p>{description}</p></header>{children}</section>;
}

export function InterviewPlanDetailPage({ path }: { path: string }) {
  const planId = Number(path.split("/").at(-1));
  const [plan, setPlan] = useState<InterviewPlanDetail | null>(null);
  const [dates, setDates] = useState<InterviewDate[]>([]);
  const [interviewers, setInterviewers] = useState<Interviewer[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [minimumInterviewers, setMinimumInterviewers] = useState(2);

  const loadPlan = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await requestData<{
        plan: InterviewPlanDetail; interviewDates: InterviewDate[]; interviewers: Interviewer[];
        availability: Availability[]; applicants: Applicant[]; schedule: ScheduleItem[];
      }>(`/api/interview/plans/${planId}`);
      setPlan(data.plan); setMinimumInterviewers(Math.max(1, Number(data.plan.panelSize ?? 2))); setDates(data.interviewDates ?? []); setInterviewers(data.interviewers ?? []);
      setAvailability(data.availability ?? []); setApplicants(data.applicants ?? []); setSchedule(data.schedule ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "면접 계획을 불러오지 못했습니다.");
    } finally { setIsLoading(false); }
  }, [planId]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  const availabilityByInterviewer = useMemo(() => new Map(interviewers.map((interviewer) => [
    interviewer.id, availability.filter((item) => item.interviewerId === interviewer.id)
  ])), [availability, interviewers]);

  async function generateTimetable() {
    if (!window.confirm(`최소 ${minimumInterviewers}명의 면접관으로 스케줄을 생성하시겠습니까?`)) return;
    setMessage(null);
    setActionError(null);
    setIsGenerating(true);
    try {
      const data = await requestData<{
        scheduleCount: number; message?: string; isPerfect: boolean; extraSlotsCount: number;
      }>(`/api/interview/plans/${planId}/timetable`, {
        method: "POST",
        body: JSON.stringify({ minInterviewers: minimumInterviewers }),
      });
      setMessage(
        data.isPerfect
          ? (data.message ?? `${data.scheduleCount}명의 면접 스케줄을 생성했습니다.`)
          : `${data.scheduleCount}명의 스케줄을 생성했습니다. 면접관 가능 시간 외 추가 배정 ${data.extraSlotsCount}건이 있습니다.`,
      );
      await loadPlan();
    } catch (generateError) {
      setActionError(generateError instanceof Error ? generateError.message : "시간표를 생성하지 못했습니다.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function changeStatus(status: string) {
    setActionError(null);
    setIsChangingStatus(true);
    try {
      await requestData<{ status: string }>(`/api/interview/plans/${planId}/status`, { method: "POST", body: JSON.stringify({ status }) });
      setPlan((current) => current ? { ...current, status } : current);
    } catch (statusError) {
      setActionError(statusError instanceof Error ? statusError.message : "면접 계획 상태를 변경하지 못했습니다.");
    } finally {
      setIsChangingStatus(false);
    }
  }

  async function deletePlan() {
    if (!window.confirm("이 면접 계획을 삭제하시겠습니까?")) return;
    await requestData<{ message: string }>(`/api/interview/plans/${planId}`, { method: "DELETE" });
    // 2026-08-23: A linked plan returns to its recruitment detail after deletion.
    navigate(plan?.recruitmentId ? `/recruit/${plan.recruitmentId}` : "/recruit/interview/plans");
  }

  if (isLoading) return <LoadingState />;
  if (error || !plan) return <ErrorState message={error ?? "면접 계획을 찾을 수 없습니다."} />;

  return (
    <section className="stack-page interview-detail-page">
      <div className="page-heading plan-detail-heading">
        <div><button className="text-button" type="button" onClick={() => navigate("/recruit/interview/plans")}>← 면접 계획 목록으로</button><h1>{plan.title}</h1><span className={`status-pill ${statusClass(plan.status)}`}>{formatPlanStatus(plan.status)}</span></div>
        <div className="toolbar">
          {plan.recruitmentId ? <button className="secondary-button" type="button" onClick={() => navigate(`/recruit/${plan.recruitmentId}`)}>모집 상세 페이지로 이동</button> : null}
          {plan.status === "draft" || plan.status === "active" ? <button className="secondary-button" type="button" onClick={() => navigate(`/recruit/interview/plans/${planId}/edit/interviewers`)}>수정</button> : null}
          {plan.status === "draft" ? <><label className="compact-number-field">최소 면접관 수<input min={1} max={Math.max(1, interviewers.length)} type="number" value={minimumInterviewers} onChange={(event) => setMinimumInterviewers(Math.max(1, Number(event.target.value) || 1))} /></label><button className="success-button" disabled={isGenerating || isChangingStatus} type="button" onClick={generateTimetable}>{isGenerating ? "스케줄 생성 중..." : "면접 스케줄 생성"}</button><button disabled={isGenerating || isChangingStatus} type="button" onClick={() => changeStatus("active")}>확정</button></> : null}
          {plan.status === "active" ? <><button className="secondary-button" disabled={isChangingStatus} type="button" onClick={() => changeStatus("draft")}>확정 취소</button>{plan.recruitmentId ? <button type="button" onClick={() => navigate(`/recruit/${plan.recruitmentId}`)}>모집 상세에서 면접 종료</button> : <button disabled={isChangingStatus} type="button" onClick={() => changeStatus("completed")}>면접 종료</button>}</> : null}
          <button className="danger-button" type="button" onClick={deletePlan}>삭제</button>
        </div>
      </div>
      {message ? <div className="page-state success">{message}</div> : null}
      {actionError ? <div className="page-state error">{actionError}</div> : null}

      <DetailSection title="기본 정보"><dl className="plan-info-grid"><div><dt>면접 계획 제목</dt><dd>{plan.title}</dd></div><div><dt>연결된 폼</dt><dd>{plan.formTitle ?? "-"}</dd></div><div><dt>생성자</dt><dd>{plan.owner ?? "-"}</dd></div><div><dt>최소 면접관 수</dt><dd>{plan.panelSize ?? 2}명</dd></div><div><dt>생성일</dt><dd>{plan.createdAt ? formatDate(plan.createdAt) : "-"}</dd></div><div><dt>최종 수정일</dt><dd>{plan.updatedAt ? formatDate(plan.updatedAt) : "-"}</dd></div></dl></DetailSection>
      <DetailSection title="면접 날짜"><div className="date-card-grid">{dates.map((item) => <article key={item.id ?? item.date}><span>면접 날짜</span><strong>{item.date}</strong></article>)}</div></DetailSection>
      <DetailSection title={`면접관 (${interviewers.length}명)`}><div className="person-card-grid">{interviewers.map((item) => <article key={item.id}><strong>{item.name}</strong><span>{item.id}</span><small>{item.authority}</small></article>)}</div></DetailSection>
      <DetailSection title="면접관별 면접 가능 시간"><div className="availability-summary-list">{interviewers.map((item) => <article key={item.id}><h3>{item.name}</h3><div>{(availabilityByInterviewer.get(item.id) ?? []).map((slot) => <span key={slot.id ?? `${slot.date}-${slot.timeSlot}`}>{slot.date} · {slot.timeSlot}</span>)}</div></article>)}</div></DetailSection>
      <DetailSection title={`피면접자 목록 (${applicants.length}명)`}>{applicants.length ? <div className="person-card-grid applicant-grid">{applicants.map((item) => <article key={item.id}><strong>{item.name}</strong><span>학번 {item.studentId ?? "-"}</span><small>{item.rating}</small></article>)}</div> : <EmptyState title="1차 합격 지원자가 없습니다." />}</DetailSection>
      <DetailSection title={`면접 스케줄 (${schedule.length}건)`}>{schedule.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>면접 날짜</th><th>시간대</th><th>장소</th><th>면접관</th><th>피면접자</th></tr></thead><tbody>{schedule.map((item) => <tr key={item.id}><td>{item.start}</td><td>{item.end}</td><td>{item.location || "-"}</td><td>{(item.interviewerNames ?? []).join(", ") || "-"}</td><td>{item.applicantName ?? "-"}</td></tr>)}</tbody></table></div> : <EmptyState title="생성된 면접 스케줄이 없습니다." />}</DetailSection>
    </section>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="plan-detail-section"><h2>{title}</h2>{children}</section>;
}

function availabilityKey(interviewerId: string, date: string, timeSlot: string) { return `${interviewerId}|${date}|${timeSlot}`; }
function parseAvailabilityKey(key: string) { const [interviewerId, date, timeSlot] = key.split("|"); return { interviewerId, date, timeSlot }; }
function formatDate(value: string) { return new Date(value).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" }); }
function statusClass(status?: string | null) { return status === "completed" ? "completed" : status === "active" ? "active" : status === "cancelled" ? "cancelled" : "draft"; }
function formatPlanStatus(status?: string | null) { return status === "completed" ? "완료" : status === "active" ? "확정" : status === "cancelled" ? "취소" : "작성 중"; }
function ratingClass(rating?: string | null) { return rating === "최종합격" || rating === "1차합격" ? "active" : rating === "불합격" ? "cancelled" : "draft"; }
