import { useState } from "react";
import { requestData } from "../../shared/api/http";

export function AdminPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 2026-07-16: Holiday import now calls the contract API so admin actions are checked against the Node backend.
  async function importHolidays() {
    setError(null);
    setMessage(null);
    try {
      const data = await requestData<{ imported: number }>("/api/admin/holidays/import", {
        method: "POST"
      });
      setMessage(`${data.imported}건의 공휴일을 반영했습니다.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "공휴일을 불러오지 못했습니다.");
    }
  }

  return (
    <section className="stack-page narrow">
      <div className="page-heading">
        <div>
          <h1>관리자 페이지</h1>
        </div>
      </div>

      {message ? <div className="page-state success">{message}</div> : null}
      {error ? <div className="page-state error">{error}</div> : null}

      <section className="data-card">
        <div>
          <h2>공휴일 불러오기</h2>
          <span className="status-pill">API 연동</span>
        </div>
        <p>공휴일 데이터를 일정에 반영합니다.</p>
        <div className="card-actions">
          <button type="button" onClick={importHolidays}>
            공휴일 불러오기
          </button>
        </div>
      </section>
    </section>
  );
}
