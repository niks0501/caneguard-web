import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReportAnalytics } from "../../domain/dashboard.types";
import { ANALYTICS_FORBIDDEN_WORDS } from "./analyticsCopy";
import { AnalyticsSectionView } from "./AnalyticsSection";

const analytics: ReportAnalytics = {
  period: {
    from: "2026-09-01",
    to: "2026-09-07",
    granularity: "day",
    label: "1 – 7 September 2026 (7 days)",
    timezone: "Asia/Manila",
    timezoneLabel: "PHT (UTC+8)",
    days: 7,
    partial: false,
  },
  totalSubmitted: 4,
  series: [{ label: "2026-09-02", count: 4 }],
  casesByBarangay: [{ barangay: "Mabini", reportedCases: 4 }],
  casesByPossibleCondition: [{ possibleCondition: "rust", reportedCases: 4 }],
  caseState: { open: 3, closed: 1 },
  comparison: {
    previousFrom: "2026-08-25",
    previousTo: "2026-08-31",
    previousTotal: 1,
    currentTotal: 4,
    delta: 3,
  },
  lifecycle: {
    verificationOutcome: { not_determined: 3, verified: 1, unable_to_verify: 0 },
    fieldValidationState: { unassigned: 1, assigned: 1, in_progress: 1, completed: 1 },
    referralState: { not_referred: 3, referred: 1, expert_response_received: 0 },
  },
  area: {
    estimatedHectares: 14.5,
    contributingReports: 3,
    measuredReports: 2,
    measuredHectares: 10,
    notMeasuredReports: 1,
    notMeasuredHectares: 4.5,
    linkedDuplicatesExcluded: 2,
    overlapNote: "Estimates may overlap where submitted reports describe the same ground.",
  },
  validationWorkload: {
    assignees: [
      { assigneeId: 2, name: "Anna Validator", openReports: 1 },
      { assigneeId: 1, name: "Ben Validator", openReports: 2 },
    ],
    unassigned: 1,
  },
  validationSchedule: {
    unscheduled: 2,
    scheduled: 1,
    dueToday: 0,
    pastTargetDate: 1,
    today: "2026-09-07",
  },
  reviewBacklog: {
    totalWaiting: 2,
    buckets: [
      { label: "0–2 days waiting", count: 1 },
      { label: "3–6 days waiting", count: 0 },
      { label: "7–13 days waiting", count: 1 },
      { label: "14–29 days waiting", count: 0 },
      { label: "30+ days waiting", count: 0 },
    ],
    oldestWaitingDays: 9,
  },
  validationTurnaround: {
    source: "activated_at_to_visited_at",
    completed: 1,
    averageHours: 30,
    medianHours: 30,
    minHours: 30,
    maxHours: 30,
    buckets: [
      { label: "Under 24 hours", count: 0 },
      { label: "1–3 days", count: 1 },
      { label: "3–7 days", count: 0 },
      { label: "Over 7 days", count: 0 },
    ],
  },
};

function renderView() {
  return render(
    <AnalyticsSectionView
      analytics={analytics}
      from="2026-09-01"
      to="2026-09-07"
      onFromChange={vi.fn()}
      onToChange={vi.fn()}
      onPreset={vi.fn()}
    />,
  );
}

describe("AnalyticsSectionView Phase 2", () => {
  it("prints the area disclosure with provenance, duplicates and overlap", () => {
    renderView();

    expect(
      screen.getByText(
        "3 submitted reports contribute an estimated 14.5 ha " +
          "(2 measured at 10 ha, 1 not measured at 4.5 ha). " +
          "2 linked duplicates excluded; Estimates may overlap where submitted reports describe the same ground.",
      ),
    ).toBeInTheDocument();
  });

  it("lists workload alphabetically with unassigned as its own bucket", () => {
    renderView();

    const tables = screen.getAllByRole("table", { hidden: true });
    const workloadTable = tables.find((table) =>
      within(table).queryByText("Anna Validator"),
    );
    expect(workloadTable).toBeDefined();
    const rows = within(workloadTable!).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual([
      "Anna Validator",
      "Ben Validator",
      "Unassigned",
    ]);
  });

  it("keeps all four schedule buckets visible and labels waiting age without overdue", () => {
    renderView();

    const tables = screen.getAllByRole("table", { hidden: true });
    const scheduleTable = tables.find((table) =>
      within(table).queryByText("Past target date"),
    );
    expect(scheduleTable).toBeDefined();
    const rows = within(scheduleTable!).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual([
      "Unscheduled",
      "Scheduled",
      "Due today",
      "Past target date",
    ]);
    expect(
      screen.getByText("2 submitted reports waiting for a first review; oldest wait 9 days."),
    ).toBeInTheDocument();
  });

  it("reports turnaround as measured durations with no target comparison", () => {
    renderView();

    expect(
      screen.getByText("1 completed validations · average 30 hours · median 30 hours · range 30 hours–30 hours."),
    ).toBeInTheDocument();
  });

  it("never uses forbidden analytics vocabulary in Phase 2 copy", () => {
    const { container } = renderView();

    const copy = container.textContent ?? "";
    for (const word of ANALYTICS_FORBIDDEN_WORDS) {
      expect(copy.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });
});
