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

describe("AnalyticsSectionView", () => {
  it("renders all five Phase 1 charts with PHT boundaries printed on each", () => {
    renderView();

    for (const name of [
      "Submitted reports over time",
      "Submitted reports by barangay",
      "Submitted reports by Possible Condition",
      "Open vs closed submitted reports",
      "Previous-period comparison",
    ]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }

    const periodLines = screen.getAllByText(/Period boundaries use PHT \(UTC\+8\)\./);
    expect(periodLines).toHaveLength(5);
  });

  it("ships an accessible data table per chart with the plotted values", () => {
    renderView();

    const tables = screen.getAllByRole("table", { hidden: true });
    expect(tables).toHaveLength(5);

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
    expect(images).toHaveLength(5);
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

    expect(screen.getAllByText("No submitted reports in this period.")).toHaveLength(5);
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
