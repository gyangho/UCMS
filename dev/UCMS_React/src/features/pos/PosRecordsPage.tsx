import { useEffect, useMemo, useState } from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";

interface PosRecordItem {
  productId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  isService: boolean;
}

interface PosRecord {
  id: number;
  purchaseTime: string;
  items: PosRecordItem[];
  totalPrice: number;
}

export function PosRecordsPage({ path }: { path: string }) {
  const instanceId = Number(path.match(/\d+/)?.[0] ?? 0);
  const [records, setRecords] = useState<PosRecord[]>([]);
  const [instanceName, setInstanceName] = useState(`POS #${instanceId}`);
  const [canManage, setCanManage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadRecords() {
      try {
        const data = await requestData<{
          instance?: { name?: string };
          records: PosRecord[];
          canManage?: boolean;
        }>(`/api/pos/instances/${instanceId}/records`);
        if (!ignore) {
          setRecords(data.records ?? []);
          setInstanceName(data.instance?.name ?? `POS #${instanceId}`);
          setCanManage(Boolean(data.canManage));
        }
      } catch (loadError) {
        if (!ignore) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "판매 기록을 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    loadRecords();
    return () => {
      ignore = true;
    };
  }, [instanceId]);

  const totalPrice = useMemo(
    () =>
      records.reduce(
        (sum, record) => sum + Number(record.totalPrice || 0),
        0,
      ),
    [records],
  );

  async function deleteRecord(id: number) {
    if (!window.confirm("이 판매 기록을 삭제하시겠습니까?")) return;
    await requestData(`/api/pos/records/${id}`, { method: "DELETE" });
    setRecords((current) => current.filter((record) => record.id !== id));
  }

  async function clearRecords() {
    if (!window.confirm("이 인스턴스의 판매 기록을 모두 삭제하시겠습니까?")) {
      return;
    }
    await requestData(`/api/pos/instances/${instanceId}/records/clear`, {
      method: "POST",
    });
    setRecords([]);
  }

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <section className="stack-page pos-page">
      <div className="page-heading">
        <div>
          <h1>{instanceName} 판매 기록</h1>
          <p>서비스 품목은 결제 금액에서 제외됩니다.</p>
        </div>
        <div className="toolbar">
          <button
            type="button"
            onClick={() => navigate(`/pos/instances/${instanceId}`)}
          >
            인스턴스 상세
          </button>
          {canManage && records.length ? (
            <button
              className="danger-button"
              type="button"
              onClick={clearRecords}
            >
              전체 삭제
            </button>
          ) : null}
        </div>
      </div>

      {records.length === 0 ? (
        <EmptyState title="판매 기록이 없습니다." />
      ) : (
        <div className="table-wrap">
          <table className="data-table pos-record-table">
            <thead>
              <tr>
                <th>판매 시각</th>
                <th>품목</th>
                <th>결제 금액</th>
                {canManage ? <th>관리</th> : null}
              </tr>
            </thead>
            <tbody>
              {/* 2026-07-23: 영수증별 품목과 서비스 여부를 한 행에서 확인할 수 있게 표시한다. */}
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{formatDate(record.purchaseTime)}</td>
                  <td>
                    <div className="pos-record-items">
                      {record.items.map((item, index) => (
                        <span
                          className={item.isService ? "service" : ""}
                          key={`${record.id}-${item.productId}-${index}`}
                        >
                          {item.name} × {item.quantity}
                          {item.isService ? " · 서비스" : ""}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>{formatCurrency(record.totalPrice)}</td>
                  {canManage ? (
                    <td>
                      <button
                        className="danger-button"
                        type="button"
                        onClick={() => deleteRecord(record.id)}
                      >
                        삭제
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={2}>총 판매 금액</th>
                <th>{formatCurrency(totalPrice)}</th>
                {canManage ? <th /> : null}
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
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}
