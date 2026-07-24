import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";

interface SettlementParticipant {
  id: number;
  memberId?: string;
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
  canEdit?: boolean;
  canDelete?: boolean;
}

interface MemberOption {
  id: string;
  name: string;
  studentId: string;
}

interface CreateSettlementParticipant {
  name: string;
  studentId: string;
  amount: number;
}

interface SettlementFormState {
  title: string;
  amount: string;
  dueDate: string;
  dutchPay: boolean;
}

const EMPTY_FORM: SettlementFormState = {
  title: "",
  amount: "",
  dueDate: "",
  dutchPay: true,
};

export function FinancePage() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettlements = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await requestData<{
        activeSettlements?: Settlement[];
        completedSettlements?: Settlement[];
      }>("/api/finance/settlements");
      setSettlements([
        ...(data.activeSettlements ?? []),
        ...(data.completedSettlements ?? []),
      ]);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "정산 목록을 불러오지 못했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettlements();
  }, [loadSettlements]);

  const activeSettlements = useMemo(
    () => settlements.filter((item) => item.status !== "completed"),
    [settlements],
  );
  const completedSettlements = useMemo(
    () => settlements.filter((item) => item.status === "completed"),
    [settlements],
  );

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <section className="stack-page finance-page">
      <div className="page-heading finance-heading">
        <div>
          <h1>정산 관리</h1>
          <p>회비와 행사 비용의 납부 현황을 확인합니다.</p>
        </div>
        <div className="toolbar">
          {/* 2026-07-23: 정산 생성은 목록의 인라인 폼 대신 독립 페이지에서 진행한다. */}
          <button type="button" onClick={() => navigate("/finance/new")}>
            새 정산
          </button>
        </div>
      </div>

      <SettlementSection
        title="진행 중 정산"
        settlements={activeSettlements}
        defaultOpen
      />
      <SettlementSection
        title="완료된 정산"
        settlements={completedSettlements}
        completed
      />
    </section>
  );
}

function SettlementSection({
  title,
  settlements,
  completed = false,
  defaultOpen = false,
}: {
  title: string;
  settlements: Settlement[];
  completed?: boolean;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="settlement-section">
      <button
        aria-expanded={isOpen}
        className="settlement-section-toggle"
        type="button"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="settlement-toggle-arrow">{isOpen ? "^" : ">"}</span>
        <strong>{title}</strong>
        <span>{settlements.length}건</span>
      </button>
      {isOpen ? (
        settlements.length === 0 ? (
          <EmptyState title={`표시할 ${title}이 없습니다.`} />
        ) : (
          <div className="settlement-list">
            <div
              className={`settlement-list-head${completed ? " completed" : ""}`}
            >
              <span>정산명</span>
              <span>금액</span>
              <span>인원 수</span>
              <span>마감일</span>
              {completed ? <span>완료일</span> : null}
            </div>
            {settlements.map((settlement) => (
              <button
                className={`settlement-list-row${completed ? " completed" : ""}`}
                key={settlement.id}
                type="button"
                onClick={() => navigate(`/finance/${settlement.id}`)}
              >
                <strong>{settlement.title}</strong>
                <span>{formatCurrency(settlement.amount)}</span>
                <span>{settlement.participantCount}명</span>
                <span>{formatDate(settlement.dueDate)}</span>
                {completed ? (
                  <span>{formatDate(settlement.completedAt)}</span>
                ) : null}
              </button>
            ))}
          </div>
        )
      ) : null}
    </section>
  );
}

