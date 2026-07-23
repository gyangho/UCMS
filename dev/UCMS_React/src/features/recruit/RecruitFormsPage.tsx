import { useCallback, useEffect, useMemo, useState } from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";

const RATINGS = ["대기", "1차합격", "1차불합격", "느별", "느괜", "느좋", "최종합격", "불합격"];
const PAGE_SIZE = 10;

interface RecruitResponseRow {
  id: number;
  applicantName: string;
  studentId?: string | null;
  major?: string | null;
  phoneNumber?: string | null;
  gender?: string | null;
  formId: string;
  formTitle?: string | null;
  rating?: string | null;
}

export function RecruitFormsPage() {
  const [rows, setRows] = useState<RecruitResponseRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedFormId, setSelectedFormId] = useState("");
  const [sortBy, setSortBy] = useState("response");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  // 2026-07-23: Rebuild the response workspace around recruiting_members fields and legacy controls.
  const loadResponses = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await requestData<{ responses: RecruitResponseRow[] }>("/api/recruit/responses");
      setRows(data.responses ?? []);
      setSelectedFormId((current) => current || data.responses?.[0]?.formId || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "지원자 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResponses();
  }, [loadResponses]);

  const forms = useMemo(() => {
    const entries = new Map<string, string>();
    rows.forEach((row) => entries.set(row.formId, row.formTitle || row.formId));
    return [...entries.entries()].map(([id, title]) => ({ id, title }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
    const selected = rows.filter((row) => !selectedFormId || row.formId === selectedFormId);
    const filtered = normalizedQuery
      ? selected.filter((row) =>
          [row.studentId, row.applicantName, row.major, row.phoneNumber, row.gender, row.rating]
            .filter(Boolean)
            .some((value) => String(value).toLocaleLowerCase("ko-KR").includes(normalizedQuery))
        )
      : selected;
    return [...filtered].sort((a, b) => {
      if (sortBy === "studentId") return (a.studentId || "").localeCompare(b.studentId || "");
      if (sortBy === "name") return a.applicantName.localeCompare(b.applicantName, "ko");
      if (sortBy === "major") return (a.major || "").localeCompare(b.major || "", "ko");
      return a.id - b.id;
    });
  }, [query, rows, selectedFormId, sortBy]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visibleRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectedForm = forms.find((form) => form.id === selectedFormId);

  useEffect(() => {
    setPage(1);
  }, [query, selectedFormId, sortBy]);

  async function handleSync() {
    setMessage(null);
    try {
      const data = await requestData<{ syncedCount?: number; message?: string }>("/api/recruit/sync", {
        method: "POST",
        body: JSON.stringify({ formId: selectedFormId })
      });
      setMessage(data.message ?? `${data.syncedCount ?? 0}건을 동기화했습니다.`);
      await loadResponses();
    } catch (syncError) {
      setMessage(syncError instanceof Error ? syncError.message : "응답을 동기화하지 못했습니다.");
    }
  }

  async function updateRating(row: RecruitResponseRow, rating: string) {
    const previousRating = row.rating;
    setRows((current) => current.map((item) => (item.id === row.id ? { ...item, rating } : item)));
    try {
      await requestData<{ id: number }>(`/api/recruit/responses/${row.id}/rating`, {
        method: "PATCH",
        body: JSON.stringify({ rating })
      });
    } catch (ratingError) {
      setRows((current) =>
        current.map((item) => (item.id === row.id ? { ...item, rating: previousRating } : item))
      );
      setMessage(ratingError instanceof Error ? ratingError.message : "평가를 변경하지 못했습니다.");
    }
  }

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <section className="stack-page recruit-page">
      <div className="page-heading recruit-heading">
        <div>
          {/* 2026-07-23: Keep page headings Korean-only without English eyebrow text. */}
          <h1>신입부원 응답자 목록</h1>
          <p>지원자 정보를 검토하고 단계별 평가를 관리합니다.</p>
        </div>
        <div className="toolbar">
          <button
            className="secondary-button"
            disabled={!selectedFormId}
            type="button"
            onClick={() => window.open(`https://docs.google.com/forms/d/${selectedFormId}`, "_blank")}
          >
            구글 폼 열기
          </button>
          <button
            className="secondary-button"
            disabled={!selectedFormId}
            type="button"
            onClick={() => window.open(`/api/recruit/download-excel?formId=${selectedFormId}`, "_blank")}
          >
            Excel 다운로드
          </button>
          <button type="button" onClick={handleSync}>응답 동기화</button>
        </div>
      </div>

      {message ? <div className="page-state success">{message}</div> : null}

      <section className="filter-panel recruit-filter-panel">
        <label>
          현재 폼
          <select value={selectedFormId} onChange={(event) => setSelectedFormId(event.target.value)}>
            {forms.map((form) => <option key={form.id} value={form.id}>{form.title}</option>)}
          </select>
        </label>
        <label>
          정렬 기준
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="response">응답순</option>
            <option value="studentId">학번순</option>
            <option value="name">이름순</option>
            <option value="major">학과순</option>
          </select>
        </label>
        <label className="wide-filter">
          지원자 검색
          <input
            value={query}
            placeholder="학번, 이름, 학과, 전화번호로 검색"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="filter-result">
          <strong>{filteredRows.length}</strong>
          <span>명</span>
        </div>
      </section>

      {visibleRows.length === 0 ? (
        <EmptyState title={selectedForm ? `${selectedForm.title}의 지원 응답이 없습니다.` : "지원 응답이 없습니다."} />
      ) : (
        <div className="table-wrap recruit-table-wrap">
          <table className="data-table recruit-table">
            <thead>
              <tr><th>학번</th><th>이름</th><th>학과(부)</th><th>전화번호</th><th>성별</th><th>평가</th></tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  className="clickable-row"
                  key={row.id}
                  tabIndex={0}
                  onClick={() => navigate(`/recruit/responses/${row.id}`)}
                  onKeyDown={(event) => event.key === "Enter" && navigate(`/recruit/responses/${row.id}`)}
                >
                  <td>{row.studentId ?? "-"}</td><td><strong>{row.applicantName}</strong></td>
                  <td>{row.major ?? "-"}</td><td>{row.phoneNumber ?? "-"}</td><td>{row.gender ?? "-"}</td>
                  <td onClick={(event) => event.stopPropagation()}>
                    <select
                      className={`rating-select rating-${row.rating ?? "대기"}`}
                      aria-label={`${row.applicantName} 평가`}
                      value={row.rating ?? "대기"}
                      onChange={(event) => updateRating(row, event.target.value)}
                    >
                      {RATINGS.map((rating) => <option key={rating} value={rating}>{rating}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 ? (
        <nav className="pagination" aria-label="지원자 목록 페이지">
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
            <button
              className={pageNumber === page ? "active" : ""}
              key={pageNumber}
              type="button"
              onClick={() => setPage(pageNumber)}
            >{pageNumber}</button>
          ))}
        </nav>
      ) : null}
    </section>
  );
}
