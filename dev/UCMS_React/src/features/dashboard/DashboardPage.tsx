import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { navigate } from "../../app/router";
import { requestData } from "../../shared/api/http";
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
  category?: string | null;
  createdAt?: string | null;
  pinned?: boolean;
}

interface DashboardData {
  calendarEvents: DashboardEvent[];
  myEvents: DashboardEvent[];
  recruitingEvents: DashboardEvent[];
  notices: NoticePreview[];
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

  return (
    <section className="dashboard-page">
      {isLoading ? <div className="page-state compact">대시보드를 불러오는 중입니다.</div> : null}
      <ApiIssueBanner error={error} label="/api/dashboard" />
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
            {(dashboard?.notices ?? []).slice(0, 4).map((post) => (
              <button
                className="notice-preview-item"
                key={post.id}
                type="button"
                onClick={() => navigate(`/board/notices/${post.id}`)}
              >
                <span className={post.pinned ? "status-pill active" : "status-pill"}>
                  {post.pinned ? "고정" : post.category ?? "공지"}
                </span>
                <strong>{post.title}</strong>
                <span>{post.createdAt ? formatDate(post.createdAt) : "-"}</span>
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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR");
}
