import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ZodError } from "zod";
import { AxiosError } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/ApiError";
import { ANALYTICS_FORBIDDEN_WORDS } from "../components/dashboard/analyticsCopy";
import {
  DASHBOARD_PREFERENCES_STORAGE_KEY,
  DASHBOARD_PREFERENCES_VERSION,
} from "../components/dashboard/dashboardPreferences";
import type { ScopeSelection } from "../components/dashboard/dashboardScope";
import { mockReports } from "../data/mock/mockReports";
import { useAnalytics } from "../hooks/useAnalytics";
import { dashboardSummaryOptions, useDashboard } from "../hooks/useDashboard";
import { useFieldValidationMap } from "../hooks/useFieldValidation";
import type { ReportAnalytics } from "../domain/dashboard.types";
import { manilaDateAt } from "../domain/reportingTime";
import { DashboardPage } from "./DashboardPage";

vi.mock("../hooks/useDashboard", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../hooks/useDashboard")>();
  return { ...actual, useDashboard: vi.fn() };
});

vi.mock("../hooks/useAnalytics", () => ({
  useAnalytics: vi.fn(),
}));

vi.mock("../hooks/useFieldValidation", () => ({
  useFieldValidationMap: vi.fn(),
}));

const summary = {
  totalSubmitted: 8,
  queues: {
    needs_review: 3,
    needs_visit: 4,
    follow_up_due: 1,
    upcoming: 2,
    unverified_no_active_work: 1,
  },
  counts: {
    submitted_unverified: 3,
    for_field_validation: 4,
    verified_by_staff: 2,
    unable_to_verify: 1,
    resolved: 1,
  },
  recentReports: mockReports.slice(0, 5),
  monthlySummary: {
    month: "2026-09",
    period: { from: "2026-09-01", to: "2026-09-30" },
    reportedCases: 6,
    casesByBarangay: [],
    casesByPossibleCondition: [],
    estimatedAffectedHectares: 0,
    reportsContainingFarmerFarmInformation: 0,
    fieldValidationCounts: {
      unassigned: 1,
      assigned: 2,
      inProgress: 1,
      completed: 0,
      requiringValidation: 3,
    },
    closedCases: 0,
    reviewTime: {
      source: "submitted_at_to_reviewed_at",
      reviewedCases: 0,
      averageHours: null,
      medianHours: null,
      minHours: null,
      maxHours: null,
    },
  },
};

const analytics = {
  period: {
    from: "2026-09-01",
    to: "2026-09-24",
    granularity: "day",
    label: "1–24 Sep 2026",
    timezone: "Asia/Manila",
    timezoneLabel: "PHT (UTC+8)",
    days: 24,
    partial: false,
  },
  totalSubmitted: 12,
  series: [
    { label: "2026-09-01", count: 2 },
    { label: "2026-09-02", count: 1 },
  ],
  comparison: {
    previousFrom: "2026-08-08",
    previousTo: "2026-08-31",
    previousTotal: 9,
    previousSeries: [
      { label: "2026-08-08", count: 4 },
      { label: "2026-08-09", count: 5 },
    ],
    currentTotal: 12,
    delta: 3,
  },
  reviewBacklog: {
    totalWaiting: 3,
    buckets: [
      { label: "0–2 days waiting", count: 1 },
      { label: "3–6 days waiting", count: 2 },
    ],
    oldestWaitingDays: 5,
  },
  reportedConcern: [
    { concern: "RSSI", label: "RSSI", count: 4, share: 0.3333 },
    { concern: "smut", label: "Smut", count: 1, share: 0.0833 },
    { concern: "mosaic", label: "Mosaic", count: 3, share: 0.25 },
    { concern: "rust", label: "Rust", count: 2, share: 0.1667 },
    { concern: "other", label: "Other reported", count: 1, share: 0.0833 },
    { concern: "not_stated", label: "Not stated", count: 1, share: 0.0833 },
  ],
  possibleCondition: [
    { condition: "healthy", count: 2 },
    { condition: "mosaic", count: 6 },
    { condition: "rust", count: 4 },
  ],
  verificationOutcome: {
    not_determined: 7,
    verified: 3,
    unable_to_verify: 2,
  },
  validationByBarangay: [
    {
      barangay: "Balaytigui",
      submitted: 5,
      open: 3,
      pastTargetDate: 1,
      scheduled: 1,
      unscheduled: 1,
    },
    {
      barangay: "Bucana",
      submitted: 2,
      open: 1,
      pastTargetDate: 0,
      scheduled: 0,
      unscheduled: 1,
    },
  ],
  barangayScope: {
    municipality: "Nasugbu",
    province: "Batangas",
    barangays: ["Balaytigui", "Bucana"],
  },
} as unknown as ReportAnalytics;

