import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { FieldSurveyBoundariesData, FieldSurveyBoundaryFeature } from "../../domain/fieldSurvey.types";
import { BoundariesList } from "./BoundariesList";

function feature(
  id: number,
  overrides: Partial<FieldSurveyBoundaryFeature["properties"]> = {},
): FieldSurveyBoundaryFeature {
  return {
    type: "Feature",
    id: String(id),
    geometry: {
      type: "Polygon",
      coordinates: [[[122.95, 10.7], [122.951, 10.7], [122.951, 10.701], [122.95, 10.7]]],
    },
    properties: {
      id,
      capturedAt: "2026-10-04T02:30:12.123456Z",
      areaSqm: 12_000,
      areaSource: "device_reported",
      affectedAreas: [],
      affectedAreaSqm: null,
      affectedAreaMeasurement: "not_measured",
      cases: [],
      inspector: { uuid: "inspector-1", name: "Maria Santos" },
      ...overrides,
    },
  };
}

function renderList(features: FieldSurveyBoundaryFeature[]) {
  const data: FieldSurveyBoundariesData = {
    type: "FeatureCollection",
    features,
    metadata: {
      totalCount: features.length,
      returnedCount: features.length,
      limit: 100,
      truncated: false,
      page: 1,
      pageCount: 1,
    },
  };

  return render(
    <MemoryRouter>
      <BoundariesList data={data} selectedBoundaryId={null} onSelect={vi.fn()} />
    </MemoryRouter>,
  );
}

describe("BoundariesList", () => {
  it("shows plot area, affected ground area, percentage, confirmed zero, unmeasured, and small patches", () => {
    renderList([
      feature(1, { label: "Plot A", areaSqm: 12_000, affectedAreaSqm: 3_000, affectedAreaMeasurement: "measured" }),
      feature(2, { label: "Plot Unmeasured", areaSqm: 12_000, affectedAreaSqm: 0, affectedAreaMeasurement: "not_measured" }),
      feature(3, { label: "Plot Zero", areaSqm: 12_000, affectedAreaSqm: 0, affectedAreaMeasurement: "measured" }),
      feature(4, { label: "Plot Tiny", areaSqm: 12_000, affectedAreaSqm: 40, affectedAreaMeasurement: "measured" }),
    ]);

    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("1.2 ha")).toBeInTheDocument();
    expect(within(rows[0]).getByText("0.3 ha · 25%")).toBeInTheDocument();

    expect(within(rows[1]).getByText("1.2 ha")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Not measured")).toBeInTheDocument();
    expect(within(rows[1]).queryByText("0%")).not.toBeInTheDocument();

    expect(within(rows[2]).getByText("0 ha · 0%")).toBeInTheDocument();
    expect(within(rows[3]).getByText("0.004 ha · 0.3%")).toBeInTheDocument();
  });
});
