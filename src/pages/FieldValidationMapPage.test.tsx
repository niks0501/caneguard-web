import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/ApiError";
import { ZodError } from "zod";
import type {
  FieldValidationMapData,
  FieldValidationQueueData,
} from "../domain/fieldValidation.types";
import {
  useFieldValidationMap,
  useFieldValidationQueue,
} from "../hooks/useFieldValidation";
import { FieldValidationMapPage } from "./FieldValidationMapPage";

vi.mock("../hooks/useFieldValidation", () => ({
  useFieldValidationMap: vi.fn(),
  useFieldValidationQueue: vi.fn(),
}));

const mapData: FieldValidationMapData = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "report-1",
      geometry: { type: "Point", coordinates: [122.9876543, 10.1234567] },
      properties: {
        uuid: "report-1",
        referenceCode: "CG-2026-0001",
        barangay: "Mabini",
        province: "Negros Occidental",
        municipality: "Bago",
        observedAt: "2026-08-13T10:20:30.000Z",
        submittedAt: "2026-08-13T11:00:00.000Z",
        predictedDisease: "rust",
        confidence: 0.84,
        reviewStatus: "for_field_validation",
        locationSource: "gps",
        gpsAccuracy: 8.5,
        affectedAreaHectares: 2.5,
        affectedPortionPercent: 18,
      },
    },
  ],
  metadata: {
    totalCount: 2,
    locatedCount: 1,
    unlocatedCount: 1,
    limit: 1000,
    returnedCount: 1,
    truncated: false,
  },
};

const queueData: FieldValidationQueueData = {
  queue: "needs_visit",
  count: 1,
  oldest: {
    uuid: "report-1",
    referenceCode: "CG-2026-0001",
    barangay: "Mabini",
    province: "Negros Occidental",
    municipality: "Bago",
    observedAt: "2026-08-13T10:20:30.000Z",
    submittedAt: "2026-08-13T11:00:00.000Z",
    predictedDisease: "rust",
    confidence: 0.84,
    reviewStatus: "for_field_validation",
    finalLatitude: 10.1234567,
    finalLongitude: 122.9876543,
    locationSource: "gps",
    gpsAccuracy: 8.5,
    affectedAreaHectares: 2.5,
    affectedPortionPercent: 18,
  },
  items: [],
};

function queryResult(data: unknown, overrides: Record<string, unknown> = {}) {
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
  return <output data-testid="location">{useLocation().search}</output>;
}

function renderPage(initialEntry = "/map") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <FieldValidationMapPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(useFieldValidationMap).mockReturnValue(queryResult(mapData));
  vi.mocked(useFieldValidationQueue).mockReturnValue(queryResult(queueData));
});

