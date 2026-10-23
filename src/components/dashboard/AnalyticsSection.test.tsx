import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AxiosError } from "axios";
import { ApiError } from "../../api/ApiError";
import { useAnalytics } from "../../hooks/useAnalytics";
import type { ReportAnalytics } from "../../domain/dashboard.types";
import { ANALYTICS_FORBIDDEN_WORDS } from "./analyticsCopy";
import { AnalyticsSection, AnalyticsSectionView } from "./AnalyticsSection";

vi.mock("../../hooks/useAnalytics", () => ({
  useAnalytics: vi.fn(),
}));

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
  totalSubmitted: 5,
  series: [
    { label: "2026-09-01", count: 0 },
    { label: "2026-09-02", count: 3 },
    { label: "2026-09-03", count: 2 },
  ],
  casesByBarangay: [
    { barangay: "Mabini", reportedCases: 4 },
    { barangay: "Rizal", reportedCases: 1 },
  ],
  casesByPossibleCondition: [
    { possibleCondition: "rust", reportedCases: 3 },
    { possibleCondition: "healthy", reportedCases: 2 },
  ],
  caseState: { open: 4, closed: 1 },
  comparison: {
    previousFrom: "2026-08-25",
    previousTo: "2026-08-31",
    previousTotal: 2,
    currentTotal: 5,
    delta: 3,
  },
  lifecycle: {
    verificationOutcome: { not_determined: 4, verified: 1, unable_to_verify: 0 },
    fieldValidationState: { unassigned: 1, assigned: 2, in_progress: 1, completed: 1 },
  },
  area: {
    estimatedHectares: 14.5,
    contributingReports: 3,
    measuredReports: 2,
    measuredHectares: 10,
    notMeasuredReports: 1,
    notMeasuredHectares: 4.5,
    linkedDuplicatesExcluded: 1,
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
    unscheduled: 1,
    scheduled: 1,
    dueToday: 1,
    pastTargetDate: 1,
    today: "2026-09-07",
  },
  reviewBacklog: {
    totalWaiting: 3,
    buckets: [
      { label: "0–2 days waiting", count: 1 },
      { label: "3–6 days waiting", count: 1 },
      { label: "7–13 days waiting", count: 1 },
      { label: "14–29 days waiting", count: 0 },
      { label: "30+ days waiting", count: 0 },
    ],
    oldestWaitingDays: 9,
  },
  validationTurnaround: {
    source: "activated_at_to_visited_at",
    completed: 2,
    averageHours: 36,
    medianHours: 36,
    minHours: 24,
    maxHours: 48,
    buckets: [
      { label: "Under 24 hours", count: 0 },
      { label: "1–3 days", count: 2 },
      { label: "3–7 days", count: 0 },
      { label: "Over 7 days", count: 0 },
    ],
  },
  reportedConcern: [
    { concern: "RSSI", label: "RSSI", count: 1, share: 0.2 },
    { concern: "smut", label: "Smut", count: 0, share: 0 },
    { concern: "mosaic", label: "Mosaic", count: 2, share: 0.4 },
    { concern: "rust", label: "Rust", count: 1, share: 0.2 },
    { concern: "other", label: "Other reported", count: 1, share: 0.2 },
    { concern: "not_stated", label: "Not stated", count: 0, share: 0 },
  ],
  possibleCondition: [
    { condition: "healthy", count: 2 },
    { condition: "mosaic", count: 2 },
    { condition: "rust", count: 1 },
  ],
  verificationOutcome: {
    not_determined: 4,
    verified: 1,
    unable_to_verify: 0,
  },
  validationByBarangay: [
    {
      barangay: "Mabini",
      submitted: 4,
      open: 3,
      pastTargetDate: 1,
      scheduled: 1,
      unscheduled: 1,
    },
    {
      barangay: "Rizal",
      submitted: 1,
      open: 1,
      pastTargetDate: 0,
      scheduled: 0,
      unscheduled: 1,
    },
  ],
  barangayScope: {
    municipality: "Nasugbu",
    province: "Batangas",
    barangays: ["Mabini", "Rizal"],
  },
};

