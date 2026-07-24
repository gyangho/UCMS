import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { navigate } from "../../app/router";
import { ApiError, requestData } from "../../shared/api/http";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ApiIssueBanner } from "../../shared/ui/ApiIssueBanner";

interface DashboardEvent {
  id: number;
  title: string;
  description?: string | null;
  start: string;
  end: string;
  color?: string | null;
  authority?: number | string;
  isMultiple?: boolean | number;
  ismultiple?: boolean | number;
  isRecruiting?: boolean | number;
  isrecruiting?: boolean | number;
}

interface NoticePreview {
  id: number;
  title: string;
  authorName?: string | null;
  category?: string | null;
  minimumAuthority?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  pinned?: boolean;
}

interface DashboardData {
  calendarEvents: DashboardEvent[];
  myEvents: DashboardEvent[];
  recruitingEvents: DashboardEvent[];
  notices: NoticePreview[];
  issues?: DashboardApiIssue[];
}

interface DashboardApiIssue {
  scope: "events" | "notices" | string;
  code: string;
  message: string;
}

const emptyDashboard: DashboardData = {
  calendarEvents: [],
  myEvents: [],
  recruitingEvents: [],
  notices: []
};

interface CalendarEvent extends DashboardEvent {
  startKey: string;
  endKey: string;
}

interface CalendarCell {
  dateKey: string | null;
  inMonth: boolean;
  key: string;
  label: string;
}

interface WeekBar {
  endColumn: number;
  event: CalendarEvent;
  continuesAfter: boolean;
  continuesBefore: boolean;
  lane: number;
  startColumn: number;
}

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

// 2026-07-23: 공지 읽기 권한이 미인증부터인 경우 사용자 화면에는 간결하게 '전체'로 표시합니다.
function formatNoticeAuthority(authority?: string | null) {
  const label = authority ?? "부원";
  return label === "미인증" ? "전체" : `${label} 이상`;
}

