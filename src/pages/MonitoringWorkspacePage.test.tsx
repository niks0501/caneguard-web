import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../app/queryClient";
import { mockReports } from "../data/mock/mockReports";
import { useFieldValidationQueue } from "../hooks/useFieldValidation";
import { useExportReports, useReports } from "../hooks/useReports";
import { MonitoringWorkspacePage } from "./MonitoringWorkspacePage";

vi.mock("../hooks/useFieldValidation", () => ({ useFieldValidationQueue: vi.fn() }));
vi.mock("../hooks/useReports", () => ({ useReports: vi.fn(), useExportReports: vi.fn() }));

function result<T>(data: T) {
  return { data, error: null, isError: false, isFetching: false, isPending: false, isRefetchError: false, refetch: vi.fn() } as never;
}

describe("MonitoringWorkspacePage", () => {
  beforeEach(() => {
    vi.mocked(useReports).mockReturnValue(result({ reports: mockReports.slice(0, 1), meta: { currentPage: 1, lastPage: 1, total: 1 } }));
    vi.mocked(useExportReports).mockReturnValue(result(undefined));
    vi.mocked(useFieldValidationQueue).mockReturnValue(result({ queue: "needs_visit", count: 0, total: 0, items: [], oldest: null }));
  });

  it("exposes the five consolidated monitoring views and the separate submitted reports entry", () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/monitoring"]}><MonitoringWorkspacePage /></MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute("href", "/monitoring");
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/monitoring?view=calendar");
    expect(screen.getByRole("link", { name: "Map" })).toHaveAttribute("href", "/monitoring?view=map");
    expect(screen.getByRole("link", { name: "Field Operations" })).toHaveAttribute("href", "/monitoring?view=field-operations");
    expect(screen.getByRole("link", { name: "Field boundaries" })).toHaveAttribute("href", "/monitoring?view=boundaries");
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
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute(
      "href",
      "/monitoring?queue=follow_up_due&barangay=Bucana",
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