function dashboardResult(
  overrides: Record<string, unknown> = {},
): ReturnType<typeof useDashboard> {
  return {
    data: summary,
    dataUpdatedAt: new Date("2026-09-24T13:14:03Z").getTime(),
    error: null,
    isError: false,
    isFetching: false,
    isPending: false,
    isRefetchError: false,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useDashboard>;
}

function analyticsResult(
  overrides: Record<string, unknown> = {},
): ReturnType<typeof useAnalytics> {
  return {
    data: analytics,
    dataUpdatedAt: new Date("2026-09-24T13:14:03Z").getTime(),
    error: null,
    isError: false,
    isFetching: false,
    isPending: false,
    isRefetchError: false,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useAnalytics>;
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-24T05:30:00.000Z"));
  vi.mocked(useDashboard).mockReturnValue(dashboardResult());
  vi.mocked(useAnalytics).mockReturnValue(analyticsResult());
  vi.mocked(useFieldValidationMap).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useFieldValidationMap>);
});

describe("DashboardPage", () => {
  it("requests the current PHT month by default and allows changing the scope", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T05:30:00.000Z"));
    renderDashboard();
    expect(useDashboard).toHaveBeenLastCalledWith("2026-09", {
      include: "counts,queues,recent,monthly",
      recentLimit: 10,
    });
    expect(useAnalytics).toHaveBeenCalledWith(
      { from: "2026-09-01", to: "2026-09-24", granularity: "day", comparison: "previous_month" },
      { enabled: true },
    );

    fireEvent.change(screen.getByLabelText("Scope month"), {
      target: { value: "2026-08" },
    });
    expect(useDashboard).toHaveBeenLastCalledWith("2026-08", {
      include: "counts,queues,recent,monthly",
      recentLimit: 10,
    });
    expect(useAnalytics).toHaveBeenCalledWith(
      { from: "2026-08-01", to: "2026-08-31", granularity: "day" },
      { enabled: true },
    );

    fireEvent.click(screen.getByLabelText("Last 30 days"));
    expect(useAnalytics).toHaveBeenCalledWith(
      { from: "2026-08-26", to: "2026-09-24", granularity: "day" },
      { enabled: true },
    );
  });

  it("labels the current-month scope as month to date on the ruler itself", () => {
    const { rerender } = renderDashboard();

    // The open month is named on the ruler, not in a prose note beside it.
    expect(screen.getByLabelText("This month to date")).toBeInTheDocument();
    expect(screen.queryByLabelText("This month")).not.toBeInTheDocument();
    expect(screen.queryByText(/Month to date; compared with/)).not.toBeInTheDocument();
    expect(screen.getByText("+3 vs previous period · month to date")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Scope month"), {
      target: { value: "2026-08" },
    });
    vi.mocked(useAnalytics).mockReturnValue(
      analyticsResult({
        data: {
          ...analytics,
          period: {
            ...analytics.period,
            from: "2026-08-01",
            to: "2026-08-31",
            label: "1–31 Aug 2026",
          },
        },
      }),
    );
    rerender(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    // A closed month is not month to date, and KPI 1 stops saying so.
    expect(screen.getByLabelText("This month")).toBeInTheDocument();
    expect(screen.queryByLabelText("This month to date")).not.toBeInTheDocument();
    expect(screen.getByText("+3 vs previous period")).toBeInTheDocument();
    expect(
      screen.queryByText("+3 vs previous period · month to date"),
    ).not.toBeInTheDocument();
  });

  it("defines the previous-period comparison in one tooltip reachable by hover and keyboard focus", () => {
    renderDashboard();

    // The retired header note explained the comparison in visible prose; the
    // definition now lives in exactly one tooltip on KPI 1's supporting line.
    const card = screen.getByText("Submitted reports").closest("article")!;
    const support = within(card).getByText("+3 vs previous period · month to date");
    expect(support).toHaveClass("kpi-card__support--annotated");

    const tooltip = within(card).getByRole("tooltip");
    expect(tooltip).toHaveTextContent(
      "Previous period: the same number of days immediately before this scope, 8–31 Aug 2026.",
    );

    // The card link is the aria-described anchor, so the definition is read on
    // keyboard focus; index.css reveals it on hover and `:focus-visible`,
    // asserted by the design-spine validator.
    const link = within(card).getByRole("link");
    expect(link).toHaveAttribute("aria-describedby", tooltip.id);
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
  });

  it("drops the comparison tooltip when no previous window was returned", () => {
    vi.mocked(useAnalytics).mockReturnValue(
      analyticsResult({ data: undefined, isError: true, isPending: false }),
    );
    renderDashboard();

    const card = screen.getByText("Submitted reports").closest("article")!;
    expect(within(card).getByText("Previous period unavailable")).toBeInTheDocument();
    expect(within(card).queryByRole("tooltip")).not.toBeInTheDocument();
    expect(within(card).getByRole("link")).not.toHaveAttribute("aria-describedby");
  });

  it("reports an unavailable analytics window instead of showing an endless loading frame", () => {
    vi.mocked(useAnalytics).mockReturnValue(analyticsResult({ data: undefined, isError: true, isPending: false }));
    renderDashboard();
    expect(screen.getByText("Report analytics unavailable for the selected period.")).toBeInTheDocument();
    expect(screen.queryByText("Loading trends and analysis…")).not.toBeInTheDocument();
  });

  it("never shows the old period while a new period is loading", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T05:30:00.000Z"));
    const { rerender } = renderDashboard();
    fireEvent.change(screen.getByLabelText("Scope month"), { target: { value: "2026-08" } });
    vi.mocked(useAnalytics).mockReturnValue(analyticsResult({ isPlaceholderData: true }));
    rerender(<MemoryRouter><DashboardPage /></MemoryRouter>);
    const snapshot = within(screen.getByRole("region", { name: "Current operations" }));
    expect(snapshot.queryByRole("img", { name: /Submissions 1–24 Sep/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Inflow: this period/ })).not.toBeInTheDocument();
  });

  it("uses the same review population for the KPI and waiting-age breakdown", () => {
    vi.mocked(useAnalytics).mockReturnValue(analyticsResult({ data: {
      ...analytics, reviewBacklog: { totalWaiting: 1, buckets: [{ label: "0–2 days waiting", count: 1 }], oldestWaitingDays: 2 },
    } }));
    renderDashboard();
    const card = screen.getByText("Awaiting review").closest("article")!;
    expect(within(card).getByText("1")).toBeInTheDocument();
    expect(within(card).getByText("Oldest: 2 days")).toBeInTheDocument();
    expect(within(card).getByRole("img", { name: "Waiting age: 0–2 days waiting 1" })).toBeInTheDocument();
  });

  it("labels an empty or unmeasurable waiting backlog honestly", () => {
    vi.mocked(useAnalytics).mockReturnValue(analyticsResult({ data: {
      ...analytics,
      reviewBacklog: {
        totalWaiting: 0,
        buckets: analytics.reviewBacklog.buckets.map((bucket) => ({ ...bucket, count: 0 })),
        oldestWaitingDays: null,
      },
    } }));
    const { rerender } = renderDashboard();

    const card = screen.getByText("Awaiting review").closest("article")!;
    expect(within(card).getByText("0")).toBeInTheDocument();
    // Nothing waiting has no oldest age, and the empty split draws no slices.
    expect(within(card).getByText("No reports awaiting review")).toBeInTheDocument();
    expect(
      within(card).getByRole("img", { name: "Waiting age: nothing recorded" }),
    ).toBeInTheDocument();
    expect(card.querySelectorAll(".kpi-radial__slice")).toHaveLength(0);

    // A counted backlog without a measured wait stays unavailable, never "0 days".
    vi.mocked(useAnalytics).mockReturnValue(analyticsResult({ data: {
      ...analytics,
      reviewBacklog: { ...analytics.reviewBacklog, oldestWaitingDays: null },
    } }));
    rerender(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(
      within(screen.getByText("Awaiting review").closest("article")!).getByText(
        "Oldest waiting age unavailable",
      ),
    ).toBeInTheDocument();
  });

  it("renders the four-KPI operational snapshot with honest windows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T05:30:00.000Z"));
    renderDashboard();

    const snapshot = within(
      screen.getByRole("region", { name: "Current operations" }),
    );
    expect(snapshot.getByText("Submitted reports")).toBeInTheDocument();
    expect(snapshot.getByText("Awaiting review")).toBeInTheDocument();
    expect(snapshot.getByText("Needing field validation")).toBeInTheDocument();
    expect(snapshot.getByText("Unverified, no active work")).toBeInTheDocument();

    // KPI 1: comparison and hint paragraphs are stripped.
    expect(snapshot.queryByText(/▲ Up from/)).not.toBeInTheDocument();
    expect(snapshot.queryByText("Synchronized only")).not.toBeInTheDocument();

    // Queue KPIs carry no point-in-time pill: the card is header, value,
    // supporting line, graphic and its own link.
    expect(snapshot.queryByText("now")).not.toBeInTheDocument();

    // Four compact cards in one band, each with one named graphic and no
    // comparison/hint paragraphs.
    const cards = snapshot.getAllByRole("article");
    expect(cards).toHaveLength(4);
    // Nothing but the four assigned slots: no paragraph and no chip list.
    expect(snapshot.queryAllByRole("paragraph")).toHaveLength(0);
    expect(snapshot.queryAllByRole("list")).toHaveLength(0);
    expect(
      snapshot.getByRole("img", { name: "Submissions 1–24 Sep 2026" }),
    ).toBeInTheDocument();
    expect(
      snapshot.getByRole("img", {
        name: "Waiting age: 0–2 days waiting 1, 3–6 days waiting 2",
      }),
    ).toBeInTheDocument();
    expect(
      snapshot.getByRole("img", {
        name: "Field-validation schedule: Past target date 1, Scheduled ahead 2, Unscheduled 1",
      }),
    ).toBeInTheDocument();
    expect(
      snapshot.getByRole("img", {
        name: "1 unverified report with no validation or referral underway",
      }),
    ).toBeInTheDocument();

    // Each supporting line carries the figure of its own population: the
    // scoped comparison delta, the same backlog's oldest wait, the same
    // queue's past-target subset, and the queue's own state.
    expect(
      within(cards[0]).getByText("+3 vs previous period · month to date"),
    ).toBeInTheDocument();
    expect(within(cards[1]).getByText("Oldest: 5 days")).toBeInTheDocument();
    expect(
      within(cards[2]).getByText("1 past target date"),
    ).toBeInTheDocument();
    expect(
      within(cards[3]).getByText("No validation or referral underway"),
    ).toBeInTheDocument();

    // KPI 3 encodes the two calendar subsets inside its bar: the removed chip
    // list leaves no text row behind, and the bar's accessible name still
    // prints every label and count for assistive technology.
    expect(snapshot.queryByText("Past target date")).not.toBeInTheDocument();
    expect(snapshot.queryByText("Scheduled ahead")).not.toBeInTheDocument();
    expect(snapshot.queryByText("Unscheduled")).not.toBeInTheDocument();
    expect(
      snapshot.queryByText("1 unassigned · 2 assigned · 1 in progress"),
    ).not.toBeInTheDocument();

    // Waiting-age rows are gone too: the radial meter's name is the only
    // remaining text alternative, and it keeps the split.
    expect(snapshot.queryByText("0–2 days waiting")).not.toBeInTheDocument();
    expect(snapshot.queryByText("Oldest wait 5 days.")).not.toBeInTheDocument();

    // One link per card and nothing else clickable: the whole card is the
    // action, so every per-card target survives without an Open row.
    expect(snapshot.getAllByRole("link")).toHaveLength(4);
    expect(
      snapshot.getByRole("link", { name: "Open the submitted reports register" }),
    ).toHaveAttribute("href", "/reports");
    expect(
      snapshot.getByRole("link", { name: "Open the Awaiting review queue" }),
    ).toHaveAttribute("href", "/reports?queue=needs_review&date_from=2026-09-01&date_to=2026-09-24");
    expect(
      snapshot.getByRole("link", {
        name: "Open the Needing field validation queue",
      }),
    ).toHaveAttribute("href", "/map?queue=needs_visit");
    expect(
      snapshot.getByRole("link", {
        name: "Open the Unverified, no active work queue",
      }),
    ).toHaveAttribute("href", "/reports?queue=unverified_no_active_work");
  });

  it("prints the signed delta from the same comparison window on KPI 1", () => {
    vi.mocked(useAnalytics).mockReturnValue(
      analyticsResult({
        data: {
          ...analytics,
          comparison: {
            previousFrom: "2026-08-08",
            previousTo: "2026-08-31",
            previousTotal: 15,
            currentTotal: 12,
            delta: -3,
          },
        },
      }),
    );
    renderDashboard();
    expect(screen.getByText("-3 vs previous period · month to date")).toBeInTheDocument();
    expect(screen.queryByText(/▼ Down from 15/)).not.toBeInTheDocument();

    vi.mocked(useAnalytics).mockReturnValue(
      analyticsResult({
        data: {
          ...analytics,
          comparison: {
            previousFrom: "2026-08-08",
            previousTo: "2026-08-31",
            previousTotal: 12,
            currentTotal: 12,
            delta: 0,
          },
        },
      }),
    );
    const { rerender } = renderDashboard();
    rerender(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByText("No change vs previous period · month to date"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/■ No change from 12/)).not.toBeInTheDocument();
  });

  it("shows unavailable figures instead of zero when a period has no data", () => {
    vi.mocked(useAnalytics).mockReturnValue(
      analyticsResult({ data: undefined, isError: true, isPending: false }),
    );
    renderDashboard();

    const submitted = screen.getByText("Submitted reports").closest("article")!;
    // The value is stated as unavailable, and the sr-only copy repeats it.
    expect(within(submitted).getByText("—")).toBeInTheDocument();
    expect(within(submitted).getByText("Unavailable")).toHaveClass("sr-only");
    expect(
      within(submitted).getByText("Previous period unavailable"),
    ).toBeInTheDocument();

    const awaiting = screen.getByText("Awaiting review").closest("article")!;
    expect(within(awaiting).getByText("—")).toBeInTheDocument();
    expect(
      within(awaiting).getByText("Waiting age unavailable"),
    ).toBeInTheDocument();
    // No graphic at all when the split was never loaded, never an empty ring
    // that reads as zero work.
    expect(within(awaiting).queryByRole("img")).not.toBeInTheDocument();

    // The summary-backed cards still count: their population is current state.
    const validation = screen
      .getByText("Needing field validation")
      .closest("article")!;
    expect(within(validation).getByText("4")).toBeInTheDocument();
    expect(within(validation).getByText("1 past target date")).toBeInTheDocument();
  });

  it("shows no empty-state sentence when a queue is empty", () => {
    vi.mocked(useDashboard).mockReturnValue(
      dashboardResult({
        data: {
          ...summary,
          queues: {
            needs_review: 0,
            needs_visit: 0,
            follow_up_due: 0,
            upcoming: 0,
            unverified_no_active_work: 0,
          },
        },
      }),
    );
    renderDashboard();

    // The value and its supporting line carry the empty state; the deleted
    // good-outcome sentences are not relocated anywhere on the cards.
    const snapshot = within(
      screen.getByRole("region", { name: "Current operations" }),
    );
    expect(snapshot.queryByText("Nothing awaiting review.")).not.toBeInTheDocument();
    expect(
      snapshot.queryByText("No open field-validation work."),
    ).not.toBeInTheDocument();
    expect(snapshot.queryByText("No unverified report is without active work.")).not.toBeInTheDocument();
    expect(snapshot.getAllByText("0")).toHaveLength(2);
    // An empty field-validation queue draws an empty track, never three equal
    // shares of nothing.
    expect(
      snapshot.getByRole("img", {
        name: "Field-validation schedule: nothing recorded",
      }),
    ).toBeInTheDocument();
    expect(snapshot.queryAllByText("Past target date")).toHaveLength(0);
    expect(snapshot.getByText("0 past target date")).toBeInTheDocument();
    expect(
      snapshot.getByText("No validation or referral underway"),
    ).toBeInTheDocument();
    expect(
      snapshot.getByRole("img", {
        name: "0 unverified reports with no validation or referral underway",
      }),
    ).toBeInTheDocument();
  });

  it("keeps long queue identifiers inside the KPI grid without sideways push", () => {
    // §13.2: the 4-up KPI track exposes unbreakable identifiers such as
    // summary.queues.unverified_no_active_work. The wrap and track rules are
    // enforced against index.css by the design-spine validator
    // (validateDashboardWrapRules: min-width 0, max-width 100%, wrap
    // anywhere); this fixture proves the longest real labels still mount and
    // that the removed explanatory prose is gone rather than shortened.
    renderDashboard();
    expect(screen.getByText("Unverified, no active work")).toBeInTheDocument();
    expect(
      screen.queryByText(/no referral in flight, no validation assignment/),
    ).not.toBeInTheDocument();
  });

  it("keeps the recent-reports heading free of the retired all-periods note", () => {
    renderDashboard();
    fireEvent.change(screen.getByLabelText("Scope month"), { target: { value: "2026-08" } });
    const recent = within(screen.getByRole("region", { name: "Recent reports" }));
    // The section meta line was deleted rather than reworded, so the heading
    // carries the section name alone.
    expect(recent.queryByText(/all periods/)).not.toBeInTheDocument();
    expect(recent.queryByText(/not filtered by report scope/)).not.toBeInTheDocument();
    expect(recent.getByRole("heading", { name: "Recent reports" })).toBeInTheDocument();
  });

  it("shows recent reports with the reported-concern column and no table prose", () => {
    renderDashboard();

    const recent = within(screen.getByRole("region", { name: "Recent reports" }));
    expect(recent.getByText("Reported concern")).toBeInTheDocument();
    // The two badge headers are plain again: no capsule spans, and the
    // Possible Condition header drops the retired "(AI)" suffix while the
    // cell contract stays untouched.
    const headers = within(recent.getByRole("table"))
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    expect(headers).toContain("Possible Condition");
    expect(headers).toContain("Work status");
    // No capsule wrapper: the header text sits directly in the <th>, which
    // carries the same content-sized no-wrap contract as its body cells.
    const conditionHeader = recent.getByText("Possible Condition");
    const statusHeader = recent.getByText("Work status");
    expect(conditionHeader.tagName).toBe("TH");
    expect(conditionHeader).toHaveClass("dashboard-report-table__cell-condition");
    expect(statusHeader.tagName).toBe("TH");
    expect(statusHeader).toHaveClass("dashboard-report-table__cell-status");
    expect(recent.getAllByText("Not stated").length).toBeGreaterThan(0);
    // The retired all-periods note stays deleted, not reworded.
    expect(recent.queryByText(/all periods/)).not.toBeInTheDocument();
    // Section-meta line 'synchronized submissions' is removed everywhere.
    expect(screen.queryByText("synchronized submissions")).not.toBeInTheDocument();
    expect(screen.queryByText(/most recent synchronized submissions/)).not.toBeInTheDocument();
    expect(
      recent.getByRole("link", { name: "Open CG-2026-0718" }),
    ).toHaveAttribute(
      "href",
      "/reports/00000000-0000-4000-8000-000000000001",
    );
  });

  it("keeps the reporter's concern distinct from the AI classification in the table", () => {
    vi.mocked(useDashboard).mockReturnValue(
      dashboardResult({
        data: {
          ...summary,
          recentReports: [
            {
              ...mockReports[0],
              reporterSuspectedCondition: "RSSI",
              predictedDisease: "mosaic",
            },
          ],
        },
      }),
    );
    renderDashboard();

    const table = within(
      screen.getByRole("region", { name: "Recent reports" }),
    ).getByRole("table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    const concernColumn = headers.indexOf("Reported concern");
    const conditionColumn = headers.indexOf("Possible Condition");
    expect(concernColumn).toBeGreaterThan(-1);
    expect(conditionColumn).toBeGreaterThan(-1);

    const cells = within(table).getAllByRole("cell");
    // Reported concern is the reporter's own words.
    expect(cells[concernColumn]).toHaveTextContent("RSSI");
    expect(cells[concernColumn]).not.toHaveTextContent("Mosaic");
    // Possible Condition is the model's classification, never merged in.
    expect(cells[conditionColumn]).toHaveTextContent("Mosaic");
    expect(cells[conditionColumn]).not.toHaveTextContent("RSSI");
  });

  it("keeps the longest real condition and work-status pills in content-sized no-wrap cells", () => {
    // The longest strings the badges can render: diseaseLabels.healthy minus
    // its "Possible Condition: " prefix, and reviewStatusLabels
    // .for_field_validation. Both must stay one line, so both cells carry the
    // content-sized no-wrap contract that the design-spine validator asserts
    // against index.css (`min-width: max-content; white-space: nowrap`), with
    // `.table-scroll` (`overflow-x: auto`) as the small-screen escape.
    vi.mocked(useDashboard).mockReturnValue(
      dashboardResult({
        data: {
          ...summary,
          recentReports: [
            {
              ...mockReports[0],
              predictedDisease: "healthy",
              reviewStatus: "for_field_validation",
            },
          ],
        },
      }),
    );
    const { container } = renderDashboard();

    const table = within(
      screen.getByRole("region", { name: "Recent reports" }),
    ).getByRole("table");
    expect(container.querySelector(".table-scroll")).toContainElement(table);

    const conditionPill = within(table).getByText("No supported disease detected");
    const statusPill = within(table).getByText("Needs field validation");
    expect(conditionPill.closest("td")).toHaveClass(
      "dashboard-report-table__cell-condition",
    );
    expect(statusPill.closest("td")).toHaveClass(
      "dashboard-report-table__cell-status",
    );
    // The pill itself is one element: no wrapping span splits the string.
    expect(conditionPill.tagName).toBe("SPAN");
    expect(statusPill.tagName).toBe("SPAN");
  });

  it("names the timezone once on the page and prints every time in 12-hour form", () => {
    const { container } = renderDashboard();
    const copy = container.textContent ?? "";
    // Single shared location: the page description. No card repeats it and
    // the period-boundary timezone prose is gone entirely.
    expect(copy.match(/PHT \(UTC\+8\)/g) ?? []).toHaveLength(1);
    expect(copy).not.toContain("Period boundaries");
    expect(copy).not.toContain("as of 21:14:03");
    // The freshness stamp is 12-hour with an explicit meridiem marker.
    expect(screen.getByText("9:14:03 PM")).toBeInTheDocument();
  });

  it("renders the header with the scope ruler and an always-visible freshness stamp", () => {
    renderDashboard();

    expect(
      screen.getByText("SRA Don Pedro Mill District Office"),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Report scope" })).toBeInTheDocument();
    expect(screen.getByText("Last updated")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate report" })).toBeInTheDocument();
  });

  it("keeps dashboard copy within the forbidden-word contract", () => {
    const { container } = renderDashboard();

    const copy = container.textContent ?? "";
    for (const word of ANALYTICS_FORBIDDEN_WORDS) {
      expect(copy.toLowerCase()).not.toContain(word.toLowerCase());
    }
    // The one named exception ("Past target date", measured against the
    // recorded target visit date) now lives only in the lazily mounted
    // decision charts, where DecisionCharts.test.tsx asserts it; "overdue"
    // itself stays forbidden everywhere.
    expect(copy.toLowerCase()).not.toContain("overdue");
  });

  it("mounts the three decision charts and the map once period data arrives", async () => {
    vi.useRealTimers();
    vi.mocked(useAnalytics).mockReturnValue(analyticsResult({ data: {
      ...analytics, period: { ...analytics.period, to: manilaDateAt() },
    } }));
    renderDashboard();

    expect(
      await screen.findByText("Inflow: this period vs the previous period"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Reported concern vs Possible Condition"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Validation attention by barangay"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Field-report locations — Nasugbu"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "GPS points" }),
    ).toBeInTheDocument();
  });

  it("mounts no legacy analytics, verification panel, monthly panel or disclosure", () => {
    renderDashboard();

    expect(
      screen.queryByText("Detailed analytics and historical totals"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Monthly submitted report summary")).not.toBeInTheDocument();
    expect(screen.queryByText("Expert verification")).not.toBeInTheDocument();
    expect(screen.queryByText("Report totals")).not.toBeInTheDocument();
    expect(screen.queryByText("Submitted reports over time")).not.toBeInTheDocument();
  });

  it("progressively loads with skeletons instead of a blank page", () => {
    vi.mocked(useDashboard).mockReturnValue(
      dashboardResult({ data: undefined, isPending: true }),
    );
    const { rerender } = renderDashboard();
    expect(screen.getByText("Loading current operations…")).toBeInTheDocument();
    expect(screen.getByText("Loading recent reports…")).toBeInTheDocument();
    // The header and its freshness stamp paint before any request resolves.
    expect(screen.getByText("Last updated")).toBeInTheDocument();

    vi.mocked(useDashboard).mockReturnValue(
      dashboardResult({ data: { ...summary, recentReports: [] } }),
    );
    rerender(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByText("Reports appear here once a device synchronizes."),
    ).toBeInTheDocument();
  });

  it("refreshes on demand and links to the full register", async () => {
    const refetch = vi.fn();
    vi.mocked(useDashboard).mockReturnValue(dashboardResult({ refetch }));
    renderDashboard();

    fireEvent.click(screen.getByRole("button", { name: "Refresh dashboard" }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("link", { name: "View all reports" }),
    ).toHaveAttribute("href", "/reports");
  });

  it("distinguishes access denied from a server error", () => {
    vi.mocked(useDashboard).mockReturnValue(
      dashboardResult({
        data: undefined,
        error: new ApiError("Forbidden", { status: 403 }),
        isError: true,
      }),
    );
    const { rerender } = renderDashboard();
    expect(
      screen.getByText(
        "Your account does not have access to the SRA Don Pedro dashboard.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();

    vi.mocked(useDashboard).mockReturnValue(
      dashboardResult({
        data: undefined,
        error: new ApiError("Server error", { status: 500 }),
        isError: true,
      }),
    );
    rerender(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByText("The dashboard could not be loaded from CaneGuard."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("explains when the dashboard cannot connect to the API", () => {
    vi.mocked(useDashboard).mockReturnValue(
      dashboardResult({
        data: undefined,
        error: new ApiError("Network Error", { cause: new AxiosError("Network Error") }),
        isError: true,
      }),
    );
    renderDashboard();

    expect(screen.getByText(/Cannot connect to the CaneGuard API/)).toBeInTheDocument();
    expect(screen.getByText(/VITE_API_BASE_URL/)).toBeInTheDocument();
  });

  it("distinguishes rate limits and malformed dashboard data", () => {
    vi.mocked(useDashboard).mockReturnValue(
      dashboardResult({
        data: undefined,
        error: new ApiError("Slow down", { status: 429 }),
        isError: true,
      }),
    );
    const { rerender } = renderDashboard();
    expect(screen.getByText(/too many requests/i)).toBeInTheDocument();

    vi.mocked(useDashboard).mockReturnValue(
      dashboardResult({
        data: undefined,
        error: new ZodError([]),
        isError: true,
      }),
    );
    rerender(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/unexpected format/i)).toBeInTheDocument();
  });

  it("keeps cached data visible when a refresh fails", () => {
    vi.mocked(useDashboard).mockReturnValue(
      dashboardResult({ isError: true, isRefetchError: true }),
    );
    renderDashboard();

    expect(
      screen.getByText(
        "The latest refresh failed. Showing the most recently loaded dashboard.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open CG-2026-0718" }),
    ).toBeInTheDocument();
  });
});

describe("DashboardPage control memory", () => {
  function stored(): Record<string, unknown> {
    return JSON.parse(
      window.localStorage.getItem(DASHBOARD_PREFERENCES_STORAGE_KEY) ?? "null",
    ) as Record<string, unknown>;
  }

  it("brings back the chosen month after the page is left and reopened, and queries follow it", () => {
    const { unmount } = renderDashboard();
    expect(screen.getByLabelText("Scope month")).toHaveValue("2026-09");

    fireEvent.change(screen.getByLabelText("Scope month"), {
      target: { value: "2026-08" },
    });
    expect(useDashboard).toHaveBeenLastCalledWith(
      "2026-08",
      dashboardSummaryOptions,
    );

    // Leaving the route unmounts the page; the dashboard is opened again later.
    unmount();
    renderDashboard();

    expect(screen.getByLabelText("Scope month")).toHaveValue("2026-08");
    expect(useDashboard).toHaveBeenLastCalledWith(
      "2026-08",
      dashboardSummaryOptions,
    );
    expect(useAnalytics).toHaveBeenLastCalledWith(
      { from: "2026-08-01", to: "2026-08-31", granularity: "day" },
      { enabled: true },
    );
  });

  it("brings back a custom window and keeps its dates in the ruler", () => {
    const { unmount } = renderDashboard();
    fireEvent.click(screen.getByLabelText("Custom"));
    fireEvent.change(screen.getByLabelText("Scope start date"), {
      target: { value: "2026-07-05" },
    });
    fireEvent.change(screen.getByLabelText("Scope end date"), {
      target: { value: "2026-07-19" },
    });

    unmount();
    renderDashboard();

    expect(screen.getByLabelText("Custom")).toBeChecked();
    expect(screen.getByLabelText("Scope start date")).toHaveValue("2026-07-05");
    expect(screen.getByLabelText("Scope end date")).toHaveValue("2026-07-19");
    expect(useDashboard).toHaveBeenLastCalledWith(
      "2026-07",
      dashboardSummaryOptions,
    );
    expect(useAnalytics).toHaveBeenLastCalledWith(
      { from: "2026-07-05", to: "2026-07-19", granularity: "day" },
      { enabled: true },
    );
  });

  it("brings back the last-30-days mode resolved against today", () => {
    const { unmount } = renderDashboard();
    fireEvent.click(screen.getByLabelText("Last 30 days"));

    unmount();
    renderDashboard();

    expect(screen.getByLabelText("Last 30 days")).toBeChecked();
    expect(useAnalytics).toHaveBeenLastCalledWith(
      { from: "2026-08-26", to: "2026-09-24", granularity: "day" },
      { enabled: true },
    );
  });

  it("writes the chosen scope into the versioned store", () => {
    renderDashboard();
    fireEvent.change(screen.getByLabelText("Scope month"), {
      target: { value: "2026-08" },
    });

    expect(stored().version).toBe(DASHBOARD_PREFERENCES_VERSION);
    expect((stored().selection as ScopeSelection).mode).toBe("month");
    expect((stored().selection as ScopeSelection).month).toBe("2026-08");
  });

  it("falls back to the current defaults when the stored scope is corrupt", () => {
    window.localStorage.setItem(
      DASHBOARD_PREFERENCES_STORAGE_KEY,
      "{ half-written",
    );

    renderDashboard();

    expect(screen.getByLabelText("Scope month")).toHaveValue("2026-09");
    expect(useDashboard).toHaveBeenLastCalledWith(
      "2026-09",
      dashboardSummaryOptions,
    );
    expect(
      screen.getByRole("heading", { name: "Current operations" }),
    ).toBeInTheDocument();
  });

  it("falls back to the current defaults for an unreadable stored version", () => {
    window.localStorage.setItem(
      DASHBOARD_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        version: DASHBOARD_PREFERENCES_VERSION + 1,
        selection: {
          mode: "custom",
          month: "2026-01",
          from: "2026-01-01",
          to: "2026-01-09",
        },
        mapLayer: "gps",
      }),
    );

    renderDashboard();

    expect(screen.getByLabelText("Scope month")).toHaveValue("2026-09");
    expect(useDashboard).toHaveBeenLastCalledWith(
      "2026-09",
      dashboardSummaryOptions,
    );
  });

  it("falls back when the stored month has not started yet", () => {
    window.localStorage.setItem(
      DASHBOARD_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        version: DASHBOARD_PREFERENCES_VERSION,
        selection: {
          mode: "month",
          month: "2026-10",
          from: "2026-10-01",
          to: "2026-10-31",
        },
        mapLayer: "barangay",
      }),
    );

    renderDashboard();

    expect(screen.getByLabelText("Scope month")).toHaveValue("2026-09");
    expect(useDashboard).toHaveBeenLastCalledWith(
      "2026-09",
      dashboardSummaryOptions,
    );
  });
});
