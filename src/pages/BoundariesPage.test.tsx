import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/ApiError";
import { ZodError } from "zod";
import type { FieldSurveyBoundariesData } from "../domain/fieldSurvey.types";
import { useFieldSurveys } from "../hooks/fieldSurveys";
import { BoundariesPage } from "./BoundariesPage";

vi.mock("../hooks/fieldSurveys", () => ({ useFieldSurveys: vi.fn() }));
vi.mock("../components/boundaries/BoundariesMap", () => ({
  BoundariesMap: ({
    selectedBoundaryId,
    onSelect,
    onClearSelection,
  }: {
    selectedBoundaryId: string | null;
    onSelect: (id: string, coordinates: [number, number]) => void;
    onClearSelection: () => void;
  }) => (
    <div role="region" aria-label="Map provider boundary">
      <output data-testid="map-selection">{selectedBoundaryId ?? "none"}</output>
      <button type="button" onClick={() => onSelect("123", [122.9505, 10.7005])}>Select boundary from map</button>
      <button type="button" onClick={onClearSelection}>Clear map selection</button>
    </div>
  ),
}));

const oneBoundary: FieldSurveyBoundariesData = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    id: "123",
    geometry: {
      type: "Polygon",
      coordinates: [[[122.95, 10.7], [122.951, 10.7], [122.951, 10.701], [122.95, 10.7]]],
    },
    properties: {
      id: 123,
      capturedAt: "2026-10-04T02:30:12.123456Z",
      areaSqm: 6075.123,
      areaSource: "device_reported",
      inspector: { uuid: "inspector-1", name: "Maria Santos" },
    },
  }],
  metadata: { totalCount: 1, returnedCount: 1, limit: 100, truncated: false },
};

function queryResult(data: FieldSurveyBoundariesData | undefined, overrides: Record<string, unknown> = {}) {
  return {
    data,
    error: null,
    isError: false,
    isFetching: false,
    isPending: false,
    isRefetchError: false,
    refetch: vi.fn(),
    ...overrides,
  } as never;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderPage(initialEntry = "/monitoring?view=boundaries") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <BoundariesPage embedded />
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(useFieldSurveys).mockReturnValue(queryResult(oneBoundary));
});

describe("BoundariesPage", () => {
  it("shows the loading state while boundary data is pending", () => {
    vi.mocked(useFieldSurveys).mockReturnValue(queryResult(undefined, { isPending: true }));
    renderPage();
    expect(screen.getByText("Loading field boundaries...")).toBeInTheDocument();
  });

  it("shows the honest empty state when no field boundaries have synced", () => {
    const empty: FieldSurveyBoundariesData = {
      type: "FeatureCollection",
      features: [],
      metadata: { totalCount: 0, returnedCount: 0, limit: 100, truncated: false },
    };
    vi.mocked(useFieldSurveys).mockReturnValue(queryResult(empty));
    renderPage();
    expect(screen.getByText("No field boundaries recorded yet.")).toBeInTheDocument();
  });

  it("shows an API error with a retry action", async () => {
    const refetch = vi.fn();
    vi.mocked(useFieldSurveys).mockReturnValue(queryResult(undefined, {
      error: new ApiError("No access", { status: 403 }),
      isError: true,
      refetch,
    }));
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Your account does not have access to field boundaries.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("asks the office user to sign in again after an expired session", () => {
    vi.mocked(useFieldSurveys).mockReturnValue(queryResult(undefined, {
      error: new ApiError("Session expired", { status: 401 }),
      isError: true,
    }));
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent("Your office session has expired. Sign in to view field boundaries.");
  });

  it("uses the malformed-data message for an unexpected contract", () => {
    vi.mocked(useFieldSurveys).mockReturnValue(queryResult(undefined, {
      error: new ZodError([]),
      isError: true,
    }));
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent("CaneGuard returned an unexpected boundary format.");
  });

  it("keeps the table and warns when a refresh fails after data has loaded", () => {
    vi.mocked(useFieldSurveys).mockReturnValue(queryResult(oneBoundary, {
      error: new Error("refresh failed"),
      isError: true,
      isRefetchError: true,
    }));
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent("most recently loaded boundaries are still shown and may be stale");
    expect(screen.getByText("Maria Santos")).toBeInTheDocument();
  });

  it("shows the truncated status, Manila time, area provenance, and accessible row actions", () => {
    vi.mocked(useFieldSurveys).mockReturnValue(queryResult({
      ...oneBoundary,
      features: Array.from({ length: 100 }, (_, index) => ({
        ...oneBoundary.features[0],
        id: String(index + 1),
        properties: {
          ...oneBoundary.features[0].properties,
          id: index + 1,
          areaSqm: oneBoundary.features[0].properties.areaSqm + index,
        },
      })),
      metadata: { totalCount: 120, returnedCount: 100, limit: 100, truncated: true },
    }));
    renderPage();

    expect(screen.getByText(/Showing the newest 100 of 120 boundaries\. The rest are not on this map\./)).toHaveAttribute("role", "status");
    expect(screen.getByRole("columnheader", { name: /Area, device-reported/ })).toBeInTheDocument();
    expect(screen.getAllByText("Oct 4, 2026, 10:30 AM")).toHaveLength(100);
    expect(screen.getByText("6,075 m² · 0.61 ha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Show boundary 1 captured Oct 4, 2026, 10:30 AM by Maria Santos on map$/ })).toBeInTheDocument();
  });

  it("selects a row in the map and replaces only the boundary URL state", async () => {
    const user = userEvent.setup();
    renderPage("/monitoring?view=boundaries&sort=newest");

    await user.click(screen.getByRole("button", { name: /^Show boundary 123 captured Oct 4, 2026, 10:30 AM by Maria Santos on map$/ }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/monitoring?view=boundaries&sort=newest&boundary=123"));
    expect(screen.getByTestId("map-selection")).toHaveTextContent("123");
    expect(screen.getByRole("button", { name: /Selected boundary 123 captured/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("restores selection from a deep link and clears the boundary parameter from the map", async () => {
    const user = userEvent.setup();
    renderPage("/monitoring?view=boundaries&boundary=123");

    expect(screen.getByTestId("map-selection")).toHaveTextContent("123");
    expect(screen.getByRole("button", { name: /Selected boundary 123 captured/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Clear map selection" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/monitoring?view=boundaries"));
    expect(screen.getByTestId("map-selection")).toHaveTextContent("none");
  });

  it("writes the selected polygon URL when a map feature is clicked", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Select boundary from map" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("boundary=123"));
  });
});