const emptyAnalytics: ReportAnalytics = {
  ...analytics,
  totalSubmitted: 0,
  series: [],
  casesByBarangay: [],
  casesByPossibleCondition: [],
  caseState: { open: 0, closed: 0 },
  comparison: {
    previousFrom: "2026-08-25",
    previousTo: "2026-08-31",
    previousTotal: 0,
    currentTotal: 0,
    delta: 0,
  },
  lifecycle: {
    verificationOutcome: {},
    fieldValidationState: {},
  },
  area: {
    estimatedHectares: 0,
    contributingReports: 0,
    measuredReports: 0,
    measuredHectares: 0,
    notMeasuredReports: 0,
    notMeasuredHectares: 0,
    linkedDuplicatesExcluded: 0,
    overlapNote: "Estimates may overlap where submitted reports describe the same ground.",
  },
  validationWorkload: { assignees: [], unassigned: 0 },
  validationSchedule: {
    unscheduled: 0,
    scheduled: 0,
    dueToday: 0,
    pastTargetDate: 0,
    today: "2026-09-07",
  },
  reviewBacklog: { totalWaiting: 0, buckets: [], oldestWaitingDays: null },
  validationTurnaround: {
    source: "activated_at_to_visited_at",
    completed: 0,
    averageHours: null,
    medianHours: null,
    minHours: null,
    maxHours: null,
    buckets: [],
  },
};

function renderView(data: ReportAnalytics = analytics) {
  return render(
    <AnalyticsSectionView
      analytics={data}
      from="2026-09-01"
      to="2026-09-07"
      onFromChange={vi.fn()}
      onToChange={vi.fn()}
      onPreset={vi.fn()}
    />,
  );
}

describe("AnalyticsSection", () => {
  it("explains API connection failures and keeps cached results visible", () => {
    const error = new ApiError("Network Error", { cause: new AxiosError("Network Error") });
    vi.mocked(useAnalytics).mockReturnValue({
      data: undefined,
      error,
      isPending: false,
      isError: true,
      isRefetchError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAnalytics>);
    const { rerender } = render(<AnalyticsSection />);

    // Staff get a recovery step; the build variable is not their instruction.
    expect(screen.getByText(/CaneGuard cannot be reached right now/)).toBeInTheDocument();
    expect(screen.queryByText(/VITE_API_BASE_URL/)).not.toBeInTheDocument();

    vi.mocked(useAnalytics).mockReturnValue({
      data: analytics,
      error,
      isPending: false,
      isError: true,
      isRefetchError: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAnalytics>);
    rerender(<AnalyticsSection />);

    expect(screen.getByRole("alert")).toHaveTextContent(/last loaded data stays visible/i);
    expect(screen.getByRole("heading", { name: "Submitted reports over time" })).toBeInTheDocument();
  });
});

describe("AnalyticsSectionView", () => {
  it("renders all Phase 1 charts with PHT boundaries printed on each", () => {
    renderView();

    for (const name of [
      "Submitted reports over time",
      "Submitted reports by barangay",
      "Submitted reports by Possible Condition",
      "Open vs closed submitted reports",
      "Previous-period comparison",
      "Where work sits in the lifecycle",
      "Estimated affected area",
      "Field-validation workload",
      "Validation schedule against target dates",
      "Review backlog by waiting age",
      "Field-validation turnaround",
    ]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }

    const periodLines = screen.getAllByText(/Period boundaries use PHT \(UTC\+8\)\./);
    expect(periodLines).toHaveLength(11);
  });

  it("ships an accessible data table per chart with the plotted values", () => {
    renderView();

    const tables = screen.getAllByRole("table", { hidden: true });
    expect(tables).toHaveLength(12);

    const seriesTable = tables[0];
    expect(within(seriesTable).getByText("2026-09-02")).toBeInTheDocument();
    expect(within(seriesTable).getByText("3")).toBeInTheDocument();

    const comparisonTable = tables[4];
    expect(within(comparisonTable).getByText("2026-08-25 to 2026-08-31")).toBeInTheDocument();
    expect(within(comparisonTable).getByText("2")).toBeInTheDocument();
  });

  it("labels charts as images with a series summary and states the delta without projection", () => {
    renderView();

    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(12);
    expect(images[0]).toHaveAttribute("aria-label", expect.stringContaining("2026-09-02: 3"));
    expect(screen.getByText("Up 3 submitted reports on the previous comparable period.")).toBeInTheDocument();
    expect(screen.queryByText(/projection|forecast/i)).not.toBeInTheDocument();
  });

  it("keeps Possible Condition decision-support wording and Healthy visible", () => {
    renderView();

    expect(screen.getByText(/Possible Condition — decision support only/)).toBeInTheDocument();
    const conditionTable = screen.getAllByRole("table", { hidden: true })[2];
    expect(within(conditionTable).getByText("healthy")).toBeInTheDocument();
  });

  it("renders the honest empty state on every chart when the period is quiet", () => {
    renderView(emptyAnalytics);

    expect(screen.getAllByText("No submitted reports in this period.")).toHaveLength(11);
    expect(screen.getByText("0 submitted reports in this period.")).toBeInTheDocument();
  });

  it("never uses forbidden analytics vocabulary in chart copy", () => {
    const { container } = renderView();

    const copy = container.textContent ?? "";
    for (const word of ANALYTICS_FORBIDDEN_WORDS) {
      expect(copy.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });
});
