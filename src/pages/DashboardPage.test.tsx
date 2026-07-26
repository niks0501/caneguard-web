import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
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
  it("shows all planned totals, recent reports, and safe language", () => {
    renderDashboard();

    const primary = within(
      screen.getByRole("region", { name: "Report overview" }),
    );
    expect(primary.getByText("Total submitted")).toBeInTheDocument();
    expect(primary.getByText("Submitted–unverified")).toBeInTheDocument();
    expect(primary.getByText("For field validation")).toBeInTheDocument();
    expect(primary.getByText("Verified by staff")).toBeInTheDocument();
    const secondary = within(
      screen.getByRole("region", {
        name: "Additional report status totals",
      }),
    );
    expect(secondary.getByText("Unable to verify")).toBeInTheDocument();
    expect(secondary.getByText("Resolved")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open CG-2026-0718" }),
    ).toHaveAttribute(
      "href",
      "/reports/00000000-0000-4000-8000-000000000001",
    );
    expect(
      screen.queryByText(/confirmed cases?/i),
    ).not.toBeInTheDocument();
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
