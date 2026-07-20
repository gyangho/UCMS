import { type FormEvent, useState } from "react";
import { requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";

interface RecruitAnswer {
  question: string;
  answer: string;
}

interface RecruitResponse {
  formId: number;
  formTitle: string;
  responseId: string;
  responses: RecruitAnswer[];
}

export function PublicRecruitResponsePage() {
  const [studentId, setStudentId] = useState("");
  const [results, setResults] = useState<RecruitResponse[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 2026-07-16: Public response lookup now posts to the contract API and no longer exposes demo answers.
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const data = await requestData<{ responses: RecruitResponse[] }>(
        "/api/public/recruit-responses/search",
        {
          method: "POST",
          body: JSON.stringify({ studentId })
        }
      );
      setResults(data.responses);
      setSearched(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "지원 응답을 조회하지 못했습니다.");
    }
  }

  return (
    <section className="stack-page narrow">
      <div className="page-heading">
        <div>
          <h1>지원 응답 조회</h1>
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
        <button type="submit">조회</button>
      </form>

      {searched && results.length === 0 ? <EmptyState title="조회된 지원 응답이 없습니다." /> : null}

      <div className="data-grid single">
        {results.map((result) => (
          <article className="data-card" key={`${result.formId}-${result.responseId}`}>
            <div>
              <h2>{result.formTitle}</h2>
              <span className="status-pill">응답 {result.responseId}</span>
            </div>
            <dl className="answer-list">
              {result.responses.map((response) => (
                <div key={`${result.responseId}-${response.question}`}>
                  <dt>{response.question}</dt>
                  <dd>{response.answer}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
