import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router";
import { ApiError } from "../../api/ApiError";
import { routes } from "../../app/routes";
import type { FieldValidationQueueItem } from "../../domain/fieldValidation.types";
import { useFieldValidationQueue } from "../../hooks/useFieldValidation";
import { LoadingState, ErrorState } from "../ui/States";
import { parseReportListUrl } from "../../pages/reportListUrlState";

const monthPattern = /^(\d{4})-(\d{2})$/;
const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function localToday() {
  const today = new Date();
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

function currentMonth() {
  return localToday().slice(0, 7);
}

function isValidMonth(value: string | undefined): value is string {
  if (!value) return false;
  const match = monthPattern.exec(value);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

function monthBounds(month: string) {
  const match = monthPattern.exec(month);
  if (!match) return { from: `${month}-01`, to: `${month}-28` };
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    from: `${month}-01`,
    to: `${month}-${pad(lastDay)}`,
  };
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function calendarDays(month: string) {
  const match = monthPattern.exec(month);
  if (!match) return [];
  const year = Number(match[1]);
  const monthNumber = Number(match[2]) - 1;
  const firstDay = new Date(year, monthNumber, 1);
  const leadingDays = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthNumber + 1, 0).getDate();
  const totalDays = Math.ceil((leadingDays + daysInMonth) / 7) * 7;

  return Array.from({ length: totalDays }, (_, index) => {
    const date = new Date(year, monthNumber, index - leadingDays + 1);
    return {
      key: localDateKey(date),
      day: date.getDate(),
      inMonth: date.getMonth() === monthNumber,
    };
  });
}

function monthLabel(month: string) {
  const match = monthPattern.exec(month);
  if (!match) return month;
  return new Intl.DateTimeFormat("en-PH", {
    month: "long",
    year: "numeric",
  }).format(new Date(Number(match[1]), Number(match[2]) - 1, 1));
}

function changeMonth(month: string, amount: number) {
  const match = monthPattern.exec(month);
  if (!match) return currentMonth();
  const next = new Date(Number(match[1]), Number(match[2]) - 1 + amount, 1);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}`;
}

function visitLabel(item: FieldValidationQueueItem, today: string) {
  if (!item.targetVisitDate) return "Visit date not scheduled";
  if (item.targetVisitDate < today) return `Overdue visit, target ${item.targetVisitDate}`;
  if (item.targetVisitDate === today) return "Visit targeted for today; not overdue";
  return `Scheduled visit, target ${item.targetVisitDate}`;
}

function visitItemsByDate(items: FieldValidationQueueItem[]) {
  const byDate = new Map<string, FieldValidationQueueItem[]>();
  items.forEach((item) => {
    if (!item.targetVisitDate) return;
    const dayItems = byDate.get(item.targetVisitDate) ?? [];
    dayItems.push(item);
    byDate.set(item.targetVisitDate, dayItems);
  });
  return byDate;
}

function calendarErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 403) {
    return "Your account does not have access to the visit calendar.";
  }
  if (error instanceof ApiError && error.status === 429) {
    return "The visit calendar is receiving too many requests. Wait a moment, then try again.";
  }
  return "The visit calendar could not be loaded. Please try again.";
}

export function MonitoringCalendar() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const parsedUrl = parseReportListUrl(searchParams);
  const month = isValidMonth(parsedUrl.calendarMonth)
    ? parsedUrl.calendarMonth
    : currentMonth();
  const bounds = monthBounds(month);
  const calendarQuery = useFieldValidationQueue(
    {
      queue: "needs_visit",
      dueFrom: bounds.from,
      dueTo: bounds.to,
      limit: 100,
    },
    { enabled: !parsedUrl.invalid },
  );
  const items = calendarQuery.data?.items ?? [];
  const itemsByDate = visitItemsByDate(items);
  const today = localToday();

  const setMonth = (nextMonth: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("calendar_month", nextMonth);
      next.delete("page");
      return next;
    });
  };

  return (
    <section className="monitoring-calendar" aria-labelledby="monitoring-calendar-heading">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">Date-only schedule</span>
          <h2 id="monitoring-calendar-heading">Visit calendar</h2>
        </div>
        <span>Target dates use the office calendar day. Today is not overdue.</span>
      </div>
      <div className="monitoring-calendar__toolbar">
        <button
          type="button"
          className="button button--secondary button--small"
          aria-label="Previous month"
          onClick={() => setMonth(changeMonth(month, -1))}
        >
          <ChevronLeft aria-hidden="true" />
          <span>Previous</span>
        </button>
        <strong aria-live="polite">{monthLabel(month)}</strong>
        <button
          type="button"
          className="button button--secondary button--small"
          aria-label="Next month"
          onClick={() => setMonth(changeMonth(month, 1))}
        >
          <span>Next</span>
          <ChevronRight aria-hidden="true" />
        </button>
        <button
          type="button"
          className="button button--quiet button--small"
          onClick={() => setMonth(currentMonth())}
        >
          Today
        </button>
      </div>
      {calendarQuery.isRefetchError && calendarQuery.data ? (
        <p className="queue-refresh-warning" role="alert">
          The latest calendar refresh failed. Showing the most recently loaded visits.
        </p>
      ) : null}
      {calendarQuery.isPending && !calendarQuery.data ? (
        <LoadingState message="Loading scheduled visits..." />
      ) : null}
      {calendarQuery.isError && !calendarQuery.data ? (
        <ErrorState
          message={calendarErrorMessage(calendarQuery.error)}
          onRetry={() => void calendarQuery.refetch()}
        />
      ) : null}
      {calendarQuery.data ? (
        items.length === 0 ? (
          <p className="monitoring-calendar__empty" role="status">
            <CalendarDays aria-hidden="true" /> No scheduled visits in {monthLabel(month)}.
          </p>
        ) : (
          <div className="monitoring-calendar__grid" role="grid" aria-label={`${monthLabel(month)} scheduled visits`}>
            {weekdayLabels.map((label) => (
              <div className="monitoring-calendar__weekday" role="columnheader" key={label}>{label}</div>
            ))}
            {calendarDays(month).map((day) => {
              const dayItems = itemsByDate.get(day.key) ?? [];
              const isToday = day.key === today;
              return (
                <div
                  className={`monitoring-calendar__day${day.inMonth ? "" : " is-outside-month"}${isToday ? " is-today" : ""}`}
                  role="gridcell"
                  key={day.key}
                  aria-label={`${day.key}${isToday ? ", today" : ""}`}
                >
                  <span className="monitoring-calendar__day-number">{day.day}</span>
                  {dayItems.map((item) => {
                    const overdue = Boolean(item.targetVisitDate && item.targetVisitDate < today);
                    return (
                      <Link
                        className={`monitoring-calendar__visit${overdue ? " is-overdue" : ""}`}
                        to={routes.reportDetail(item.uuid)}
                        state={{ reviewQueue: {
                          returnTo: `${location.pathname}${location.search}`,
                          filters: parsedUrl.filters,
                          remainingIds: items.slice(items.findIndex((entry) => entry.uuid === item.uuid) + 1).map((entry) => entry.uuid),
                          reviewedIds: [], snapshotOnly: true,
                        } }}
                        key={item.uuid}
                        aria-label={`${item.referenceCode}: ${visitLabel(item, today)}`}
                      >
                        <strong>{item.referenceCode}</strong>
                        <span>{overdue ? "Overdue" : isToday ? "Today" : "Scheduled"}</span>
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )
      ) : null}
    </section>
  );
}
