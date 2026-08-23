import { useEffect, useState } from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";
import { useCurrentUser } from "../../shared/api/user";
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
  const { user, isLoading: isUserLoading } = useCurrentUser();
  const [results, setResults] = useState<RecruitResponse[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isUserLoading && !user) navigate("/login");
  }, [isUserLoading, user]);

  // 2026-08-22: The server derives all three identity fields from the verified UCMS account.
  async function loadOwnApplications() {
    setLoading(true);
    setError(null);
    try {
      const data = await requestData<{ responses: RecruitResponse[] }>(
        "/api/public/recruit-responses/search",
        { method: "POST", body: JSON.stringify({}) },
      );
      setResults(data.responses);
      setSearched(true);
    } catch (loadError) {
      setResults([]);
      setSearched(true);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "지원 응답을 조회하지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="stack-page narrow">
      <div className="page-heading"><div><h1>내 지원서 보기</h1></div></div>
      {isUserLoading ? <div className="page-state">로그인 정보를 확인하고 있습니다.</div> : null}
      {error ? <div className="page-state error">{error}</div> : null}
      {user ? (
        <section className="data-card">
          <div><h2>{user.name}님의 지원서</h2><span className="status-pill">본인 계정</span></div>
          <p>인증된 계정의 이름·전화번호·학번과 모두 일치하는 지원서만 표시합니다.</p>
          <button disabled={loading} type="button" onClick={loadOwnApplications}>
            {loading ? "조회 중..." : "내 지원서 불러오기"}
          </button>
        </section>
      ) : null}
      {searched && results.length === 0 ? <EmptyState title="조회된 지원 응답이 없습니다." /> : null}
      <div className="data-grid single">
        {results.map((result) => (
          <article className="data-card" key={`${result.formId}-${result.responseId}`}>
            <div><h2>{result.formTitle}</h2><span className="status-pill">응답 {result.responseId}</span></div>
            <dl className="answer-list">
              {result.responses.map((response) => (
                <div key={`${result.responseId}-${response.question}`}><dt>{response.question}</dt><dd>{response.answer}</dd></div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
