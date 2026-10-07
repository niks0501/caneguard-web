import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router";
import { ApiError } from "../../api/ApiError";
import { routes } from "../../app/routes";
import type { FieldValidationQueueItem } from "../../domain/fieldValidation.types";
import {
  groupScheduleByDate,
  isScheduleDateKey,
  isScheduleMonthKey,
  scheduleDateLabel,
  scheduleMonthGrid,
  scheduleMonthLabel,
  scheduleMonthOf,
  shiftScheduleMonth,
} from "../../domain/monitoringSchedule";
import { manilaDateAt, manilaMonthAt } from "../../domain/reportingTime";
import { useFieldValidationQueue } from "../../hooks/useFieldValidation";
import { ErrorState, LoadingState } from "../ui/States";
import { activeVisitWorkloadFilters } from "./monitoringWorkload";

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Date-only scheduling state: Today is never Overdue. */
function scheduleStateLabel(targetVisitDate: string | null, officeDate: string) {
  if (!targetVisitDate) return "Unscheduled";
  if (targetVisitDate < officeDate) return "Overdue";
  if (targetVisitDate === officeDate) return "Today";
  return "Scheduled";
}

function locationLabel(item: FieldValidationQueueItem) {
  return [item.barangay, item.municipality, item.province].filter(Boolean).join(", ");
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

/**
 * Dedicated, read-focused schedule surface.
 *
 * The month grid keeps a stable row height: a busy date shows at most two
 * compact visit indicators plus an exact `+N more` control, and the complete
 * workload for a selected date lives in the selected-day agenda. The Calendar
 * never mutates scheduling; Field Operations stays authoritative.
 */
export function MonitoringCalendar() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const officeDate = manilaDateAt();
  const officeMonth = manilaMonthAt();

  const requestedMonth = searchParams.get("calendar_month");
  const month = isScheduleMonthKey(requestedMonth) ? requestedMonth : officeMonth;
  const requestedDate = searchParams.get("calendar_date");
  const explicitDate =
    isScheduleDateKey(requestedDate) && scheduleMonthOf(requestedDate) === month
      ? requestedDate
      : null;
  const selectedDate = explicitDate ?? (month === officeMonth ? officeDate : null);

  const workload = useFieldValidationQueue(activeVisitWorkloadFilters, { complete: true });
  const items = workload.data?.items ?? [];
  const itemsByDate = groupScheduleByDate(items);
  const agendaItems = selectedDate ? itemsByDate.get(selectedDate) ?? [] : [];
  const gridDays = scheduleMonthGrid(month);
  const gridWeeks = Array.from({ length: gridDays.length / 7 }, (_, weekIndex) =>
    gridDays.slice(weekIndex * 7, weekIndex * 7 + 7),
  );

  const updateParams = (mutate: (next: URLSearchParams) => void) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      mutate(next);
      return next;
    });
  };

  const selectDate = (dateKey: string) =>
    updateParams((next) => {
      next.set("calendar_date", dateKey);
    });

  const showMonth = (nextMonth: string) =>
    updateParams((next) => {
      next.set("calendar_month", nextMonth);
      next.delete("calendar_date");
    });

  const showInitialError = workload.isError && !workload.data;
  const calendarQueueContext = {
    reviewQueue: {
      returnTo: `${location.pathname}${location.search}`,
      filters: {},
      remainingIds: [],
      reviewedIds: [],
      snapshotOnly: true,
    },
  };

  return (
    <section className="monitoring-calendar" aria-labelledby="monitoring-calendar-heading">
      <div className="monitoring-calendar__toolbar">
        <button
          type="button"
          className="button button--secondary button--small"
          aria-label="Previous month"
          onClick={() => showMonth(shiftScheduleMonth(month, -1))}
        >
          <ChevronLeft aria-hidden="true" />
          <span>Previous</span>
        </button>
        <h2 className="monitoring-calendar__month" id="monitoring-calendar-heading" aria-live="polite">
          {scheduleMonthLabel(month)}
        </h2>
        <button
          type="button"
          className="button button--secondary button--small"
          aria-label="Next month"
          onClick={() => showMonth(shiftScheduleMonth(month, 1))}
        >
          <span>Next</span>
          <ChevronRight aria-hidden="true" />
        </button>
        <button
          type="button"
          className="button button--quiet button--small"
          onClick={() => showMonth(officeMonth)}
        >
          Today
        </button>
      </div>

      {workload.isRefetchError && workload.data ? (
        <p className="queue-refresh-warning" role="alert">
          The latest calendar refresh failed. Showing the most recently loaded visits.
        </p>
      ) : null}
      {workload.isPending && !workload.data ? (
        <LoadingState message="Loading scheduled visits..." />
      ) : null}
      {showInitialError ? (
        <ErrorState
          message={calendarErrorMessage(workload.error)}
          onRetry={() => void workload.refetch()}
        />
      ) : null}

      {workload.data ? (
        <div className="monitoring-calendar__body">
          <div
            className="monitoring-calendar__grid"
            role="grid"
            aria-label={`${scheduleMonthLabel(month)} scheduled visits`}
          >
            <div className="monitoring-calendar__week" role="row">
              {weekdayLabels.map((label) => (
                <div className="monitoring-calendar__weekday" role="columnheader" key={label}>
                  {label}
                </div>
              ))}
            </div>
            {gridWeeks.map((week) => (
              <div className="monitoring-calendar__week" role="row" key={week[0].key}>
                {week.map((day) => {
                  const dayItems = day.inMonth ? itemsByDate.get(day.key) ?? [] : [];
                  const hiddenCount = Math.max(0, dayItems.length - 2);
                  const isToday = day.key === officeDate;
                  const label = day.inMonth
                    ? `${scheduleDateLabel(day.key)}${isToday ? ", today" : ""}`
                    : `${scheduleDateLabel(day.key)}, outside this month`;

                  return (
                    <div
                      className={`monitoring-calendar__day${day.inMonth ? "" : " is-outside-month"}${isToday ? " is-today" : ""}${day.inMonth && selectedDate === day.key ? " is-selected" : ""}`}
                      role="gridcell"
                      key={day.key}
                      aria-label={label}
                      aria-selected={day.inMonth ? selectedDate === day.key : undefined}
                    >
                      {day.inMonth ? (
                        <button
                          type="button"
                          className="monitoring-calendar__day-number"
                          aria-label={`Select ${scheduleDateLabel(day.key)}`}
                          onClick={() => selectDate(day.key)}
                        >
                          {day.dayNumber}
                        </button>
                      ) : (
                        <span className="monitoring-calendar__day-number" aria-hidden="true">
                          {day.dayNumber}
                        </span>
                      )}
                      {dayItems.length > 0 ? (
                        <div className="monitoring-calendar__visits">
                          {dayItems.slice(0, 2).map((item) => (
                            <button
                              type="button"
                              className={`monitoring-calendar__visit${item.targetVisitDate && item.targetVisitDate < officeDate ? " is-overdue" : ""}`}
                              key={`${day.key}-${item.uuid}-${item.referenceCode}`}
                              aria-label={`${item.referenceCode}, ${scheduleStateLabel(item.targetVisitDate ?? null, officeDate)}`}
                              onClick={() => selectDate(day.key)}
                            >
                              {item.referenceCode}
                              <span className="monitoring-calendar__visit-state">
                                {scheduleStateLabel(item.targetVisitDate ?? null, officeDate)}
                              </span>
                            </button>
                          ))}
                          {hiddenCount > 0 ? (
                            <button
                              type="button"
                              className="monitoring-calendar__more"
                              aria-label={`Select ${scheduleDateLabel(day.key)} and show ${hiddenCount} more ${hiddenCount === 1 ? "visit" : "visits"}`}
                              onClick={() => selectDate(day.key)}
                            >
                              {`+${hiddenCount} more`}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {selectedDate ? (
            <section
              className="monitoring-calendar__agenda"
              aria-labelledby="monitoring-calendar-agenda-heading"
            >
              <h3 id="monitoring-calendar-agenda-heading">{scheduleDateLabel(selectedDate)}</h3>
              <p className="monitoring-calendar__agenda-count">
                {agendaItems.length} scheduled {agendaItems.length === 1 ? "visit" : "visits"}
              </p>
              {agendaItems.length === 0 ? (
                <p className="monitoring-calendar__agenda-empty" role="status">
                  No visits are scheduled on this date.
                </p>
              ) : (
                <ul className="monitoring-calendar__agenda-list">
                  {agendaItems.map((item) => (
                    <li key={`${item.uuid}-${item.referenceCode}`}>
                      <article className="monitoring-calendar__agenda-entry">
                        <strong>{item.referenceCode}</strong>
                        <span className="monitoring-calendar__agenda-location">{locationLabel(item)}</span>
                        <span className="monitoring-calendar__agenda-assignee">
                          {item.assignee?.name ?? "Unassigned"}
                        </span>
                        <span className="monitoring-calendar__agenda-state">
                          {scheduleStateLabel(item.targetVisitDate ?? null, officeDate)}
                        </span>
                        <Link
                          className="button button--secondary button--small"
                          to={routes.reportDetail(item.uuid)}
                          state={calendarQueueContext}
                        >
                          Open case
                        </Link>
                      </article>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <p className="monitoring-calendar__prompt" role="status">
              Select a date to see the scheduled workload for that day.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
