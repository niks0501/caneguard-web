import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ZodError } from "zod";
import { AxiosError } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/ApiError";
import { ANALYTICS_FORBIDDEN_WORDS } from "../components/dashboard/analyticsCopy";
import { mockReports } from "../data/mock/mockReports";
import { useAnalytics } from "../hooks/useAnalytics";
import { useDashboard } from "../hooks/useDashboard";
import { useFieldValidationMap } from "../hooks/useFieldValidation";
import type { ReportAnalytics } from "../domain/dashboard.types";
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
      { from: "2026-09-01", to: "2026-09-30", granularity: "day" },
      { enabled: true },
    );
    expect(useAnalytics).toHaveBeenCalledWith(
      { from: "2026-08-08", to: "2026-08-31", granularity: "day" },
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

    // Queue KPIs are marked current-state in one word instead of repeating a
    // point-in-time sentence and an "as of" stamp on every card.
    expect(snapshot.getAllByText("now")).toHaveLength(3);

    // KPI 3 folds the two calendar subsets in as labelled segments.
    expect(snapshot.getByText("Past target date")).toBeInTheDocument();
    expect(snapshot.getByText("Scheduled ahead")).toBeInTheDocument();
    expect(snapshot.getByText("Unscheduled")).toBeInTheDocument();
    expect(
      snapshot.getByRole("link", { name: "Open the Past target date queue" }),
    ).toHaveAttribute("href", "/map?queue=follow_up_due");
    expect(
      snapshot.getByRole("link", { name: "Open the Scheduled ahead queue" }),
    ).toHaveAttribute("href", "/map?queue=upcoming");
    expect(
      snapshot.getByRole("link", { name: "Open unscheduled validation work" }),
    ).toHaveAttribute("href", "/map?queue=needs_visit");
    expect(
      snapshot.queryByText("1 unassigned · 2 assigned · 1 in progress"),
    ).not.toBeInTheDocument();

    expect(
      snapshot.getByRole("link", { name: "Open the Awaiting review queue" }),
    ).toHaveAttribute("href", "/reports?queue=needs_review");
    expect(
      snapshot.getByRole("link", {
        name: "Open the Unverified, no active work queue",
      }),
    ).toHaveAttribute("href", "/reports?queue=unverified_no_active_work");

    // Waiting-age ladder without hint copy.
    expect(snapshot.getByText("0–2 days waiting")).toBeInTheDocument();
    expect(snapshot.queryByText("Oldest wait 5 days.")).not.toBeInTheDocument();
  });

  it("omits comparison copy from KPI cards when submissions fall or hold steady", () => {
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
    expect(screen.queryByText(/■ No change from 12/)).not.toBeInTheDocument();
  });

  it("states the good outcome when a queue is empty", () => {
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

    expect(screen.getByText("Nothing awaiting review.")).toBeInTheDocument();
    expect(
      screen.getByText("No open field-validation work."),
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

  it("shows recent reports with the reported-concern column and no table prose", () => {
    renderDashboard();

    const recent = within(screen.getByRole("region", { name: "Recent reports" }));
    expect(recent.getByText("Reported concern")).toBeInTheDocument();
    expect(recent.getByText("Possible Condition")).toBeInTheDocument();
    expect(recent.queryByText("Possible Condition (AI)")).not.toBeInTheDocument();
    expect(recent.getAllByText("Not stated").length).toBeGreaterThan(0);
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
    // Possible Condition (AI) is the model's classification, never merged in.
    expect(cells[conditionColumn]).toHaveTextContent("Mosaic");
    expect(cells[conditionColumn]).not.toHaveTextContent("RSSI");
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
    // The one named exception: past target date is measured against the
    // recorded target visit date, while "overdue" itself stays forbidden.
    expect(copy).toContain("Past target date");
  });

  it("mounts the three decision charts and the map once period data arrives", async () => {
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
