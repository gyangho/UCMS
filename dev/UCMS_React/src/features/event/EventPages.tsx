import { type FormEvent, useEffect, useMemo, useState } from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";
import { TenMinuteDateTimeInput } from "../../shared/ui/TenMinuteDateTimeInput";

interface EventItem {
  id: number;
  title: string;
  description?: string | null;
  start: string;
  end: string;
  color?: string | null;
  isMultiple?: boolean;
  isRecruiting?: boolean;
  isRecruitingOpen?: boolean;
  isParticipating?: boolean;
  canParticipate?: boolean;
  authority?: string | null;
  recruitStart?: string | null;
  recruitEnd?: string | null;
  authorName?: string | null;
  authorId?: string | number | null;
  canEdit?: boolean;
  canDelete?: boolean;
  participants?: Array<{
    id: number;
    userId: number | null;
    studentId: string;
    name: string;
    role?: string | null;
    status?: string | null;
  }>;
  settlement?: {
    id: number;
    title: string;
    amount: number;
    paidCount: number;
    participantCount: number;
    status: string;
  } | null;
}

interface EventFormState {
  title: string;
  start: string;
  end: string;
  description: string;
  color: string;
  authority: string;
  isRecruiting: boolean;
  recruitStart: string;
  recruitEnd: string;
}

interface EventMemberOption {
  id: string;
  userId?: number | null;
  name: string;
  studentId: string;
}

