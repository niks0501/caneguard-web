import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ZodError } from "zod";
import { AxiosError } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/ApiError";
import { mockReports } from "../data/mock/mockReports";
import { useDashboard } from "../hooks/useDashboard";
import { useMonthlyReportSummary } from "../hooks/useReports";
import { DashboardPage } from "./DashboardPage";

vi.mock("../components/dashboard/AnalyticsSection", () => ({
  AnalyticsSection: () => <section aria-label="Report analytics" />,
}));

vi.mock("../hooks/useDashboard", () => ({
  useDashboard: vi.fn(),
}));

vi.mock("../hooks/useReports", () => ({
  useMonthlyReportSummary: vi.fn(),
}));


const summary = {
  totalSubmitted: 8,
  queues: {
    needs_review: 3,
    needs_visit: 1,
    follow_up_due: 0,
  },
  counts: {
    submitted_unverified: 3,
    for_field_validation: 1,
    verified_by_staff: 2,
    unable_to_verify: 1,
    resolved: 1,
  },
  recentReports: mockReports.slice(0, 5),
};

function dashboardResult(
  overrides: Record<string, unknown> = {},
): ReturnType<typeof useDashboard> {
  return {
    data: summary,
    dataUpdatedAt: new Date("2026-07-27T01:00:00+08:00").getTime(),
    error: null,
    isError: false,
    isFetching: false,
    isPending: false,
    isRefetchError: false,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useDashboard>;
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
  vi.mocked(useMonthlyReportSummary).mockReturnValue({
    data: {
      month: "2026-07",
      period: { from: "2026-07-01", to: "2026-07-31" },
      reportedCases: 3,
      expertVerification: {
        consultVolume: {
          total: 3,
          consultedCases: 3,
          pending: 1,
          inProgress: 0,
          completed: 2,
          cancelled: 0,
        },
        expertAgreement: {
          count: 2,
          denominator: 2,
          rate: 1.0,
          percentage: 100,
        },
        unableToClassifyRate: {
          count: 0,
          denominator: 2,
          rate: 0,
          percentage: 0,
        },
        symptomVerificationDisagreement: {
          count: 0,
          denominator: 2,
          rate: 0,
          percentage: 0,
        },
      },
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useMonthlyReportSummary>);
});


describe("DashboardPage", () => {
  it("requests the current PHT month by default and allows changing it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T16:30:00.000Z"));
    vi.mocked(useDashboard).mockReturnValue(dashboardResult({
      data: {
        ...summary,
        monthlySummary: {
          month: "2026-09",
          period: { from: "2026-09-01", to: "2026-09-30" },
          reportedCases: 0,
          casesByBarangay: [],
          casesByPossibleCondition: [],
          estimatedAffectedHectares: 0,
          fieldValidationCounts: {
            unassigned: 0,
            assigned: 0,
            inProgress: 0,
            completed: 0,
            requiringValidation: 0,
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
      },
    }));

    renderDashboard();
    expect(useDashboard).toHaveBeenLastCalledWith("2026-09");

    fireEvent.change(screen.getByLabelText("Summary month"), { target: { value: "2026-08" } });
    expect(useDashboard).toHaveBeenLastCalledWith("2026-08");
  });

  it("leads with office queues and reports, with analytics behind a disclosure", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const queues = within(
      screen.getByRole("region", { name: "Operational queues" }),
    );
    expect(queues.getByText("Needs Review")).toBeInTheDocument();
    expect(queues.getByText("Needs Visit")).toBeInTheDocument();
    expect(queues.getByText("Follow-up Due")).toBeInTheDocument();
    expect(queues.getByText("Upcoming Visits")).toBeInTheDocument();
    expect(queues.getByText("Unverified, no active work")).toBeInTheDocument();
    expect(queues.getByText("3")).toBeInTheDocument();
    expect(queues.getByText("1")).toBeInTheDocument();
    expect(
      queues.getByRole("link", { name: "Open Needs Review queue" }),
    ).toHaveAttribute("href", "/reports?queue=needs_review");
    expect(
      queues.getByRole("link", { name: "Open Needs Visit queue" }),
    ).toHaveAttribute("href", "/map?queue=needs_visit");
    expect(
      queues.getByRole("link", { name: "Open Follow-up Due queue" }),
    ).toHaveAttribute("href", "/map?queue=follow_up_due");

    expect(screen.getByRole("button", { name: "Generate report" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Report analytics" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Historical report totals" })).not.toBeInTheDocument();
    await user.click(
      screen.getByText("Detailed analytics and historical totals"),
    );
    expect(screen.getByRole("region", { name: "Report analytics" })).toBeInTheDocument();
    const historical = within(
      screen.getByRole("region", { name: "Historical report totals" }),
    );
    expect(historical.getByText("Total submitted")).toBeInTheDocument();
    expect(historical.getByText("Verified by staff")).toBeInTheDocument();
    expect(historical.getByText("Unable to verify")).toBeInTheDocument();
    expect(historical.getByText("Resolved")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open CG-2026-0718" }),
    ).toHaveAttribute(
      "href",
      "/reports/00000000-0000-4000-8000-000000000001",
    );
    expect(
      screen.getByRole("img", {
        name: "Submitted photo for CG-2026-0718",
      }),
    ).toHaveAttribute("src", mockReports[0].imageUrl);
    expect(screen.queryByRole("region", { name: /Start with Needs Review/ })).not.toBeInTheDocument();
    const recentReports = within(
      screen.getByRole("region", { name: "Recent reports" }),
    );
    expect(recentReports.getAllByText("Mosaic").length).toBeGreaterThan(0);
    expect(screen.queryByText("Possible Condition: Mosaic")).not.toBeInTheDocument();

    await user.click(screen.getByText("Detailed analytics and historical totals"));
    expect(screen.queryByRole("region", { name: "Report analytics" })).not.toBeInTheDocument();
    await user.click(screen.getByText("Detailed analytics and historical totals"));
    expect(screen.getByRole("region", { name: "Report analytics" })).toBeInTheDocument();
  });

  it("renders monthly case summaries", async () => {
    vi.mocked(useDashboard).mockReturnValue(
      dashboardResult({
        data: {
          ...summary,
          monthlySummary: {
            month: "2026-07",
            period: { from: "2026-07-01", to: "2026-07-31" },
            reportedCases: 4,
            casesByBarangay: [{ barangay: "Mabini", reportedCases: 3 }],
            casesByPossibleCondition: [
              { possibleCondition: "rust", reportedCases: 2 },
              { possibleCondition: "smut", reportedCases: 1 },
            ],
            estimatedAffectedHectares: 3.75,
            reportsContainingFarmerFarmInformation: 2,
            fieldValidationCounts: {
              unassigned: 1,
              assigned: 1,
              inProgress: 0,
              completed: 2,
              requiringValidation: 1,
            },
            closedCases: 2,
            reviewTime: {
              source: "submitted_at_to_reviewed_at",
              reviewedCases: 2,
              averageHours: 30,
              medianHours: 30,
              minHours: 6,
              maxHours: 54,
            },
          },
        },
      }),
    );
    renderDashboard();

    const monthly = within(
      screen.getByRole("region", { name: "Monthly submitted report summary" }),
    );
    expect(monthly.getByText("Submitted reports")).toBeInTheDocument();
    expect(monthly.getByText("Estimated affected area")).toBeInTheDocument();
    expect(monthly.getByText("Requiring field validation")).toBeInTheDocument();
    expect(monthly.getByText("Closed submitted reports")).toBeInTheDocument();
    expect(monthly.getByRole("heading", { name: "Field-validation counts" })).toBeInTheDocument();
    expect(monthly.queryByRole("heading", { name: "Review time" })).not.toBeInTheDocument();
    expect(monthly.queryByText(/farmer/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Report analytics" })).not.toBeInTheDocument();
  });

  it("refreshes on demand and links to the full queue", async () => {
    const refetch = vi.fn();
    vi.mocked(useDashboard).mockReturnValue(dashboardResult({ refetch }));
    const user = userEvent.setup();
    renderDashboard();

    await user.click(
      screen.getByRole("button", { name: "Refresh dashboard" }),
    );

    expect(refetch).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("link", { name: "View all reports" }),
    ).toHaveAttribute("href", "/reports");
  });

  it("shows a zero due queue without inventing a deadline", () => {
    vi.mocked(useDashboard).mockReturnValue(
      dashboardResult({
        data: {
          ...summary,
          queues: { ...summary.queues, needs_review: 0, needs_visit: 0, follow_up_due: 0 },
        },
      }),
    );
    renderDashboard();

    expect(screen.getByRole("link", { name: "Open Follow-up Due queue" })).toBeInTheDocument();
  });

  it("shows loading and empty states", () => {
    vi.mocked(useDashboard).mockReturnValue(
      dashboardResult({ data: undefined, isPending: true }),
    );
    const { rerender } = renderDashboard();
    expect(
      screen.getByText("Loading the SRA Don Pedro report overview..."),
    ).toBeInTheDocument();

    vi.mocked(useDashboard).mockReturnValue(
      dashboardResult({
        data: { ...summary, recentReports: [] },
      }),
    );
    rerender(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("No submitted reports yet")).toBeInTheDocument();
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
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();

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
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
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

  it("keeps expert verification available in secondary analytics", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByText("Detailed analytics and historical totals"));
    const expertPanel = screen.getByRole("region", {
      name: "Expert verification",
    });
    expect(expertPanel).toBeInTheDocument();
    expect(within(expertPanel).getByText("Total consults")).toBeInTheDocument();
    expect(within(expertPanel).getAllByText("Completed").length).toBeGreaterThanOrEqual(1);
    const findingOutcomes = within(expertPanel).getByRole("region", {
      name: "Finding outcomes",
    });
    expect(within(findingOutcomes).getByText("Agreed with Possible Condition")).toBeInTheDocument();
  });
});


