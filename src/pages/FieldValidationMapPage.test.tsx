import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/ApiError";
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
  metadata: { totalCount: 2, locatedCount: 1, unlocatedCount: 1 },
};

const queueData: FieldValidationQueueData = {
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
  it("renders the map fallback, coverage warning, fixed queue, and report links", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Field-validation map" })).toBeInTheDocument();
    expect(screen.getByText("Interactive map unavailable")).toBeInTheDocument();
    expect(screen.getByText(/1 filtered report has no valid coordinate pair/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Field validations needed" })).toBeInTheDocument();
    expect(screen.getAllByText("Needs field validation").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Open Report" })[0]).toHaveAttribute(
      "href",
      "/reports/report-1",
    );
  });

  it("applies draft filters to the URL without changing the fixed queue scope", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText("Possible AI result"), "rust");
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
    expect(screen.queryByRole("link", { name: "Open Report" })).not.toBeInTheDocument();
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
