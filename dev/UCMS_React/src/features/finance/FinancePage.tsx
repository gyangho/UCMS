import { useEffect, useMemo, useState } from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";

interface SettlementParticipant {
  id: number;
  name: string;
  studentId?: string | null;
  amount: number;
  paid: boolean;
}

interface Settlement {
  id: number;
  title: string;
  createdAt?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  dutchPay: boolean;
  status: "active" | "completed" | string;
  amount: number;
  paidCount: number;
  participantCount: number;
  participants?: SettlementParticipant[];
}

export function FinancePage() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 2026-07-16: Settlement lists now use finance contract rows and no longer synthesize demo participants.
  useEffect(() => {
    let ignore = false;

    async function loadSettlements() {
      try {
        const data = await requestData<{ settlements: Settlement[] }>("/api/finance/settlements");
        if (!ignore) {
          setSettlements(data.settlements);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "정산 목록을 불러오지 못했습니다.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadSettlements();
    return () => {
      ignore = true;
    };
  }, []);

  const activeSettlements = useMemo(
    () => settlements.filter((settlement) => settlement.status !== "completed"),
    [settlements]
  );
  const completedSettlements = useMemo(
    () => settlements.filter((settlement) => settlement.status === "completed"),
    [settlements]
  );

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
          <h1>정산 관리</h1>
        </div>
      </div>

      <SettlementTable title="진행 중인 정산" settlements={activeSettlements} showProgress />
      <SettlementTable title="완료된 정산" settlements={completedSettlements} />
    </section>
  );
}

export function FinanceDetailPage({ path }: { path: string }) {
  const settlementId = Number(path.split("/").at(-1));
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 2026-07-16: Detail view fetches the selected settlement so paid counts match the contract API.
  useEffect(() => {
    let ignore = false;

    async function loadSettlement() {
      try {
        const data = await requestData<{ settlement: Settlement }>(
          `/api/finance/settlements/${settlementId}`
        );
        if (!ignore) {
          setSettlement(data.settlement);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "정산 상세를 불러오지 못했습니다.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadSettlement();
    return () => {
      ignore = true;
    };
  }, [settlementId]);

  if (isLoading) {
    return <LoadingState />;
  }

  if (error || !settlement) {
    return <ErrorState message={error ?? "정산을 찾을 수 없습니다."} />;
  }

  return (
    <section className="settlement-detail-page">
      <div className="settlement-detail-card">
        <div className="settlement-detail-heading">
          <h1>{settlement.title}</h1>
          <span className="status-pill active">{formatStatus(settlement.status)}</span>
        </div>

        <dl className="settlement-summary">
          <div>
            <dt>총 금액</dt>
            <dd>{formatCurrency(settlement.amount)}</dd>
          </div>
          <div>
            <dt>마감일</dt>
            <dd>{settlement.dueDate ? formatDate(settlement.dueDate) : "-"}</dd>
          </div>
          <div>
            <dt>더치페이</dt>
            <dd>{settlement.dutchPay ? "예" : "아니오"}</dd>
          </div>
          <div>
            <dt>완료일</dt>
            <dd>{settlement.completedAt ? formatDate(settlement.completedAt) : "-"}</dd>
          </div>
        </dl>

        <section className="settlement-participants-section">
          <h2>참여자 목록</h2>
          {(settlement.participants ?? []).length === 0 ? (
            <EmptyState title="정산 참여자가 없습니다." />
          ) : (
            <div className="settlement-participant-grid">
              {(settlement.participants ?? []).map((participant) => (
                <article className="settlement-participant-card" key={participant.id}>
                  <div>
                    <strong>{participant.name}</strong>
                    <span>{participant.studentId ?? "-"}</span>
                  </div>
                  <div>
                    <strong>{formatCurrency(participant.amount)}</strong>
                    <span
                      className={
                        participant.paid ? "status-pill active" : "status-pill inactive"
                      }
                    >
                      {participant.paid ? "결제 완료" : "미납"}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function SettlementTable({
  title,
  settlements,
  showProgress = false
}: {
  title: string;
  settlements: Settlement[];
  showProgress?: boolean;
}) {
  return (
    <section className="stack-page">
      <h2 className="section-title">{title}</h2>
      {settlements.length === 0 ? (
        <EmptyState title="표시할 정산이 없습니다." />
      ) : (
        <div className="table-wrap">
          <table className="data-table board-table">
            <thead>
              <tr>
                <th>제목</th>
                <th>생성 일시</th>
                {showProgress ? <th>진행률</th> : null}
              </tr>
            </thead>
            <tbody>
              {settlements.map((settlement) => {
                const progress =
                  settlement.participantCount > 0
                    ? Math.round((settlement.paidCount / settlement.participantCount) * 100)
                    : 0;

                return (
                  <tr
                    className="clickable-row"
                    key={settlement.id}
                    onClick={() => navigate(`/finance/${settlement.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        navigate(`/finance/${settlement.id}`);
                      }
                    }}
                    tabIndex={0}
                  >
                    <td>{settlement.title}</td>
                    <td>{settlement.createdAt ? formatDate(settlement.createdAt) : "-"}</td>
                    {showProgress ? (
                      <td>
                        <div className="progress-cell">
                          <progress value={progress} max={100} />
                          <span>
                            {settlement.paidCount}/{settlement.participantCount}명
                          </span>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatCurrency(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ko-KR");
}

function formatStatus(status: string) {
  return status === "completed" ? "완료" : "진행 중";
}