export function DashboardPage() {
  const today = useMemo(() => new Date(), []);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selectedDateKey, setSelectedDateKey] = useState(() => toDateKey(today));
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // 2026-07-16: Load dashboard from the Node contract API, but keep the calendar shell visible when the request fails.
  useEffect(() => {
    let ignore = false;

    async function loadDashboard() {
      try {
        const data = await requestData<DashboardData>("/api/dashboard");
        if (!ignore) {
          setDashboard(data);
          setError(null);
        }
      } catch (loadError) {
        if (!ignore) {
          setDashboard(emptyDashboard);
          setError(loadError instanceof Error ? loadError : new Error("Dashboard request failed."));
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadDashboard();
    return () => {
      ignore = true;
    };
  }, []);

  const calendarEvents = useMemo(
    () =>
      (dashboard?.calendarEvents ?? [])
        .map(normalizeEvent)
        .sort((a, b) => a.startKey.localeCompare(b.startKey)),
    [dashboard]
  );

  const monthWeeks = useMemo(() => buildMonthWeeks(visibleMonth), [visibleMonth]);

  const selectedEvents = useMemo(
    () =>
      calendarEvents.filter(
        (event) => event.startKey <= selectedDateKey && selectedDateKey <= event.endKey
      ),
    [calendarEvents, selectedDateKey]
  );

  const upcomingMyEvents = useMemo(
    () =>
      (dashboard?.myEvents ?? [])
        .map(normalizeEvent)
        .filter((event) => event.endKey >= toDateKey(today))
        .sort((a, b) => a.startKey.localeCompare(b.startKey))
        .slice(0, 5),
    [dashboard, today]
  );

  const recruitingEvents = useMemo(
    () =>
      (dashboard?.recruitingEvents ?? [])
        .map(normalizeEvent)
        .sort((a, b) => a.startKey.localeCompare(b.startKey))
        .slice(0, 5),
    [dashboard]
  );

  function moveMonth(offset: number) {
    setVisibleMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + offset, 1)
    );
  }

  const requestIssue = describeDashboardRequestError(error);

  return (
    <section className="dashboard-page">
      {isLoading ? <div className="page-state compact">대시보드를 불러오는 중입니다.</div> : null}
      {requestIssue ? (
        <ApiIssueBanner
          error={error}
          label={requestIssue.label}
          message={requestIssue.message}
        />
      ) : null}
      {(dashboard?.issues ?? []).map((issue) => (
        <ApiIssueBanner
          error={new Error(issue.message)}
          key={`${issue.scope}-${issue.code}`}
          label={dashboardIssueLabel(issue.scope)}
          message={issue.message}
        />
      ))}
      <div className="dashboard-layout">
        <section className="dashboard-calendar" aria-label="월간 일정">
          <div className="dashboard-calendar-header">
            <button type="button" onClick={() => moveMonth(-1)} aria-label="이전 달">
              이전
            </button>
            <h2>
              {visibleMonth.getFullYear()}. {visibleMonth.getMonth() + 1}
            </h2>
            <button type="button" onClick={() => moveMonth(1)} aria-label="다음 달">
              다음
            </button>
          </div>

          <div className="dashboard-calendar-grid dashboard-weekdays">
            {weekdays.map((weekday) => (
              <div key={weekday}>{weekday}</div>
            ))}
          </div>

          <div className="dashboard-calendar-weeks">
            {monthWeeks.map((week, weekIndex) => {
              const weekBars = buildWeekBars(week, calendarEvents);

              return (
                <div className="calendar-week" key={`week-${weekIndex}`}>
                  {week.map((cell, columnIndex) => {
                    const dayEvents = cell.dateKey
                      ? calendarEvents.filter(
                          (event) =>
                            isSingleDayEvent(event) && event.startKey === cell.dateKey
                        )
                      : [];
                    const isSelected = cell.dateKey === selectedDateKey;
                    const isToday = cell.dateKey === toDateKey(today);

                    return (
                      <button
                        className={[
                          "calendar-day",
                          cell.inMonth ? "" : "muted",
                          isSelected ? "selected" : "",
                          isToday ? "today" : ""
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        disabled={!cell.dateKey}
                        key={cell.key}
                        style={{ gridColumn: columnIndex + 1 }}
                        type="button"
                        onClick={() => {
                          if (cell.dateKey) {
                            setSelectedDateKey(cell.dateKey);
                          }
                        }}
                      >
                        <span className="calendar-day-number">{cell.label}</span>
                        <span className="calendar-events">
                          {dayEvents.slice(0, 3).map((event) => (
                            <span
                              className="calendar-event-chip"
                              key={event.id}
                              style={{ borderColor: event.color ?? "#2563eb" }}
                              title={event.title}
                            >
                              {event.title}
                            </span>
                          ))}
                          {dayEvents.length > 3 ? (
                            <span className="calendar-more">+{dayEvents.length - 3}</span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}

                  {weekBars.map((bar) => (
                    <button
                      className={[
                        "calendar-multi-event-bar",
                        bar.continuesBefore ? "continues-before" : "",
                        bar.continuesAfter ? "continues-after" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={`${bar.event.id}-${weekIndex}`}
                      onClick={() => navigate(`/event/${bar.event.id}`)}
                      style={
                        {
                          "--lane": bar.lane,
                          backgroundColor: bar.event.color ?? "#2563eb",
                          gridColumn: `${bar.startColumn} / ${bar.endColumn}`
                        } as CSSProperties
                      }
                      type="button"
                      title={`${bar.event.title} (${formatEventRange(bar.event)})`}
                    >
                      {bar.event.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </section>

        <aside className="dashboard-side">
          <section className="dashboard-list">
            <div className="dashboard-list-heading">
              <h2>{formatSelectedDate(selectedDateKey)}</h2>
              <button
                type="button"
                onClick={() => navigate(`/event/new?date=${selectedDateKey}`)}
                aria-label="일정 생성"
              >
                +
              </button>
            </div>
            <EventList events={selectedEvents} emptyText="선택한 날짜에 일정이 없습니다." />
          </section>

          <section className="dashboard-list">
            <div className="dashboard-list-heading">
              <h2>내 일정</h2>
              <button type="button" onClick={() => navigate("/event/myevents")}>
                전체
              </button>
            </div>
            <EventList events={upcomingMyEvents} emptyText="참여 중인 예정 일정이 없습니다." />
          </section>

          <section className="dashboard-list">
            <div className="dashboard-list-heading">
              <h2>모집 중인 일정</h2>
            </div>
            <EventList events={recruitingEvents} emptyText="모집 중인 일정이 없습니다." />
          </section>
        </aside>
      </div>

      <section className="dashboard-notices">
        <div className="dashboard-list-heading">
          <h2>공지사항</h2>
          <button type="button" onClick={() => navigate("/board/notices")}>
            전체
          </button>
        </div>
        {(dashboard?.notices ?? []).length > 0 ? (
          <div className="notice-preview-list">
            {/* 2026-07-23: Put the pin first and the minimum read authority at the far right. */}
            {(dashboard?.notices ?? []).slice(0, 4).map((post) => (
              <button
                className="notice-preview-item"
                key={post.id}
                type="button"
                onClick={() => navigate(`/board/notices/${post.id}`)}
              >
                <span
                  aria-label={post.pinned ? "고정 공지" : undefined}
                  className="notice-preview-pin"
                >
                  {post.pinned ? "📌" : ""}
                </span>
                <strong>{post.title}</strong>
                <span className="notice-preview-author">
                  {post.authorName ?? "-"}
                </span>
                <span>
                  {post.updatedAt || post.createdAt
                    ? formatDateTime(post.updatedAt ?? post.createdAt!)
                    : "-"}
                </span>
                <span className="notice-preview-authority">
                  {formatNoticeAuthority(
                    post.minimumAuthority ?? post.category,
                  )}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title="공지사항이 없습니다." />
        )}
      </section>
    </section>
  );
}

function EventList({
  events,
  emptyText
}: {
  events: CalendarEvent[];
  emptyText: string;
}) {
  if (events.length === 0) {
    return <p className="dashboard-empty">{emptyText}</p>;
  }

  return (
    <div className="dashboard-event-list">
      {events.map((event) => (
        <button
          className="dashboard-event-item"
          key={event.id}
          onClick={() => navigate(`/event/${event.id}`)}
          style={{ borderLeftColor: event.color ?? "#2563eb" }}
          type="button"
        >
          <strong>{event.title}</strong>
          <span>{formatEventRange(event)}</span>
        </button>
      ))}
    </div>
  );
}

function normalizeEvent(event: DashboardEvent): CalendarEvent {
  return {
    ...event,
    startKey: toDateKey(new Date(event.start)),
    endKey: toDateKey(new Date(event.end))
  };
}

function buildMonthWeeks(month: Date) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const lastDate = new Date(year, monthIndex + 1, 0).getDate();
  const cells: CalendarCell[] = [];

  for (let index = 0; index < firstDay; index += 1) {
    cells.push({
      dateKey: null,
      inMonth: false,
      key: `empty-start-${index}`,
      label: ""
    });
  }

  for (let date = 1; date <= lastDate; date += 1) {
    const cellDate = new Date(year, monthIndex, date);
    cells.push({
      dateKey: toDateKey(cellDate),
      inMonth: true,
      key: toDateKey(cellDate),
      label: String(date)
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      dateKey: null,
      inMonth: false,
      key: `empty-end-${cells.length}`,
      label: ""
    });
  }

  const weeks: CalendarCell[][] = [];

  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  return weeks;
}

function buildWeekBars(week: CalendarCell[], events: CalendarEvent[]): WeekBar[] {
  const datedCells = week.filter((cell) => cell.dateKey);
  const weekStart = datedCells[0]?.dateKey;
  const weekEnd = datedCells[datedCells.length - 1]?.dateKey;

  if (!weekStart || !weekEnd) {
    return [];
  }

  return events
    .filter(
      (event) =>
        !isSingleDayEvent(event) && event.startKey <= weekEnd && event.endKey >= weekStart
    )
    .map((event, lane) => {
      const segmentStart = event.startKey > weekStart ? event.startKey : weekStart;
      const segmentEnd = event.endKey < weekEnd ? event.endKey : weekEnd;
      const startIndex = week.findIndex((cell) => cell.dateKey === segmentStart);
      const endIndex = week.findIndex((cell) => cell.dateKey === segmentEnd);

      return {
        endColumn: endIndex + 2,
        event,
        continuesAfter: event.endKey > segmentEnd,
        continuesBefore: event.startKey < segmentStart,
        lane,
        startColumn: startIndex + 1
      };
    });
}

function isSingleDayEvent(event: CalendarEvent) {
  return event.startKey === event.endKey;
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatSelectedDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short"
  });
}

function formatEventRange(event: CalendarEvent) {
  if (event.startKey === event.endKey) {
    return event.startKey;
  }

  return `${event.startKey} - ${event.endKey}`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// 2026-07-23: Translate transport/auth/server failures into distinct, actionable dashboard messages.
function describeDashboardRequestError(error: Error | null) {
  if (!error) return null;

  if (error instanceof ApiError) {
    if (error.status === 401) {
      return {
        label: "세션 확인",
        message: "로그인 세션을 확인하지 못했습니다. 로그인 기능이 필요하면 다시 로그인해주세요."
      };
    }
    if (error.status === 403) {
      return {
        label: "접근 권한",
        message: "대시보드를 조회할 권한이 없습니다. 계정 권한을 확인해주세요."
      };
    }
    if (error.status >= 500) {
      return {
        label: "대시보드 서버",
        message: "서버에서 대시보드 데이터를 처리하지 못했습니다. 잠시 후 다시 시도해주세요."
      };
    }
    return {
      label: "대시보드 응답",
      message: `대시보드 요청을 완료하지 못했습니다. (HTTP ${error.status})`
    };
  }

  return {
    label: "네트워크 연결",
    message: "서버에 연결하지 못했습니다. 네트워크와 서버 실행 상태를 확인해주세요."
  };
}

function dashboardIssueLabel(scope: string) {
  if (scope === "events") return "일정 데이터";
  if (scope === "notices") return "공지사항 데이터";
  return "대시보드 데이터";
}
