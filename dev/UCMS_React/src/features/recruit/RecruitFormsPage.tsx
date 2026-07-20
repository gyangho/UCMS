import { useCallback, useEffect, useState } from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";

interface RecruitResponseRow {
  id: number;
  applicantName: string;
  studentId?: string | null;
  major?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  formTitle?: string | null;
  rating?: string | null;
  result?: string | null;
  createdAt?: string | null;
}

export function RecruitFormsPage() {
  const [rows, setRows] = useState<RecruitResponseRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // 2026-07-16: Recruit list is now driven by /api/recruit/responses so broken Google/Form sync is visible.
  const loadResponses = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await requestData<{ responses: RecruitResponseRow[] }>("/api/recruit/responses");
      setRows(data.responses);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "지원자 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResponses();
  }, [loadResponses]);

  async function handleSync() {
    setSyncMessage(null);
    const data = await requestData<{ imported: number }>("/api/recruit/sync", {
      method: "POST"
    });
    setSyncMessage(`${data.imported}건을 동기화했습니다.`);
    await loadResponses();
  }

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
          <h1>모집 관리</h1>
        </div>
        <div className="toolbar">
          <button type="button" onClick={handleSync}>
            응답 동기화
          </button>
        </div>
      </div>

      {syncMessage ? <div className="page-state success">{syncMessage}</div> : null}

      {rows.length === 0 ? (
        <EmptyState title="지원 응답이 없습니다." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>학번</th>
                <th>전공</th>
                <th>이메일</th>
                <th>지원 폼</th>
                <th>평가</th>
                <th>결과</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  className="clickable-row"
                  key={row.id}
                  onClick={() => navigate(`/recruit/responses/${row.id}`)}
                >
                  <td>{row.applicantName}</td>
                  <td>{row.studentId ?? "-"}</td>
                  <td>{row.major ?? "-"}</td>
                  <td>{row.email ?? "-"}</td>
                  <td>{row.formTitle ?? "-"}</td>
                  <td>{row.rating ?? "-"}</td>
                  <td>{row.result ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
