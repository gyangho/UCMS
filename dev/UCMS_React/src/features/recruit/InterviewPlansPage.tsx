import { useEffect, useState } from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";

interface InterviewPlan {
  id: number;
  title: string;
  status?: string | null;
  responseCount?: number;
  interviewerCount?: number;
  startAt?: string | null;
  endAt?: string | null;
}

interface InterviewPlanDetail extends InterviewPlan {
  timetable?: Array<{
    id: number;
    startsAt: string;
    endsAt: string;
    applicantName?: string | null;
    interviewers?: string[];
  }>;
}

export function InterviewPlansPage() {
  const [plans, setPlans] = useState<InterviewPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 2026-07-16: Interview plans are loaded from the scheduler-facing contract endpoint instead of a static demo list.
  useEffect(() => {
    let ignore = false;

    async function loadPlans() {
      try {
        const data = await requestData<{ plans: InterviewPlan[] }>("/api/interview/plans");
        if (!ignore) {
          setPlans(data.plans);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "면접 계획을 불러오지 못했습니다.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadPlans();
    return () => {
      ignore = true;
    };
  }, []);

  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  return (
    <section className="stack-page">
      <div className="page-heading">
        <div>
          <h1>면접 계획</h1>
        </div>
      </div>

      {plans.length === 0 ? (
        <EmptyState title="면접 계획이 없습니다." />
      ) : (
        <div className="board-list">
          {plans.map((plan) => (
            <article
              className="board-post clickable-row"
              key={plan.id}
              onClick={() => navigate(`/recruit/interview/plans/${plan.id}`)}
            >
              <h2>{plan.title}</h2>
              <dl>
                <div>
                  <dt>상태</dt>
                  <dd>{plan.status ?? "-"}</dd>
                </div>
                <div>
                  <dt>지원자</dt>
                  <dd>{plan.responseCount ?? 0}명</dd>
                </div>
                <div>
                  <dt>면접관</dt>
                  <dd>{plan.interviewerCount ?? 0}명</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function InterviewPlanDetailPage({ path }: { path: string }) {
  const planId = Number(path.split("/").at(-1));
  const [plan, setPlan] = useState<InterviewPlanDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // 2026-07-16: Detail view fetches the selected plan so timetable generation can be validated against backend data.
  useEffect(() => {
    let ignore = false;

    async function loadPlan() {
      try {
        const data = await requestData<{ plan: InterviewPlanDetail }>(`/api/interview/plans/${planId}`);
        if (!ignore) {
          setPlan(data.plan);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "면접 계획을 불러오지 못했습니다.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadPlan();
    return () => {
      ignore = true;
    };
  }, [planId]);

  async function handleGenerate() {
    const data = await requestData<{ plan: InterviewPlanDetail }>(
      `/api/interview/plans/${planId}/timetable`,
      { method: "POST" }
    );
    setPlan(data.plan);
    setMessage("면접 시간표를 생성했습니다.");
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (error || !plan) {
    return <ErrorState message={error ?? "면접 계획을 찾을 수 없습니다."} />;
  }

  return (
    <section className="stack-page">
      <div className="page-heading">
        <div>
          <h1>{plan.title}</h1>
          <p>{plan.status ?? "-"}</p>
        </div>
        <div className="toolbar">
          <button type="button" onClick={handleGenerate}>
            시간표 생성
          </button>
        </div>
      </div>

      {message ? <div className="page-state success">{message}</div> : null}

      {(plan.timetable ?? []).length === 0 ? (
        <EmptyState title="생성된 면접 시간표가 없습니다." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>시간</th>
                <th>지원자</th>
                <th>면접관</th>
              </tr>
            </thead>
            <tbody>
              {(plan.timetable ?? []).map((slot) => (
                <tr key={slot.id}>
                  <td>{formatRange(slot.startsAt, slot.endsAt)}</td>
                  <td>{slot.applicantName ?? "-"}</td>
                  <td>{(slot.interviewers ?? []).join(", ") || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatRange(start: string, end: string) {
  return `${new Date(start).toLocaleString("ko-KR")} - ${new Date(end).toLocaleString("ko-KR")}`;
}