describe("FieldValidationMapPage", () => {
  it("renders the map fallback, coverage warning, operational queue, and report links", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Field-validation map" })).toBeInTheDocument();
    expect(screen.getByText("Map provider is not configured.")).toBeInTheDocument();
    expect(screen.getByText(/1 located, 1 unlocated/)).toBeInTheDocument();
    expect(screen.getByText(/1 filtered report has no valid coordinate pair/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Field validations needed" })).toBeInTheDocument();
    expect(screen.getAllByText("Needs field validation").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Open Report" })[0]).toHaveAttribute(
      "href",
      "/reports/report-1",
    );
  });

  it("communicates when the API bounds the map result set", () => {
    vi.mocked(useFieldValidationMap).mockReturnValue(
      queryResult({
        ...mapData,
        metadata: {
          ...mapData.metadata,
          totalCount: 1001,
          locatedCount: 1001,
          unlocatedCount: 0,
          limit: 1000,
          returnedCount: 1000,
          truncated: true,
        },
      }),
    );
    renderPage();

    expect(screen.getByText(/Showing 1000 of 1001 matching reports on the map/)).toBeInTheDocument();
  });

  it("keeps the queue available when the map request fails", () => {
    vi.mocked(useFieldValidationMap).mockReturnValue(
      queryResult(undefined, {
        error: new ApiError("Unavailable", { status: 503 }),
        isError: true,
      }),
    );
    renderPage();

    expect(screen.getByText(/field-validation map is unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Field validations needed" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Report" })).toHaveAttribute(
      "href",
      "/reports/report-1",
    );
  });

  it("keeps map data available when the queue request fails", () => {
    vi.mocked(useFieldValidationQueue).mockReturnValue(
      queryResult(undefined, {
        error: new ApiError("Unavailable", { status: 503 }),
        isError: true,
      }),
    );
    renderPage();

    expect(screen.getByText("Map provider is not configured.")).toBeInTheDocument();
    expect(screen.getByText(/field-validation queue is unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Located observations" })).toBeInTheDocument();
  });

  it("keeps cached map data and the queue usable when the queue refresh fails", () => {
    vi.mocked(useFieldValidationQueue).mockReturnValue(
      queryResult(queueData, {
        error: new ApiError("Unavailable", { status: 503 }),
        isError: true,
        isRefetchError: true,
      }),
    );
    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(/most recently loaded map and queue/i);
    expect(screen.getByRole("heading", { name: "Located observations" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Field validations needed" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open Report" })[0]).toHaveAttribute(
      "href",
      "/reports/report-1",
    );
  });

  it("keeps cached data visible after a refresh error", () => {
    vi.mocked(useFieldValidationMap).mockReturnValue(
      queryResult(mapData, {
        error: new ApiError("Unavailable", { status: 503 }),
        isError: true,
        isRefetchError: true,
      }),
    );
    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(/most recently loaded map and queue/i);
    expect(screen.getByRole("heading", { name: "Located observations" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Field validations needed" })).toBeInTheDocument();
  });

  it("distinguishes no matching reports from the located table empty state", () => {
    const emptyMap: FieldValidationMapData = {
      type: "FeatureCollection",
      features: [],
      metadata: {
        totalCount: 0,
        locatedCount: 0,
        unlocatedCount: 0,
        limit: 1000,
        returnedCount: 0,
        truncated: false,
      },
    };
    vi.mocked(useFieldValidationMap).mockReturnValue(queryResult(emptyMap));
    renderPage();

    expect(screen.getByText("No reports match the applied filters.")).toBeInTheDocument();
    expect(screen.getByText("No located observations match the applied filters.")).toBeInTheDocument();
  });

  it("reports when matching reports have no coordinate pair", () => {
    const unlocatedMap: FieldValidationMapData = {
      type: "FeatureCollection",
      features: [],
      metadata: {
        totalCount: 2,
        locatedCount: 0,
        unlocatedCount: 2,
        limit: 1000,
        returnedCount: 0,
        truncated: false,
      },
    };
    vi.mocked(useFieldValidationMap).mockReturnValue(queryResult(unlocatedMap));
    renderPage();

    expect(screen.getByText(/0 located, 2 unlocated/)).toBeInTheDocument();
    expect(screen.getByText(/2 filtered reports have no valid coordinate pair/)).toBeInTheDocument();
  });

  it("reports malformed map data without hiding a healthy queue", () => {
    vi.mocked(useFieldValidationMap).mockReturnValue(
      queryResult(undefined, {
        error: new ZodError([]),
        isError: true,
      }),
    );
    renderPage();

    expect(screen.getByText(/unexpected map format/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Field validations needed" })).toBeInTheDocument();
  });

  it("applies draft filters to the URL without changing the queue scope", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText("Possible Condition"), "rust");
    await user.type(screen.getByLabelText("Barangay"), "Mabini");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(screen.getByTestId("location")).toHaveTextContent(
      "?predicted_label=rust&barangay=Mabini",
    );
    expect(useFieldValidationMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ disease: "rust", barangay: "Mabini" }),
      { enabled: true },
    );
    expect(useFieldValidationQueue).toHaveBeenLastCalledWith(
      expect.objectContaining({ disease: "rust", barangay: "Mabini", status: undefined }),
      { enabled: true },
    );
  });

  it("preserves the follow-up-due queue in the filtered workspace", () => {
    vi.mocked(useFieldValidationQueue).mockReturnValue(
      queryResult({ ...queueData, queue: "follow_up_due" }),
    );
    renderPage("/map?queue=follow_up_due");

    expect(screen.getByRole("heading", { name: "Follow-up due workspace" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Follow-up due" })).toBeInTheDocument();
    expect(useFieldValidationQueue).toHaveBeenCalledWith(
      expect.objectContaining({ queue: "follow_up_due" }),
      { enabled: true },
    );
  });

  it("does not render cached reports after access is revoked", () => {
    vi.mocked(useFieldValidationMap).mockReturnValue(
      queryResult(mapData, {
        error: new ApiError("Forbidden", { status: 403 }),
        isError: true,
        isRefetchError: true,
      }),
    );
    renderPage();
    expect(screen.getByText(/does not have access to the field-validation map/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Located observations" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Field validations needed" })).toBeInTheDocument();
  });

  it("distinguishes an access-denied map from a generic map failure", () => {
    vi.mocked(useFieldValidationMap).mockReturnValue(
      queryResult(undefined, {
        error: new ApiError("Forbidden", { status: 403 }),
        isError: true,
      }),
    );
    const { rerender } = renderPage();
    expect(screen.getByText(/does not have access to the field-validation map/i)).toBeInTheDocument();

    vi.mocked(useFieldValidationMap).mockReturnValue(
      queryResult(undefined, {
        error: new ApiError("Unavailable", { status: 503 }),
        isError: true,
      }),
    );
    rerender(
      <MemoryRouter>
        <FieldValidationMapPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/field-validation map is unavailable/i)).toBeInTheDocument();
  });
});
