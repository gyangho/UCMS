import { useEffect, useState } from "react";
import { requestData } from "../../shared/api/http";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";

interface RecruitResponseDetail {
  id: number;
  applicantName: string;
  studentId?: string | null;
  major?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  rating?: string | null;
  result?: string | null;
  answers?: Array<{ question: string; answer: string }>;
}

interface SharedDocument {
  content: string;
  version: number;
}

export function RecruitSharedDocPage({ path }: { path: string }) {
  const responseId = Number(path.split("/").at(-1));
  const [response, setResponse] = useState<RecruitResponseDetail | null>(null);
  const [document, setDocument] = useState<SharedDocument | null>(null);
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // 2026-07-16: Shared document page now verifies the recruit/detail contract instead of showing demo applicants.
  useEffect(() => {
    let ignore = false;

    async function loadDetail() {
      try {
        const [responseData, documentData] = await Promise.all([
          requestData<{ response: RecruitResponseDetail }>(`/api/recruit/responses/${responseId}`),
          requestData<{ document: SharedDocument }>(
            `/api/recruit/responses/${responseId}/shared-document`
          )
        ]);
        if (!ignore) {
          setResponse(responseData.response);
          setDocument(documentData.document);
          setContent(documentData.document.content);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "지원자 상세를 불러오지 못했습니다.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadDetail();
    return () => {
      ignore = true;
    };
  }, [responseId]);

  async function handleSave() {
    const data = await requestData<{ document: SharedDocument }>(
      `/api/recruit/responses/${responseId}/shared-document`,
      {
        method: "PUT",
        body: JSON.stringify({
          content,
          version: document?.version ?? 0
        })
      }
    );
    setDocument(data.document);
    setSaveMessage("공유 문서를 저장했습니다.");
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (error || !response) {
    return <ErrorState message={error ?? "지원자를 찾을 수 없습니다."} />;
  }

  return (
    <section className="stack-page">
      <div className="page-heading">
        <div>
          <h1>{response.applicantName}</h1>
          <p>{response.result ?? "결과 미정"}</p>
        </div>
        <span className="status-pill active">{response.rating ?? "평가 없음"}</span>
      </div>

      {saveMessage ? <div className="page-state success">{saveMessage}</div> : null}

      <section className="data-card">
        <h2>지원자 정보</h2>
        <dl>
          <dt>학번</dt>
          <dd>{response.studentId ?? "-"}</dd>
          <dt>전공</dt>
          <dd>{response.major ?? "-"}</dd>
          <dt>연락처</dt>
          <dd>{response.phoneNumber ?? "-"}</dd>
          <dt>이메일</dt>
          <dd>{response.email ?? "-"}</dd>
        </dl>
      </section>

      <div className="two-column">
        <section className="data-card">
          <h2>지원 응답</h2>
          <dl>
            {(response.answers ?? []).map((answer) => (
              <div key={answer.question}>
                <dt>{answer.question}</dt>
                <dd>{answer.answer || "-"}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="form-panel">
          <h2>공유 문서</h2>
          <label>
            평가 메모
            <textarea value={content} rows={14} onChange={(event) => setContent(event.target.value)} />
          </label>
          <div className="card-actions">
            <button type="button" onClick={handleSave}>
              저장
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
