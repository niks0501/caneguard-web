import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ZodError } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/ApiError";
import { mockReports } from "../data/mock/mockReports";
import { useDashboard } from "../hooks/useDashboard";
import { DashboardPage } from "./DashboardPage";

vi.mock("../hooks/useDashboard", () => ({
  useDashboard: vi.fn(),
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

beforeEach(() => {
  vi.mocked(useDashboard).mockReturnValue(dashboardResult());
});

describe("DashboardPage", () => {
  it("leads with operational queues and keeps historical totals secondary", () => {
    renderDashboard();

    const queues = within(
      screen.getByRole("region", { name: "Operational queues" }),
    );
    expect(queues.getByText("Needs Review")).toBeInTheDocument();
    expect(queues.getByText("Needs Visit")).toBeInTheDocument();
    expect(queues.getByText("Follow-up Due")).toBeInTheDocument();
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
        name: "Submitted evidence for CG-2026-0718",
      }),
    ).toHaveAttribute("src", mockReports[0].imageUrl);
    expect(screen.queryByText(/confirmed cases?/i)).not.toBeInTheDocument();
    const nextAction = screen.getByRole("region", {
      name: "Start with Needs Review",
    });
    expect(nextAction).toHaveTextContent("first active queue");
    expect(
      within(nextAction).getByRole("link", { name: "Open priority queue" }),
    ).toHaveAttribute("href", "/reports?queue=needs_review");
  });

  it("renders monthly case summaries with an operational-statistics boundary", () => {
    vi.mocked(useDashboard).mockReturnValue(
      dashboardResult({
        data: {
          ...summary,
          monthlySummary: {
            month: "2026-07",
            period: { from: "2026-07-01", to: "2026-07-31" },
            reportedCases: 4,
            casesByBarangay: [{ barangay: "Mabini", reportedCases: 3 }],
            casesByPossibleCondition: [{ possibleCondition: "rust", reportedCases: 2 }],
            estimatedAffectedHectares: 3.75,
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

    expect(screen.getByRole("region", { name: "Monthly case summary" })).toHaveTextContent(
      "operational case counts, not population-level disease statistics",
    );
    const monthly = within(
      screen.getByRole("region", { name: "Monthly case summary" }),
    );
    expect(monthly.getByText("3 reported cases")).toBeInTheDocument();
    expect(monthly.getByText("Possible rust")).toBeInTheDocument();
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

    expect(screen.getByText("Target visit date passed; validation remains incomplete.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Follow-up Due queue" })).toBeInTheDocument();
  });

  it("shows loading and empty states", () => {
    vi.mocked(useDashboard).mockReturnValue(
      dashboardResult({ data: undefined, isPending: true }),
    );
    const { rerender } = renderDashboard();
    expect(
      screen.getByText("Loading the municipal report overview..."),
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
        "Your account does not have access to the municipal dashboard.",
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