export function FinanceDetailPage({ path }: { path: string }) {
  const settlementId = Number(path.match(/\d+/)?.[0]);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadSettlement = useCallback(async () => {
    try {
      const data = await requestData<{
        settlement: Settlement;
        participants?: SettlementParticipant[];
      }>(`/api/finance/settlements/${settlementId}`);
      setSettlement({
        ...data.settlement,
        participants:
          data.participants ?? data.settlement.participants ?? [],
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "정산 상세를 불러오지 못했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [settlementId]);

  useEffect(() => {
    loadSettlement();
  }, [loadSettlement]);

  async function completeSettlement() {
    await requestData<{ status: string }>(
      `/api/finance/settlements/${settlementId}/complete`,
      { method: "POST" },
    );
    setMessage("정산을 완료 처리했습니다.");
    await loadSettlement();
  }

  async function deleteSettlement() {
    if (!window.confirm("이 정산을 삭제하시겠습니까?")) return;
    await requestData(`/api/finance/settlements/${settlementId}`, {
      method: "DELETE",
    });
    navigate("/finance");
  }

  if (isLoading) return <LoadingState />;
  if (error || !settlement) {
    return <ErrorState message={error ?? "정산을 찾을 수 없습니다."} />;
  }

  const progress = settlement.participantCount
    ? Math.round((settlement.paidCount / settlement.participantCount) * 100)
    : 0;

  return (
    <section className="stack-page settlement-detail-page">
      <div className="page-heading">
        <button
          className="text-button"
          type="button"
          onClick={() => navigate("/finance")}
        >
          정산 목록으로
        </button>
        <div className="toolbar">
          {settlement.canEdit ? (
            <button
              type="button"
              onClick={() => navigate(`/finance/${settlementId}/edit`)}
            >
              정산 수정
            </button>
          ) : null}
          {settlement.canEdit && settlement.status !== "completed" ? (
            <button
              className="success-button"
              type="button"
              onClick={completeSettlement}
            >
              정산 완료
            </button>
          ) : null}
          {settlement.canDelete ? (
            <button
              className="danger-button"
              type="button"
              onClick={deleteSettlement}
            >
              정산 삭제
            </button>
          ) : null}
        </div>
      </div>
      {message ? <div className="page-state success">{message}</div> : null}
      <div className="settlement-detail-card">
        <div className="settlement-detail-heading">
          <h1>{settlement.title}</h1>
          <span
            className={`status-pill ${
              settlement.status === "completed" ? "completed" : "active"
            }`}
          >
            {settlement.status === "completed" ? "완료" : "진행 중"}
          </span>
        </div>
        <dl className="settlement-summary">
          <div>
            <dt>총 금액</dt>
            <dd>{formatCurrency(settlement.amount)}</dd>
          </div>
          <div>
            <dt>마감일</dt>
            <dd>{formatDate(settlement.dueDate)}</dd>
          </div>
          <div>
            <dt>더치페이</dt>
            <dd>{settlement.dutchPay ? "예" : "아니요"}</dd>
          </div>
          <div>
            <dt>완료일</dt>
            <dd>{formatDate(settlement.completedAt)}</dd>
          </div>
        </dl>
        <div className="settlement-progress">
          <progress max={100} value={progress} />
          <span>
            {settlement.paidCount}/{settlement.participantCount}명 납부 완료 (
            {progress}%)
          </span>
        </div>
        <section className="settlement-participants-section">
          <h2>참여자 목록</h2>
          {(settlement.participants ?? []).length === 0 ? (
            <EmptyState title="정산 참여자가 없습니다." />
          ) : (
            <div className="settlement-participant-grid">
              {/* 2026-07-23: 상세 참여자 카드는 조회 전용이며 납부 변경은 수정 화면에서만 수행한다. */}
              {settlement.participants!.map((participant) => (
                <article
                  className="settlement-participant-card"
                  key={participant.id}
                >
                  <div>
                    <strong>{participant.name}</strong>
                    <span>{participant.studentId ?? "-"}</span>
                  </div>
                  <div>
                    <strong>{formatCurrency(participant.amount)}</strong>
                    <span
                      className={`payment-badge ${
                        participant.paid ? "paid" : "pending"
                      }`}
                    >
                      {participant.paid ? "납부 완료" : "미납"}
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

export function FinanceFormPage({
  mode,
  path,
}: {
  mode: "create" | "edit";
  path?: string;
}) {
  const settlementId = Number(path?.match(/\d+/)?.[0] ?? 0);
  const [form, setForm] = useState<SettlementFormState>(EMPTY_FORM);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [createParticipants, setCreateParticipants] = useState<
    CreateSettlementParticipant[]
  >([]);
  const [participants, setParticipants] = useState<SettlementParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(mode === "create");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const memberSearchResults = useMemo(() => {
    const keyword = memberQuery.trim().toLocaleLowerCase("ko-KR");
    if (!keyword) return [];
    const selectedIds = new Set(
      (mode === "create" ? createParticipants : participants).map(
        (participant) => participant.studentId,
      ),
    );
    return members
      .filter(
        (member) =>
          !selectedIds.has(member.studentId) &&
          `${member.name} ${member.studentId}`
            .toLocaleLowerCase("ko-KR")
            .includes(keyword),
      )
      .slice(0, 10);
  }, [createParticipants, memberQuery, members, mode, participants]);

  useEffect(() => {
    let ignore = false;

    async function loadForm() {
      try {
        if (mode === "create") {
          const data = await requestData<{ members: MemberOption[] }>(
            "/api/members",
          );
          if (!ignore) setMembers(data.members ?? []);
          return;
        }

        const [data, memberData] = await Promise.all([
          requestData<{
            settlement: Settlement;
            participants?: SettlementParticipant[];
          }>(`/api/finance/settlements/${settlementId}`),
          requestData<{ members: MemberOption[] }>("/api/members"),
        ]);
        if (!ignore) {
          const loadedParticipants = data.participants ?? [];
          const normalizedParticipants = data.settlement.dutchPay
            ? distributeAmountsEvenly(
                loadedParticipants,
                data.settlement.amount,
              )
            : loadedParticipants;
          const normalizedTotal =
            !data.settlement.dutchPay && normalizedParticipants.length
              ? sumParticipantAmounts(normalizedParticipants)
              : data.settlement.amount;
          setForm({
            title: data.settlement.title,
            amount: String(normalizedTotal),
            dueDate: toDateInput(data.settlement.dueDate),
            dutchPay: data.settlement.dutchPay,
          });
          setParticipants(normalizedParticipants);
          setMembers(memberData.members ?? []);
          setCanEdit(Boolean(data.settlement.canEdit));
        }
      } catch (loadError) {
        if (!ignore) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "정산 정보를 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    loadForm();
    return () => {
      ignore = true;
    };
  }, [mode, settlementId]);

  function addCreateParticipant(member: MemberOption) {
    setCreateParticipants((current) => {
      const next = [
        ...current,
        {
          name: member.name,
          studentId: member.studentId,
          amount: form.dutchPay
            ? 0
            : current.length
              ? Math.floor(
                  current.reduce(
                    (sum, participant) => sum + participant.amount,
                    0,
                  ) / current.length,
                )
              : Number(form.amount || 0),
        },
      ];
      if (form.dutchPay) {
        return distributeAmountsEvenly(next, Number(form.amount || 0));
      }
      setForm((currentForm) => ({
        ...currentForm,
        amount: String(sumCreateAmounts(next)),
      }));
      return next;
    });
    setMemberQuery("");
  }

  function removeCreateParticipant(studentId: string) {
    setCreateParticipants((current) => {
      const next = current.filter(
        (participant) => participant.studentId !== studentId,
      );
      if (form.dutchPay) {
        return distributeAmountsEvenly(next, Number(form.amount || 0));
      }
      setForm((currentForm) => ({
        ...currentForm,
        amount: String(sumCreateAmounts(next)),
      }));
      return next;
    });
  }

  function changeCreateParticipantAmount(studentId: string, amount: number) {
    setCreateParticipants((current) => {
      const next = current.map((participant) =>
        participant.studentId === studentId
          ? { ...participant, amount: Math.max(0, amount || 0) }
          : participant,
      );
      setForm((currentForm) => ({
        ...currentForm,
        amount: String(sumCreateAmounts(next)),
      }));
      return next;
    });
  }

  function changeTotalAmount(value: string) {
    setForm((current) => ({ ...current, amount: value }));
    if (form.dutchPay) {
      if (mode === "create") {
        setCreateParticipants((current) =>
          distributeAmountsEvenly(current, Number(value || 0)),
        );
      } else {
        setParticipants((current) =>
          distributeAmountsEvenly(current, Number(value || 0)),
        );
      }
    }
  }

  function changeDutchPay(checked: boolean) {
    setForm((current) => ({ ...current, dutchPay: checked }));
    if (checked) {
      if (mode === "create") {
        setCreateParticipants((current) =>
          distributeAmountsEvenly(current, Number(form.amount || 0)),
        );
      } else {
        setParticipants((current) =>
          distributeAmountsEvenly(current, Number(form.amount || 0)),
        );
      }
    }
  }

  function addEditParticipant(member: MemberOption) {
    setParticipants((current) => {
      const next = [
        ...current,
        {
          id: -Date.now(),
          memberId: member.studentId,
          studentId: member.studentId,
          name: member.name,
          paid: false,
          amount: form.dutchPay
            ? 0
            : current.length
              ? Math.floor(sumParticipantAmounts(current) / current.length)
              : Number(form.amount || 0),
        },
      ];
      if (form.dutchPay) {
        return distributeAmountsEvenly(next, Number(form.amount || 0));
      }
      setForm((currentForm) => ({
        ...currentForm,
        amount: String(sumParticipantAmounts(next)),
      }));
      return next;
    });
    setMemberQuery("");
  }

  function removeEditParticipant(studentId?: string | null) {
    if (!studentId) return;
    setParticipants((current) => {
      const next = current.filter(
        (participant) => participant.studentId !== studentId,
      );
      if (form.dutchPay) {
        return distributeAmountsEvenly(next, Number(form.amount || 0));
      }
      setForm((currentForm) => ({
        ...currentForm,
        amount: String(sumParticipantAmounts(next)),
      }));
      return next;
    });
  }

  function updateParticipant(
    participantId: number,
    patch: Partial<Pick<SettlementParticipant, "amount" | "paid">>,
  ) {
    setParticipants((current) => {
      const next = current.map((participant) =>
        participant.id === participantId
          ? { ...participant, ...patch }
          : participant,
      );
      if (patch.amount !== undefined && !form.dutchPay) {
        setForm((currentForm) => ({
          ...currentForm,
          amount: String(sumParticipantAmounts(next)),
        }));
      }
      return next;
    });
  }

  function distributeAmounts() {
    if (!participants.length) return;
    setParticipants((current) =>
      distributeAmountsEvenly(current, Number(form.amount || 0)),
    );
  }

  async function saveSettlement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      if (mode === "create") {
        const created = await requestData<{ id: number; path?: string }>(
          "/api/finance/settlements",
          {
            method: "POST",
            body: JSON.stringify({
              ...form,
              amount: Number(form.amount),
              participants: createParticipants.map((participant) => ({
                memberId: participant.studentId,
                amount: participant.amount,
              })),
            }),
          },
        );
        navigate(created.path ?? `/finance/${created.id}`);
        return;
      }

      await requestData(`/api/finance/settlements/${settlementId}`, {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
          participants: participants.map((participant) => ({
            memberId: participant.memberId ?? participant.studentId,
            amount: participant.amount,
            paid: participant.paid,
          })),
        }),
      });
      navigate(`/finance/${settlementId}`);
    } catch (saveError) {
      setMessage(
        saveError instanceof Error
          ? saveError.message
          : "정산을 저장하지 못했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!canEdit) {
    return <ErrorState message="정산을 수정할 권한이 없습니다." />;
  }

  return (
    <section className="stack-page finance-page finance-form-page">
      <div className="page-heading">
        <div>
          <h1>{mode === "create" ? "정산 생성" : "정산 수정"}</h1>
          <p>
            {mode === "create"
              ? "정산 정보와 참여자를 선택합니다."
              : "정산 정보와 참여자별 납부 상태를 수정합니다."}
          </p>
        </div>
        <div className="toolbar">
          <button
            type="button"
            onClick={() =>
              navigate(mode === "create" ? "/finance" : `/finance/${settlementId}`)
            }
          >
            취소
          </button>
        </div>
      </div>

      {message ? <div className="page-state notice">{message}</div> : null}

      <form className="finance-create-panel" onSubmit={saveSettlement}>
        <div className="section-heading-row">
          <h2>정산 정보</h2>
          <span>
            {mode === "create"
              ? `${createParticipants.length}명 선택`
              : `${participants.length}명 참여`}
          </span>
        </div>
        <div className="finance-form-grid">
          <label>
            정산명
            <input
              required
              value={form.title}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
            />
          </label>
          <label>
            총 금액
            <input
              min={0}
              required
              readOnly={
                !form.dutchPay &&
                (mode === "create"
                  ? createParticipants.length > 0
                  : participants.length > 0)
              }
              type="number"
              value={form.amount}
              onChange={(event) => changeTotalAmount(event.target.value)}
            />
          </label>
          <label>
            마감일
            <input
              required
              type="date"
              value={form.dueDate}
              onChange={(event) =>
                setForm({ ...form, dueDate: event.target.value })
              }
            />
          </label>
          <label className="checkbox-label">
            <input
              checked={form.dutchPay}
              type="checkbox"
              onChange={(event) => changeDutchPay(event.target.checked)}
            />
            균등 분할
          </label>
        </div>

        {mode === "create" ? (
          <fieldset className="participant-picker finance-participant-picker">
            <legend>참여자 ({createParticipants.length}명)</legend>
            <div className="participant-search-picker">
              <label className="participant-search-label">
                참여자 이름 검색
                <input
                  autoComplete="off"
                  placeholder="이름 또는 학번을 입력하세요"
                  type="search"
                  value={memberQuery}
                  onChange={(event) => setMemberQuery(event.target.value)}
                />
              </label>
              {memberQuery.trim() ? (
                memberSearchResults.length ? (
                  <div className="participant-search-results finance-member-results">
                    {memberSearchResults.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => addCreateParticipant(member)}
                      >
                        <span>
                          <strong>{member.name}</strong>
                          <small>{member.studentId}</small>
                        </span>
                        <b>추가</b>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="participant-search-empty">
                    추가할 수 있는 검색 결과가 없습니다.
                  </p>
                )
              ) : (
                <p className="participant-search-help">
                  이름을 입력하면 추가할 수 있는 회원만 표시됩니다.
                </p>
              )}

              {/* 2026-07-23: 생성 참여자를 이름·개별 금액·삭제 버튼의 행 목록으로 관리한다. */}
              {createParticipants.length ? (
                <div className="finance-create-participant-list">
                  <div className="finance-create-participant-head">
                    <span>이름</span>
                    <span>정산할 금액</span>
                    <span>관리</span>
                  </div>
                  {createParticipants.map((participant) => (
                    <div
                      className="finance-create-participant-row"
                      key={participant.studentId}
                    >
                      <span>
                        <strong>{participant.name}</strong>
                        <small>{participant.studentId}</small>
                      </span>
                      {form.dutchPay ? (
                        <strong>{formatCurrency(participant.amount)}</strong>
                      ) : (
                        <label>
                          <span className="sr-only">
                            {participant.name} 정산할 금액
                          </span>
                          <input
                            min={0}
                            type="number"
                            value={participant.amount}
                            onChange={(event) =>
                              changeCreateParticipantAmount(
                                participant.studentId,
                                Number(event.target.value),
                              )
                            }
                          />
                        </label>
                      )}
                      <button
                        aria-label={`${participant.name} 참여자에서 제거`}
                        type="button"
                        onClick={() =>
                          removeCreateParticipant(participant.studentId)
                        }
                      >
                        X
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted-copy">선택된 참여자가 없습니다.</p>
              )}
            </div>
          </fieldset>
        ) : (
          <section className="settlement-payment-editor">
            <div className="section-heading-row">
              <h2>참여자 납부 관리</h2>
              <div className="settlement-payment-actions">
                {form.dutchPay ? (
                  <button type="button" onClick={distributeAmounts}>
                    균등 금액 다시 계산
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    setParticipants((current) =>
                      current.map((participant) => ({
                        ...participant,
                        paid: true,
                      })),
                    )
                  }
                >
                  전체 납부 완료
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setParticipants((current) =>
                      current.map((participant) => ({
                        ...participant,
                        paid: false,
                      })),
                    )
                  }
                >
                  전체 미납
                </button>
              </div>
            </div>
            <div className="participant-search-picker">
              <label className="participant-search-label">
                새 참여자 이름 검색
                <input
                  autoComplete="off"
                  placeholder="이름 또는 학번을 입력하세요"
                  type="search"
                  value={memberQuery}
                  onChange={(event) => setMemberQuery(event.target.value)}
                />
              </label>
              {memberQuery.trim() ? (
                memberSearchResults.length ? (
                  <div className="participant-search-results finance-member-results">
                    {memberSearchResults.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => addEditParticipant(member)}
                      >
                        <span>
                          <strong>{member.name}</strong>
                          <small>{member.studentId}</small>
                        </span>
                        <b>추가</b>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="participant-search-empty">
                    추가할 수 있는 검색 결과가 없습니다.
                  </p>
                )
              ) : (
                <p className="participant-search-help">
                  이름을 입력하면 추가할 수 있는 회원만 표시됩니다.
                </p>
              )}
            </div>
            {participants.length === 0 ? (
              <EmptyState title="정산 참여자가 없습니다." />
            ) : (
              <div className="settlement-payment-list">
                <div className="settlement-payment-head">
                  <span>참여자</span>
                  <span>개별 금액</span>
                  <span>정산 상태</span>
                  <span>관리</span>
                </div>
                {participants.map((participant) => (
                  <div
                    className="settlement-payment-row"
                    key={participant.studentId ?? participant.id}
                  >
                    <span>
                      <strong>{participant.name}</strong>
                      <small>{participant.studentId ?? "-"}</small>
                    </span>
                    {form.dutchPay ? (
                      <strong>{formatCurrency(participant.amount)}</strong>
                    ) : (
                      <label>
                        <span className="sr-only">
                          {participant.name} 개별 금액
                        </span>
                        <input
                          min={0}
                          type="number"
                          value={participant.amount}
                          onChange={(event) =>
                            updateParticipant(participant.id, {
                              amount: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    )}
                    <button
                      className={`settlement-complete-toggle${
                        participant.paid ? " paid" : ""
                      }`}
                      type="button"
                      onClick={() =>
                        updateParticipant(participant.id, {
                          paid: !participant.paid,
                        })
                      }
                    >
                      {participant.paid ? "완료 취소" : "정산 완료"}
                    </button>
                    <button
                      aria-label={`${participant.name} 참여자에서 제거`}
                      className="settlement-participant-remove"
                      type="button"
                      onClick={() =>
                        removeEditParticipant(participant.studentId)
                      }
                    >
                      X
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="card-actions">
          <button
            type="button"
            onClick={() =>
              navigate(mode === "create" ? "/finance" : `/finance/${settlementId}`)
            }
          >
            취소
          </button>
          <button disabled={isSaving} type="submit">
            {isSaving
              ? "저장 중..."
              : mode === "create"
                ? "정산 생성"
                : "수정 저장"}
          </button>
        </div>
      </form>
    </section>
  );
}

function formatCurrency(value: number) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("ko-KR") : "-";
}

function toDateInput(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function distributeAmountsEvenly<T extends { amount: number }>(
  participants: T[],
  totalAmount: number,
) {
  if (!participants.length) return participants;
  const safeTotal = Math.max(0, Math.floor(totalAmount || 0));
  const baseAmount = Math.floor(safeTotal / participants.length);
  const remainder = safeTotal % participants.length;
  return participants.map((participant, index) => ({
    ...participant,
    amount: baseAmount + (index < remainder ? 1 : 0),
  }));
}

function sumCreateAmounts(participants: CreateSettlementParticipant[]) {
  return participants.reduce(
    (sum, participant) => sum + Number(participant.amount || 0),
    0,
  );
}

function sumParticipantAmounts(
  participants: Array<{ amount: number }>,
) {
  return participants.reduce(
    (sum, participant) => sum + Number(participant.amount || 0),
    0,
  );
}
