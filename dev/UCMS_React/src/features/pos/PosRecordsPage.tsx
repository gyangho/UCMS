import { useEffect, useMemo, useState } from "react";
import { requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";

type PosRecord = Record<string, string | number | boolean | null>;

export function PosRecordsPage({ path }: { path: string }) {
  const instanceId = Number(path.match(/\d+/)?.[0] ?? 0);
  const [records, setRecords] = useState<PosRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 2026-07-16: POS records now come from /api/pos/instances/:id/records and destructive actions call the contract API.
  useEffect(() => {
    let ignore = false;

    async function loadRecords() {
      try {
        const data = await requestData<{ records: PosRecord[] }>(
          `/api/pos/instances/${instanceId}/records`
        );
        if (!ignore) {
          setRecords(data.records);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "판매 기록을 불러오지 못했습니다.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadRecords();
    return () => {
      ignore = true;
    };
  }, [instanceId]);

  const productColumns = useMemo(() => {
    const ignored = new Set(["id", "purchaseTime", "purchase_time", "totalPrice", "total_price", "paid"]);
    return Array.from(new Set(records.flatMap((record) => Object.keys(record)))).filter(
      (key) => !ignored.has(key)
    );
  }, [records]);

  const summary = useMemo(() => {
    return records.reduce<Record<string, number>>((accumulator, record) => {
      for (const column of productColumns) {
        accumulator[column] = (accumulator[column] ?? 0) + Number(record[column] ?? 0);
      }
      accumulator.totalPrice =
        (accumulator.totalPrice ?? 0) + Number(record.totalPrice ?? record.total_price ?? 0);
      return accumulator;
    }, {});
  }, [productColumns, records]);

  async function deleteRecord(id: string | number) {
    await requestData(`/api/pos/records/${id}`, { method: "DELETE" });
    setRecords((currentRecords) =>
      currentRecords.filter((record) => String(record.id) !== String(id))
    );
  }

  async function clearRecords() {
    await requestData(`/api/pos/instances/${instanceId}/records/clear`, { method: "POST" });
    setRecords([]);
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
          <h1>POS #{instanceId} 판매 기록</h1>
        </div>
        <div className="toolbar">
          <button type="button" onClick={clearRecords}>
            전체 삭제
          </button>
        </div>
      </div>

      {records.length === 0 ? (
        <EmptyState title="판매 기록이 없습니다." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>시간</th>
                {productColumns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
                <th>합계</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={String(record.id)}>
                  <td>{formatDate(String(record.purchaseTime ?? record.purchase_time ?? ""))}</td>
                  {productColumns.map((column) => (
                    <td key={column}>{String(record[column] ?? 0)}</td>
                  ))}
                  <td>{formatCurrency(Number(record.totalPrice ?? record.total_price ?? 0))}</td>
                  <td>
                    <button type="button" onClick={() => deleteRecord(String(record.id))}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>합계</th>
                {productColumns.map((column) => (
                  <th key={column}>{summary[column] ?? 0}</th>
                ))}
                <th>{formatCurrency(summary.totalPrice ?? 0)}</th>
                <th />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

function formatDate(value: string) {
  return value ? new Date(value).toLocaleString("ko-KR") : "-";
}

function formatCurrency(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}
