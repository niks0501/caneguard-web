import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReportAnalytics } from "../../domain/dashboard.types";
import { ANALYTICS_FORBIDDEN_WORDS } from "./analyticsCopy";
import { TeamThroughput } from "./TeamThroughput";
import { quietTrends } from "./trendsFixture";

const scopeLabel = "1 Sep – 7 Sep 2026";
const reviewTime = (reviewedCases: number, medianHours: number | null) => ({
  source: "submitted_at_to_reviewed_at",
  reviewedCases,
  averageHours: medianHours,
  medianHours,
  minHours: medianHours,
  maxHours: medianHours,
});

const analytics: ReportAnalytics = {
  ...quietTrends,
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
  series: [{ label: "2026-09-02", count: 3 }],
  comparison: {
    previousFrom: "2026-08-25",
    previousTo: "2026-08-31",
    previousTotal: 2,
    currentTotal: 5,
    delta: 3,
  },
  validationWorkload: {
    assignees: [
      { assigneeId: 2, name: "Anna Validator", openReports: 1 },
      { assigneeId: 1, name: "Ben Validator", openReports: 2 },
    ],
    unassigned: 1,
  },
  reviewBacklog: {
    totalWaiting: 3,
    pastTarget: 2,
    targetDays: 3,
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
    withinTarget: 1,
    targetDays: 7,
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
  reviewTime: {
    targetDays: 3,
    current: reviewTime(4, 36),
    previous: reviewTime(2, 60),
  },
  reportedConcern: [],
  possibleCondition: [],
  verificationOutcome: { not_determined: 0, verified: 0, unable_to_verify: 0 },
  validationByBarangay: [],
  barangayScope: { municipality: "Nasugbu", province: "Batangas", barangays: [] },
};

const emptyAnalytics: ReportAnalytics = {
  ...analytics,
  totalSubmitted: 0,
  validationWorkload: { assignees: [], unassigned: 0 },
  reviewBacklog: { totalWaiting: 0, pastTarget: 0, targetDays: 3, buckets: [], oldestWaitingDays: null },
  validationTurnaround: {
    source: "activated_at_to_visited_at",
    completed: 0,
    withinTarget: 0,
    targetDays: 7,
    averageHours: null,
    medianHours: null,
    minHours: null,
    maxHours: null,
    buckets: [],
  },
  reviewTime: { targetDays: 3, current: reviewTime(0, null), previous: reviewTime(0, null) },
};

function renderView(data: ReportAnalytics = analytics) {
  return render(<TeamThroughput analytics={data} scopeLabel={scopeLabel} />);
}

describe("TeamThroughput", () => {
  it("renders the four throughput cards under one section heading", () => {
    renderView();

    expect(screen.getByRole("heading", { name: "Team throughput" })).toBeInTheDocument();
    for (const name of [
      "Median time to first review",
      "Review backlog by waiting age",
      "Open field-validation work per assignee",
      "Field-validation turnaround",
    ]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
  });

  it("states the scope honestly: the backlog is the current queue, the rest follow the selected scope", () => {
    renderView();

    expect(screen.getByText("Current queue, all submission dates")).toBeInTheDocument();
    expect(screen.getAllByText(scopeLabel)).toHaveLength(3);
    // The page names its timezone once; cards must not repeat it.
    expect(screen.queryByText(/PHT/)).not.toBeInTheDocument();
  });

  it("ships an accessible data table per chart with the plotted values", () => {
    renderView();

    const tables = screen.getAllByRole("table", { hidden: true });
    expect(tables).toHaveLength(4);
    const reviewTable = tables[0];
    expect(within(reviewTable).getByText("Previous period")).toBeInTheDocument();
    expect(within(reviewTable).getByText("60")).toBeInTheDocument();
    expect(within(reviewTable).getByText("36")).toBeInTheDocument();
  });

  it("clips every hidden data table in a block wrapper so it cannot widen the page", () => {
    renderView();

    // `overflow` does not apply to a table box, so `.sr-only` on the table
    // itself still lets the widest row widen the document and force sideways
    // scroll. The clip has to sit on a block wrapper around the table.
    for (const table of screen.getAllByRole("table", { hidden: true })) {
      expect(table).not.toHaveClass("sr-only");
      const clip = table.closest(".sr-only");
      expect(clip).not.toBeNull();
      expect(clip?.tagName).toBe("DIV");
    }
  });

  it("labels each chart as an image with its plotted summary", () => {
    renderView();

    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(4);
    expect(images[0]).toHaveAttribute("aria-label", expect.stringContaining("this period 36 hours"));
    expect(images[1]).toHaveAttribute("aria-label", expect.stringContaining("0–2 days waiting: 1"));
  });

  it("compares the median review time with the previous period against the review target", () => {
    renderView();

    expect(
      screen.getByText(
        "Median 36 hours · 24 hours shorter than the previous period. Target: review within 3 days of submission.",
      ),
    ).toBeInTheDocument();
  });

  it("lists workload alphabetically with unassigned as its own bucket", () => {
    renderView();

    const workloadTable = screen
      .getAllByRole("table", { hidden: true })
      .find((table) => within(table).queryByText("Anna Validator"));
    expect(workloadTable).toBeDefined();
    const rows = within(workloadTable!).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual([
      "Anna Validator",
      "Ben Validator",
      "Unassigned",
    ]);
  });

  it("prints the backlog oldest wait and the count past the review target", () => {
    renderView();

    expect(
      screen.getByText(
        "3 submitted reports waiting for a first review; oldest wait 9 days. 2 past the 3 days review target.",
      ),
    ).toBeInTheDocument();
  });

  it("prints turnaround against the field-visit target", () => {
    renderView();

    expect(
      screen.getByText(
        "1 of 2 completed validations visited within 7 days of assignment · median 36 hours.",
      ),
    ).toBeInTheDocument();
  });

  it("prints the target day counts the API sends, not a constant of its own", () => {
    renderView({
      ...analytics,
      reviewBacklog: { ...analytics.reviewBacklog, targetDays: 5 },
      reviewTime: { ...analytics.reviewTime, targetDays: 5 },
      validationTurnaround: { ...analytics.validationTurnaround, targetDays: 10 },
    });

    expect(screen.getByText(/Target: review within 5 days of submission/)).toBeInTheDocument();
    expect(screen.getByText(/visited within 10 days of assignment/)).toBeInTheDocument();
  });

  it("renders an honest empty state on each card when nothing has happened", () => {
    renderView(emptyAnalytics);

    expect(screen.getByText("No reviewed reports in this period or the previous one.")).toBeInTheDocument();
    expect(screen.getByText("No submitted reports are waiting for a first review.")).toBeInTheDocument();
    expect(screen.getByText("No open field-validation work in this period.")).toBeInTheDocument();
    expect(screen.getByText("No completed validations in this period.")).toBeInTheDocument();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("says plainly when the previous period has nothing to compare", () => {
    renderView({
      ...analytics,
      reviewTime: { targetDays: 3, current: reviewTime(4, 36), previous: reviewTime(0, null) },
    });

    expect(screen.getByText(/No previous period to compare\./)).toBeInTheDocument();
  });

  it("never uses forbidden analytics vocabulary in throughput copy", () => {
    const { container } = renderView();

    const copy = container.textContent ?? "";
    for (const word of ANALYTICS_FORBIDDEN_WORDS) {
      expect(copy.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });
});
