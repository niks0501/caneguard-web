import { render, screen, within } from "@testing-library/react";
import { AxiosError } from "axios";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../app/queryClient";
import { ApiError } from "../api/ApiError";
import { env } from "../config/env";
import { apiEndpointDetail } from "../lib/serviceMessages";
import { mockReports } from "../data/mock/mockReports";
import { useFieldValidationQueue } from "../hooks/useFieldValidation";
import { useExportReports, useReports } from "../hooks/useReports";
import { MonitoringWorkspacePage } from "./MonitoringWorkspacePage";

vi.mock("../hooks/useFieldValidation", () => ({ useFieldValidationQueue: vi.fn() }));
vi.mock("../hooks/useReports", () => ({ useReports: vi.fn(), useExportReports: vi.fn() }));
vi.mock("./FieldValidationMapPage", () => ({ FieldValidationMapPage: () => <p>Map view</p> }));

function result<T>(data: T, overrides: Record<string, unknown> = {}) {
  return { data, error: null, isError: false, isFetching: false, isPending: false, isRefetchError: false, refetch: vi.fn(), ...overrides } as never;
}

describe("MonitoringWorkspacePage", () => {
  beforeEach(() => {
    vi.mocked(useReports).mockReturnValue(result({ reports: mockReports.slice(0, 1), meta: { currentPage: 1, lastPage: 1, total: 1 } }));
    vi.mocked(useExportReports).mockReturnValue(result(undefined));
    vi.mocked(useFieldValidationQueue).mockReturnValue(result({ queue: "needs_visit", count: 0, total: 0, items: [], oldest: null }));
  });

  it("exposes the five workspace views and opens the map on the bare workspace route", async () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/monitoring"]}><MonitoringWorkspacePage /></MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Map view")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Map" })).toHaveAttribute("href", "/monitoring?view=map");
    expect(screen.getByRole("link", { name: "Map" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "List" })).toHaveAttribute("href", "/monitoring?view=register");
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/monitoring?view=calendar");
    expect(screen.getByRole("link", { name: "Assignments" })).toHaveAttribute("href", "/monitoring?view=field-operations");
    expect(screen.getByRole("link", { name: "Field boundaries" })).toHaveAttribute("href", "/monitoring?view=boundaries");
  });
});

describe("MonitoringWorkspacePage calendar freshness", () => {
  it("uses staff-facing connection guidance and collapsed endpoint detail on first-read failure", () => {
    const error = new ApiError("Network Error", { cause: new AxiosError("Network Error") });
    vi.mocked(useFieldValidationQueue).mockReturnValue(result(undefined, { error, isError: true }));

    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/monitoring?view=calendar"]}><MonitoringWorkspacePage /></MemoryRouter>
      </QueryClientProvider>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("CaneGuard cannot be reached right now.");
    expect(alert).toHaveTextContent("contact your office administrator");
    expect(within(alert).getByText(/CaneGuard cannot be reached right now/)).not.toHaveTextContent(env.apiBaseUrl);
    const details = within(alert).getByText("Technical details").closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(within(details as HTMLElement).getByText(apiEndpointDetail(env.apiBaseUrl))).toBeInTheDocument();
  });

  it("uses stale-data guidance when the calendar refresh fails", () => {
    const error = new ApiError("Network Error", { cause: new AxiosError("Network Error") });
    vi.mocked(useFieldValidationQueue).mockReturnValue(result(
      { queue: "needs_visit", count: 1, total: 1, items: [], oldest: null },
      { error, isError: true, isRefetchError: true },
    ));

    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/monitoring?view=calendar"]}><MonitoringWorkspacePage /></MemoryRouter>
      </QueryClientProvider>,
    );

    const warning = screen.getByRole("alert");
    expect(warning).toHaveTextContent("last loaded data stays visible and may be stale");
    expect(warning).toHaveTextContent("contact your office administrator");
  });

  it("stamps the calendar's server read in 12-hour Manila time", () => {
    vi.mocked(useFieldValidationQueue).mockReturnValue({
      data: { queue: "needs_visit", count: 0, total: 0, items: [], oldest: null },
      error: null,
      isError: false,
      isFetching: false,
      isPending: false,
      isRefetchError: false,
      dataUpdatedAt: Date.UTC(2026, 9, 23, 13, 14, 3),
      refetch: vi.fn(),
    } as never);
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/monitoring?view=calendar"]}><MonitoringWorkspacePage /></MemoryRouter>
      </QueryClientProvider>,
    );

    const freshness = screen.getByText("Last updated").closest("p") as HTMLElement;
    // 13:14:03 UTC is 9:14:03 PM in Asia/Manila.
    expect(within(freshness).getByText("9:14:03 PM")).toBeInTheDocument();
  });
});

describe("MonitoringWorkspacePage scope transitions", () => {
  beforeEach(() => {
    vi.mocked(useReports).mockReturnValue(result({ reports: mockReports.slice(0, 1), meta: { currentPage: 1, lastPage: 1, total: 1 } }));
    vi.mocked(useExportReports).mockReturnValue(result(undefined));
    vi.mocked(useFieldValidationQueue).mockReturnValue(result({ queue: "needs_visit", count: 0, total: 0, items: [], oldest: null }));
  });

  it("keeps the work scope when switching views", () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/monitoring?queue=follow_up_due&barangay=Bucana"]}>
          <MonitoringWorkspacePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("link", { name: "Map" })).toHaveAttribute(
      "href",
      "/monitoring?queue=follow_up_due&barangay=Bucana&view=map",
    );
    expect(screen.getByRole("link", { name: "List" })).toHaveAttribute(
      "href",
      "/monitoring?queue=follow_up_due&barangay=Bucana&view=register",
    );
  });

  it("names the filters a view could not honor instead of widening the results", () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter
          initialEntries={[{
            pathname: "/monitoring",
            search: "?view=map&queue=upcoming&location=unlocated",
            state: { scopeNotice: ["Map location"] },
          }]}
        >
          <MonitoringWorkspacePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      screen.getByText("Not applied in this view: Map location."),
    ).toBeInTheDocument();
  });
});