export function EventCalendarPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [myEvents, setMyEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 2026-07-16: Event calendar now compares React with /api/events and /api/events/my instead of local demo schedules.
  useEffect(() => {
    let ignore = false;

    async function loadEvents() {
      try {
        const [allData, myData] = await Promise.all([
          requestData<{ events: EventItem[] }>("/api/events"),
          requestData<{ events: EventItem[] }>("/api/events/my"),
        ]);
        if (!ignore) {
          setEvents(allData.events);
          setMyEvents(myData.events);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "일정을 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadEvents();
    return () => {
      ignore = true;
    };
  }, []);

  const recruitingEvents = useMemo(
    // 2026-07-23: The recruiting section contains only events whose recruitment window is currently open.
    () => events.filter((event) => Boolean(event.isRecruitingOpen)),
    [events],
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
          <h1>일정</h1>
        </div>
        <div className="toolbar">
          <button type="button" onClick={() => navigate("/event/new")}>
            일정 생성
          </button>
          <button type="button" onClick={() => navigate("/event/myevents")}>
            내 일정
          </button>
        </div>
      </div>

      <EventSection
        title="내 일정"
        events={myEvents}
        emptyTitle="참여 중인 일정이 없습니다."
      />
      <EventSection
        title="모집 중인 일정"
        events={recruitingEvents}
        emptyTitle="모집 중인 일정이 없습니다."
      />
      <EventSection
        title="전체 일정"
        events={events}
        emptyTitle="표시할 일정이 없습니다."
      />
    </section>
  );
}

export function MyEventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 2026-07-16: My events page now validates the session-scoped /api/events/my contract.
  useEffect(() => {
    let ignore = false;

    async function loadEvents() {
      try {
        const data = await requestData<{ events: EventItem[] }>(
          "/api/events/my",
        );
        if (!ignore) {
          setEvents(data.events);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "내 일정을 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadEvents();
    return () => {
      ignore = true;
    };
  }, []);

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
          <h1>내 일정</h1>
        </div>
        <div className="toolbar">
          <button type="button" onClick={() => navigate("/event")}>
            전체 일정
          </button>
        </div>
      </div>
      <EventSection
        title="내 일정"
        events={events}
        emptyTitle="참여 중인 일정이 없습니다."
      />
    </section>
  );
}

function EventSection({
  title,
  events,
  emptyTitle,
}: {
  title: string;
  events: EventItem[];
  emptyTitle: string;
}) {
  const groupedEvents = useMemo(() => groupEvents(events), [events]);

  if (events.length === 0) {
    return (
      <section className="timeline-group">
        <h2>{title}</h2>
        <EmptyState title={emptyTitle} />
      </section>
    );
  }

  return (
    <section className="timeline-group">
      <h2>{title}</h2>
      <div className="timeline">
        {groupedEvents.map((group) => (
          <div className="event-month-group" key={`${title}-${group.month}`}>
            <h3>{group.month}</h3>
            {group.events.map((event) => (
              <article
                className="timeline-item clickable-row"
                key={event.id}
                onClick={() => navigate(`/event/${event.id}`)}
                onKeyDown={(keyEvent) => {
                  if (keyEvent.key === "Enter") {
                    navigate(`/event/${event.id}`);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <span
                  className="event-color"
                  style={{ backgroundColor: event.color ?? "#2563eb" }}
                />
                <div>
                  <h3>{event.title}</h3>
                  <p>{formatRange(event.start, event.end)}</p>
                  {event.description ? <p>{event.description}</p> : null}
                </div>
              </article>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export function EventDetailPage({ path }: { path: string }) {
  const eventId = Number(path.split("/").at(-1));
  const [event, setEvent] = useState<EventItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // 2026-07-23: Keep participation actions responsive and report action failures without replacing event details.
  const [isParticipationSaving, setIsParticipationSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // 2026-07-16: Detail view now fetches the requested event so manage buttons reflect real author/session data.
  useEffect(() => {
    let ignore = false;

    async function loadEvent() {
      try {
        const data = await requestData<{ event: EventItem }>(
          `/api/events/${eventId}`,
        );
        if (!ignore) {
          setEvent(data.event);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "일정 상세를 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadEvent();
    return () => {
      ignore = true;
    };
  }, [eventId]);

  // 2026-07-23: Use the server-authorized event flags so the UI matches the author/executive access rule.
  const canManage = Boolean(event?.canEdit);

  async function toggleMyParticipation() {
    if (!event) return;
    setIsParticipationSaving(true);
    setActionError(null);
    try {
      await requestData<{ status: string }>(
        `/api/events/${event.id}/participants/me`,
        { method: event.isParticipating ? "DELETE" : "POST" },
      );
      const refreshed = await requestData<{ event: EventItem }>(
        `/api/events/${event.id}`,
      );
      setEvent(refreshed.event);
    } catch (participationError) {
      setActionError(
        participationError instanceof Error
          ? participationError.message
          : "참가 상태를 변경하지 못했습니다.",
      );
    } finally {
      setIsParticipationSaving(false);
    }
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (error || !event) {
    return <ErrorState message={error ?? "일정을 찾을 수 없습니다."} />;
  }

  return (
    <section className="stack-page">
      <div className="page-heading">
        <div>
          <h1>{event.title}</h1>
        </div>
        <div className="toolbar">
          <button type="button" onClick={() => navigate("/event")}>
            목록
          </button>
          {canManage ? (
            <>
              <button
                type="button"
                onClick={() => navigate(`/event/${event.id}/edit`)}
              >
                수정
              </button>
            </>
          ) : null}
          {event.canParticipate ? (
            <button
              // 2026-07-23: Give participate and cancel actions distinct, high-visibility colors.
              className={`event-participation-button ${event.isParticipating ? "cancel" : "join"}`}
              disabled={isParticipationSaving}
              type="button"
              onClick={toggleMyParticipation}
            >
              {isParticipationSaving
                ? "처리 중..."
                : event.isParticipating
                  ? "참가 취소"
                  : "참가"}
            </button>
          ) : null}
        </div>
      </div>

      {actionError ? (
        <div className="page-state error" role="alert">
          {actionError}
        </div>
      ) : null}

      <section className="data-card">
        <div>
          <h2>일정 정보</h2>
          <span className="status-pill active">진행</span>
        </div>
        <dl>
          <dt>일시</dt>
          <dd>{formatRange(event.start, event.end)}</dd>
          <dt>작성자</dt>
          <dd>{event.authorName ?? "-"}</dd>
          <dt>공개 범위</dt>
          <dd>{event.authority ?? "일반"}</dd>
          <dt>일정 유형</dt>
          <dd>{event.isMultiple ? "여러 날 일정" : "단일 일정"}</dd>
          {event.isRecruiting ? (
            <>
              <dt>참가 모집</dt>
              <dd>
                {event.recruitStart && event.recruitEnd
                  ? `${formatRange(event.recruitStart, event.recruitEnd)} (${event.isRecruitingOpen ? "모집 중" : "모집 마감"})`
                  : "모집 중"}
              </dd>
            </>
          ) : null}
          <dt>설명</dt>
          <dd>{event.description ?? "-"}</dd>
        </dl>
      </section>

      {event.isRecruiting || event.settlement ? (
      <div className={event.isRecruiting && event.settlement ? "two-column" : "data-grid single"}>
        {event.isRecruiting ? <section className="data-card">
          {/* 2026-07-22: Participant details show only names and expose the total count. */}
          <h2>참여자 ({(event.participants ?? []).length}명)</h2>
          {(event.participants ?? []).length === 0 ? (
            <EmptyState title="참여자가 없습니다." />
          ) : (
            <ul className="participant-name-list">
              {(event.participants ?? []).map((participant) => (
                <li key={participant.id}>{participant.name}</li>
              ))}
            </ul>
          )}
        </section> : null}

        {event.settlement ? <section className="data-card">
          {/* 2026-08-23: Hide empty settlement chrome when the event has no linked settlement. */}
          <h2>관련 정산</h2>
            <dl>
              <dt>제목</dt>
              <dd>
                <button
                  className="link-button"
                  type="button"
                  onClick={() => navigate(`/finance/${event.settlement!.id}`)}
                >
                  {event.settlement.title}
                </button>
              </dd>
              <dt>금액</dt>
              <dd>{formatCurrency(event.settlement.amount)}</dd>
              <dt>진행</dt>
              <dd>
                {event.settlement.paidCount}/{event.settlement.participantCount}
                명
              </dd>
              <dt>상태</dt>
              <dd>{event.settlement.status}</dd>
            </dl>
        </section> : null}
      </div>
      ) : null}
    </section>
  );
}

export function EventFormPage({
  mode,
  path,
}: {
  mode: "create" | "edit";
  path?: string;
}) {
  const eventId = path ? Number(path.match(/\d+/)?.[0]) : null;
  const [form, setForm] = useState<EventFormState>({
    title: "",
    start: "",
    end: "",
    description: "",
    color: "#2563eb",
    authority: "일반",
    isRecruiting: false,
    recruitStart: "",
    recruitEnd: "",
  });
  const [availableMembers, setAvailableMembers] = useState<EventMemberOption[]>(
    [],
  );
  // 2026-07-23: Send linked user IDs; the API resolves them for both deployed and documented participant schemas.
  const [participantIds, setParticipantIds] = useState<number[]>([]);
  const [participantQuery, setParticipantQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(mode === "edit");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // 2026-07-23: Keep every selected participant visible while showing new candidates only after a name search.
  const selectedParticipantMembers = useMemo(
    () =>
      availableMembers.filter(
        (member) =>
          member.userId != null && participantIds.includes(member.userId),
      ),
    [availableMembers, participantIds],
  );
  const participantSearchResults = useMemo(() => {
    const normalizedQuery = participantQuery.trim().toLocaleLowerCase("ko-KR");
    if (!normalizedQuery) return [];
    return availableMembers
      .filter(
        (member) =>
          member.userId != null &&
          !participantIds.includes(member.userId) &&
          member.name.toLocaleLowerCase("ko-KR").includes(normalizedQuery),
      )
      .slice(0, 10);
  }, [availableMembers, participantIds, participantQuery]);

  // 2026-07-23: Load every event column represented in schemalist.sql for the edit form.
  useEffect(() => {
    if (mode !== "edit" || !eventId) {
      return;
    }

    let ignore = false;

    async function loadEvent() {
      try {
        const data = await requestData<{ event: EventItem }>(
          `/api/events/${eventId}`,
        );
        const item = data.event;
        if (!item.canEdit) {
          throw new Error("이 일정을 수정할 권한이 없습니다.");
        }
        const memberData = await requestData<{ members: EventMemberOption[] }>(
          "/api/members",
        );
        if (!ignore) {
          setForm({
            title: item.title,
            start: toDateTimeLocal(item.start),
            end: toDateTimeLocal(item.end),
            description: item.description ?? "",
            color: item.color ?? "#2563eb",
            authority: item.authority ?? "일반",
            isRecruiting: Boolean(item.isRecruiting),
            recruitStart: item.recruitStart
              ? toDateTimeLocal(item.recruitStart)
              : "",
            recruitEnd: item.recruitEnd ? toDateTimeLocal(item.recruitEnd) : "",
          });
          setAvailableMembers(
            (memberData.members ?? []).filter(
              (member) => member.userId != null,
            ),
          );
          setParticipantIds(
            (item.participants ?? [])
              .map((participant) => participant.userId)
              .filter((userId): userId is number => Number.isFinite(userId)),
          );
        }
      } catch (loadError) {
        if (!ignore) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "일정을 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadEvent();
    return () => {
      ignore = true;
    };
  }, [eventId, mode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setActionError(null);
    try {
      // 2026-07-23: Preserve local event and recruiting times for MySQL DATETIME columns.
      const data = await requestData<{ id: number }>(
        mode === "edit" && eventId ? `/api/events/${eventId}` : "/api/events",
        {
          method: mode === "edit" ? "PUT" : "POST",
          body: JSON.stringify({
            ...form,
            start: toMysqlDateTime(form.start),
            end: toMysqlDateTime(form.end),
            recruitStart: form.recruitStart
              ? toMysqlDateTime(form.recruitStart)
              : null,
            recruitEnd: form.recruitEnd
              ? toMysqlDateTime(form.recruitEnd)
              : null,
            ...(mode === "edit" ? { participantIds } : {}),
          }),
        },
      );
      navigate(`/event/${data.id}`);
    } catch (saveError) {
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : "일정을 저장하지 못했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteEvent() {
    if (!eventId || !window.confirm("이 일정을 삭제하시겠습니까?")) {
      return;
    }

    setIsDeleting(true);
    setActionError(null);
    try {
      // 2026-07-22: Event owners and managers can delete from the edit page.
      await requestData<{ message: string }>(`/api/events/${eventId}`, {
        method: "DELETE",
      });
      navigate("/event");
    } catch (deleteError) {
      setActionError(
        deleteError instanceof Error
          ? deleteError.message
          : "일정을 삭제하지 못했습니다.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  return (
    <section className="stack-page event-form-page">
      <div className="page-heading">
        <div>
          <h1>{mode === "create" ? "일정 생성" : "일정 수정"}</h1>
        </div>
      </div>

      <form className="form-panel event-form-panel" onSubmit={submit}>
        {actionError ? (
          <div className="page-state error">{actionError}</div>
        ) : null}
        <label>
          제목
          <input
            value={form.title}
            onChange={(event) => setFormField("title", event.target.value)}
            placeholder="일정 제목"
            required
          />
        </label>
        {/* 2026-08-23: Native date-time pickers offer ten-minute increments across UCMS. */}
        <div className="event-form-grid">
          <TenMinuteDateTimeInput label="시작 일시" value={form.start} onChange={(value) => setFormField("start", value)} required />
          <TenMinuteDateTimeInput label="종료 일시" value={form.end} onChange={(value) => setFormField("end", value)} required />
          <label>
            공개 범위
            <select
              value={form.authority}
              onChange={(event) =>
                setFormField("authority", event.target.value)
              }
            >
              {["일반", "부원", "임원진", "부회장", "회장", "admin"].map(
                (authority) => (
                  <option key={authority}>{authority}</option>
                ),
              )}
            </select>
          </label>
          <label>
            일정 색상
            <input
              className="event-color-input"
              value={form.color}
              type="color"
              onChange={(event) => setFormField("color", event.target.value)}
            />
          </label>
        </div>
        <label>
          설명
          <textarea
            value={form.description}
            rows={6}
            onChange={(event) =>
              setFormField("description", event.target.value)
            }
          />
        </label>
        <div className="event-option-row">
          {/* 2026-08-23: The API derives multi-day status from the selected start and end dates. */}
          <label className="checkbox-label">
            <input
              checked={form.isRecruiting}
              type="checkbox"
              onChange={(event) =>
                setFormField("isRecruiting", event.target.checked)
              }
            />
            참가자 모집
          </label>
        </div>
        {form.isRecruiting ? (
          <fieldset className="recruit-period-fieldset">
            <legend>참가자 모집 기간</legend>
            <div className="event-form-grid">
              <TenMinuteDateTimeInput label="모집 시작" value={form.recruitStart} onChange={(value) => setFormField("recruitStart", value)} required />
              <TenMinuteDateTimeInput label="모집 종료" value={form.recruitEnd} onChange={(value) => setFormField("recruitEnd", value)} required />
            </div>
          </fieldset>
        ) : null}
        {mode === "edit" ? (
          <fieldset className="participant-picker">
            <legend>참여자 ({participantIds.length}명)</legend>
            {availableMembers.length === 0 ? (
              <p>연결된 계정이 있는 회원이 없습니다.</p>
            ) : (
              <div className="participant-search-picker">
                <div className="selected-participant-section">
                  <strong>현재 참여자</strong>
                  {selectedParticipantMembers.length === 0 ? (
                    <p className="muted-copy">선택된 참여자가 없습니다.</p>
                  ) : (
                    <div className="selected-participant-list">
                      {selectedParticipantMembers.map((member) => (
                        <span key={member.id}>
                          {member.name}
                          <button
                            aria-label={`${member.name} 참여자에서 제거`}
                            type="button"
                            onClick={() => removeParticipant(member.userId!)}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <label className="participant-search-label">
                  새 참여자 이름 검색
                  <input
                    autoComplete="off"
                    placeholder="이름을 입력하세요"
                    type="search"
                    value={participantQuery}
                    onChange={(event) => setParticipantQuery(event.target.value)}
                  />
                </label>

                {participantQuery.trim() ? (
                  participantSearchResults.length === 0 ? (
                    <p className="participant-search-empty">
                      추가할 수 있는 검색 결과가 없습니다.
                    </p>
                  ) : (
                    <div className="participant-search-results">
                      {participantSearchResults.map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => addParticipant(member.userId!)}
                        >
                          <span>
                            <strong>{member.name}</strong>
                            <small>{member.id}</small>
                          </span>
                          <b>추가</b>
                        </button>
                      ))}
                    </div>
                  )
                ) : (
                  <p className="participant-search-help">
                    이름을 입력하면 추가할 수 있는 회원만 표시됩니다.
                  </p>
                )}
              </div>
            )}
          </fieldset>
        ) : null}
        <div className="card-actions">
          {mode === "edit" ? (
            <button
              className="danger-button"
              disabled={isDeleting || isSaving}
              type="button"
              onClick={deleteEvent}
            >
              삭제
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => navigate(eventId ? `/event/${eventId}` : "/event")}
          >
            취소
          </button>
          <button disabled={isSaving || isDeleting} type="submit">
            저장
          </button>
        </div>
      </form>
    </section>
  );

  function setFormField<K extends keyof EventFormState>(
    key: K,
    value: EventFormState[K],
  ) {
    setForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  }

  function addParticipant(userId: number) {
    setParticipantIds((currentIds) =>
      currentIds.includes(userId) ? currentIds : [...currentIds, userId],
    );
    setParticipantQuery("");
  }

  function removeParticipant(userId: number) {
    setParticipantIds((currentIds) =>
      currentIds.filter((participantId) => participantId !== userId),
    );
  }
}

function groupEvents(events: EventItem[]) {
  const groups = new Map<string, EventItem[]>();

  for (const event of events) {
    const month = new Date(event.start).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
    });
    groups.set(month, [...(groups.get(month) ?? []), event]);
  }

  return Array.from(groups.entries()).map(([month, groupEvents]) => ({
    month,
    events: groupEvents,
  }));
}

function formatRange(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.toLocaleString("ko-KR")} - ${endDate.toLocaleString("ko-KR")}`;
}

function formatCurrency(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const offsetDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return offsetDate.toISOString().slice(0, 16);
}

function toMysqlDateTime(value: string) {
  return value.length === 16
    ? `${value.replace("T", " ")}:00`
    : value.replace("T", " ");
}
