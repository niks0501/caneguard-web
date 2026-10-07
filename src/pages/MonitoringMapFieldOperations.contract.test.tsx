// Independent frozen-contract tests: issue 267. Do not weaken for implementation.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockReports } from "../data/mock/mockReports";
import { useFieldReporters } from "../hooks/useFieldReporters";
import { useReports, useUpdateReportReview } from "../hooks/useReports";
import { useFieldValidationMap, useFieldValidationQueue } from "../hooks/useFieldValidation";
import { FieldOperationsPage } from "./FieldOperationsPage";
import { FieldValidationMapPage } from "./FieldValidationMapPage";

// Only replace the provider boundary; the page controls initial disclosure visibility.
vi.mock("../components/fieldValidation/ValidationMap", () => ({
  ValidationMap: () => <div role="region" aria-label="Map provider boundary" />,
}));
vi.mock("../hooks/useFieldReporters", () => ({ useFieldReporters: vi.fn() }));
vi.mock("../hooks/useReports", () => ({ useReports: vi.fn(), useUpdateReportReview: vi.fn() }));
vi.mock("../hooks/useFieldValidation", () => ({ useFieldValidationMap: vi.fn(), useFieldValidationQueue: vi.fn() }));

function loaded<T>(data: T) {
  return { data, error: null, isError: false, isFetching: false, isPending: false,
    isRefetchError: false, refetch: vi.fn() } as never;
}

beforeEach(() => {
  vi.mocked(useReports).mockReturnValue(loaded({ reports: [mockReports[1]], meta: { total: 1 } }));
  vi.mocked(useFieldReporters).mockReturnValue(loaded([{ uuid: "inspector-2", name: "Inspector Two" }]));
  vi.mocked(useUpdateReportReview).mockReturnValue(loaded(undefined));
  vi.mocked(useFieldValidationMap).mockReturnValue(loaded({ type: "FeatureCollection", features: [],
    metadata: { totalCount: 0, locatedCount: 0, unlocatedCount: 0, limit: 1000, returnedCount: 0, truncated: false } }));
  vi.mocked(useFieldValidationQueue).mockReturnValue(loaded({ queue: "needs_visit", count: 0, oldest: null, items: [] }));
});

describe("issue 267 protected observable contract", () => {
  it("AC-01: does not initially hide the map inside a collapsed disclosure", () => {
    render(<MemoryRouter><FieldValidationMapPage /></MemoryRouter>);
    // Unavailable provider is acceptable; the primary map workspace itself must be visible.
    const map = screen.getByRole("region", { name: "Map provider boundary", hidden: true });
    expect(map).toBeInTheDocument();
    const disclosure = map.closest("details");
    if (disclosure) expect(disclosure).toHaveAttribute("open");
  });

  it("AC-41: no assignment inputs are repeated in the default read-first visit rows", () => {
    render(<MemoryRouter><FieldOperationsPage /></MemoryRouter>);
    expect(screen.getByText(mockReports[1].referenceCode)).toBeInTheDocument();
    expect(screen.queryByLabelText("Inspector")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Target visit date")).not.toBeInTheDocument();
  });

  it("AC-34: default workload exposes the three operational sections", () => {
    render(<MemoryRouter><FieldOperationsPage /></MemoryRouter>);
    for (const name of ["Overdue", "Unassigned", "Upcoming"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
  });
});

