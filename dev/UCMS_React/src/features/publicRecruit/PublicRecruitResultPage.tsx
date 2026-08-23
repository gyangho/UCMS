import { type FormEvent, useState } from "react";
import { requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";

interface RecruitResult {
  formTitle: string;
  name: string;
  major?: string | null;
  rating?: string | null;
  interviewSchedule?: {
    planTitle?: string | null;
    interviewDate?: string | null;
    timeSlot?: string | null;
    location?: string | null;
  } | null;
}

export function PublicRecruitResultPage() {
  const [studentId, setStudentId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [results, setResults] = useState<RecruitResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 2026-08-20: Anonymous result lookup proves ownership with the three applicant fields recorded by the form.
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const data = await requestData<{ results: RecruitResult[] }>("/api/public/recruit-results/search", {
        method: "POST",
        body: JSON.stringify({ studentId, name, phone })
      });
      setResults(data.results);
      setSearched(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "모집 결과를 조회하지 못했습니다.");
    }
  }

  return (
    <section className="stack-page narrow">
      <div className="page-heading">
        <div>
          <h1>모집 결과 조회</h1>
        </div>
      </div>

      {error ? <div className="page-state error">{error}</div> : null}

      <form className="inline-form" onSubmit={submit}>
        <label>
          학번
          <input
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            required
            inputMode="numeric"
            placeholder="학번을 입력하세요"
          />
        </label>
        <label>
          이름
          <input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" />
        </label>
        <label>
          지원서 전화번호
          <input value={phone} onChange={(event) => setPhone(event.target.value)} required inputMode="tel" autoComplete="tel" placeholder="01012345678" />
        </label>
        <button type="submit">조회</button>
      </form>

      {searched && results.length === 0 ? <EmptyState title="조회된 결과가 없습니다." /> : null}

      <div className="data-grid single">
        {results.map((result) => (
          <article
            className="data-card"
            key={`${result.formTitle}-${result.name}-${result.rating ?? "none"}`}
          >
            <div>
              <h2>{result.formTitle}</h2>
              <span className="status-pill active">{result.rating ?? "결과 미정"}</span>
            </div>
            <dl>
              <dt>이름</dt>
              <dd>{result.name}</dd>
              <dt>전공</dt>
              <dd>{result.major ?? "-"}</dd>
              <dt>면접 일정</dt>
              <dd>{formatSchedule(result)}</dd>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatSchedule(result: RecruitResult) {
  if (!result.interviewSchedule) {
    return "-";
  }

  const schedule = result.interviewSchedule;
  return `${schedule.planTitle ?? "-"} / ${schedule.interviewDate ?? "-"} ${schedule.timeSlot ?? ""} / ${schedule.location ?? "장소 미정"}`;
}
