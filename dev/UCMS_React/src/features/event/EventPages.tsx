import { type FormEvent, useEffect, useMemo, useState } from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";
import { useCurrentUser } from "../../shared/api/user";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState, LoadingState } from "../../shared/ui/PageState";

interface EventItem {
  id: number;
  title: string;
  description?: string | null;
  start: string;
  end: string;
  color?: string | null;
  isRecruiting?: boolean;
  authorName?: string | null;
  authorId?: string | number | null;
  place?: string | null;
  participants?: Array<{ name: string; role?: string | null; status?: string | null }>;
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
  place: string;
  start: string;
  end: string;
  description: string;
  color: string;
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
          requestData<{ events: EventItem[] }>("/api/events/my")
        ]);
        if (!ignore) {
          setEvents(allData.events);
          setMyEvents(myData.events);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "일정을 불러오지 못했습니다.");
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
    () => events.filter((event) => Boolean(event.isRecruiting)),
    [events]
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

      <EventSection title="내 일정" events={myEvents} emptyTitle="참여 중인 일정이 없습니다." />
      <EventSection title="모집 중인 일정" events={recruitingEvents} emptyTitle="모집 중인 일정이 없습니다." />
      <EventSection title="전체 일정" events={events} emptyTitle="표시할 일정이 없습니다." />
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
        const data = await requestData<{ events: EventItem[] }>("/api/events/my");
        if (!ignore) {
          setEvents(data.events);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "내 일정을 불러오지 못했습니다.");
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
      <EventSection title="내 일정" events={events} emptyTitle="참여 중인 일정이 없습니다." />
    </section>
  );
}

function EventSection({
  title,
  events,
  emptyTitle
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
  const { user } = useCurrentUser();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 2026-07-16: Detail view now fetches the requested event so manage buttons reflect real author/session data.
  useEffect(() => {
    let ignore = false;

    async function loadEvent() {
      try {
        const data = await requestData<{ event: EventItem }>(`/api/events/${eventId}`);
        if (!ignore) {
          setEvent(data.event);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "일정 상세를 불러오지 못했습니다.");
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

  const canManage = Boolean(
    event && user && (String(event.authorId) === String(user.userId) || user.authority >= 4)
  );

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
              <button type="button" onClick={() => navigate(`/event/${event.id}/edit`)}>
                수정
              </button>
            </>
          ) : null}
        </div>
      </div>

      <section className="data-card">
        <div>
          <h2>일정 정보</h2>
          <span className="status-pill active">진행</span>
        </div>
        <dl>
          <dt>일시</dt>
          <dd>{formatRange(event.start, event.end)}</dd>
          <dt>장소</dt>
          <dd>{event.place ?? "-"}</dd>
          <dt>작성자</dt>
          <dd>{event.authorName ?? "-"}</dd>
          <dt>설명</dt>
          <dd>{event.description ?? "-"}</dd>
        </dl>
      </section>

      <div className="two-column">
        <section className="data-card">
          <h2>참여자</h2>
          {(event.participants ?? []).length === 0 ? (
            <EmptyState title="참여자가 없습니다." />
          ) : (
            <dl>
              {(event.participants ?? []).map((participant) => (
                <div key={`${participant.name}-${participant.role ?? ""}`}>
                  <dt>{participant.name}</dt>
                  <dd>
                    {participant.role ?? "-"} / {participant.status ?? "-"}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className="data-card">
          <h2>관련 정산</h2>
          {event.settlement ? (
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
                {event.settlement.paidCount}/{event.settlement.participantCount}명
              </dd>
              <dt>상태</dt>
              <dd>{event.settlement.status}</dd>
            </dl>
          ) : (
            <p>연결된 정산이 없습니다.</p>
          )}
        </section>
      </div>
    </section>
  );
}

export function EventFormPage({
  mode,
  path
}: {
  mode: "create" | "edit";
  path?: string;
}) {
  const eventId = path ? Number(path.match(/\d+/)?.[0]) : null;
  const [form, setForm] = useState<EventFormState>({
    title: "",
    place: "",
    start: "",
    end: "",
    description: "",
    color: "#2563eb"
  });
  const [isLoading, setIsLoading] = useState(mode === "edit");
  const [error, setError] = useState<string | null>(null);

  // 2026-07-16: Event form loads/saves through the contract API so create and edit paths can be moved to Spring later.
  useEffect(() => {
    if (mode !== "edit" || !eventId) {
      return;
    }

    let ignore = false;

    async function loadEvent() {
      try {
        const data = await requestData<{ event: EventItem }>(`/api/events/${eventId}`);
        const item = data.event;
        if (!ignore) {
          setForm({
            title: item.title,
            place: item.place ?? "",
            start: toDateTimeLocal(item.start),
            end: toDateTimeLocal(item.end),
            description: item.description ?? "",
            color: item.color ?? "#2563eb"
          });
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "일정을 불러오지 못했습니다.");
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
    const data = await requestData<{ event: EventItem }>(
      mode === "edit" && eventId ? `/api/events/${eventId}` : "/api/events",
      {
        method: mode === "edit" ? "PUT" : "POST",
        body: JSON.stringify({
          ...form,
          start: new Date(form.start).toISOString(),
          end: new Date(form.end).toISOString()
        })
      }
    );
    navigate(`/event/${data.event.id}`);
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  return (
    <section className="stack-page narrow">
      <div className="page-heading">
        <div>
          <h1>{mode === "create" ? "일정 생성" : "일정 수정"}</h1>
        </div>
      </div>

      <form className="form-panel" onSubmit={submit}>
        <label>
          제목
          <input
            value={form.title}
            onChange={(event) => setFormField("title", event.target.value)}
            placeholder="일정 제목"
            required
          />
        </label>
        <label>
          장소
          <input
            value={form.place}
            onChange={(event) => setFormField("place", event.target.value)}
            placeholder="장소"
          />
        </label>
        <label>
          시작 일시
          <input
            value={form.start}
            type="datetime-local"
            onChange={(event) => setFormField("start", event.target.value)}
            required
          />
        </label>
        <label>
          종료 일시
          <input
            value={form.end}
            type="datetime-local"
            onChange={(event) => setFormField("end", event.target.value)}
            required
          />
        </label>
        <label>
          설명
          <textarea
            value={form.description}
            rows={6}
            onChange={(event) => setFormField("description", event.target.value)}
          />
        </label>
        <div className="card-actions">
          <button type="button" onClick={() => navigate(eventId ? `/event/${eventId}` : "/event")}>
            취소
          </button>
          <button type="submit">저장</button>
        </div>
      </form>
    </section>
  );

  function setFormField<K extends keyof EventFormState>(key: K, value: EventFormState[K]) {
    setForm((currentForm) => ({
      ...currentForm,
      [key]: value
    }));
  }
}

function groupEvents(events: EventItem[]) {
  const groups = new Map<string, EventItem[]>();

  for (const event of events) {
    const month = new Date(event.start).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long"
    });
    groups.set(month, [...(groups.get(month) ?? []), event]);
  }

  return Array.from(groups.entries()).map(([month, groupEvents]) => ({
    month,
    events: groupEvents
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
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}
