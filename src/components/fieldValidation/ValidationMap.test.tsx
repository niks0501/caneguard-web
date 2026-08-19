import { createElement, type ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldValidationMapData } from "../../domain/fieldValidation.types";
import { ValidationMap } from "./ValidationMap";

type CapturedMapProps = {
  children?: ReactNode;
  onClick?: (event: never) => void;
  onError?: () => void;
  onLoad?: (event: never) => void;
};

const mapTestState = vi.hoisted(() => ({
  controls: {
    easeTo: vi.fn(),
    fitBounds: vi.fn(),
    getSource: vi.fn(),
  },
  latestProps: undefined as CapturedMapProps | undefined,
}));

vi.mock("../../config/env", () => ({
  env: { mapTilerKey: "test-map-key" },
}));

vi.mock("react-map-gl/maplibre", () => {
  const Boundary = (props: CapturedMapProps) => {
    mapTestState.latestProps = props;
    return createElement("div", { "data-testid": "map-boundary" }, props.children);
  };
  const Child = ({ children }: { children?: ReactNode }) => createElement("div", null, children);

  return {
    Layer: Child,
    Map: Boundary,
    NavigationControl: () => null,
    Popup: Child,
    Source: Child,
  };
});

function mapData(coordinates: Array<[number, number]>, totalCount = coordinates.length): FieldValidationMapData {
  return {
    type: "FeatureCollection",
    features: coordinates.map((point, index) => ({
      type: "Feature",
      id: `report-${index + 1}`,
      geometry: { type: "Point", coordinates: point },
      properties: {
        uuid: `report-${index + 1}`,
        referenceCode: `CG-2026-000${index + 1}`,
        barangay: "Mabini",
        province: "Batangas",
        municipality: "Nasugbu",
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
    })),
    metadata: {
      totalCount,
      locatedCount: coordinates.length,
      unlocatedCount: totalCount - coordinates.length,
    },
  };
}

function renderMap(data: FieldValidationMapData, frameKey = "all") {
  return render(
    <MemoryRouter>
      <ValidationMap data={data} frameKey={frameKey} />
    </MemoryRouter>,
  );
}

function loadMap() {
  act(() => {
    mapTestState.latestProps?.onLoad?.({ target: mapTestState.controls } as never);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mapTestState.latestProps = undefined;
});

describe("ValidationMap", () => {
  it("reports a provider error without removing the map boundary", () => {
    renderMap(mapData([[120.63, 14.07]]));

    act(() => {
      mapTestState.latestProps?.onError?.();
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Map provider is unavailable.");
    expect(screen.getByTestId("map-boundary")).toBeInTheDocument();
  });

  it("frames one located report at a useful local zoom", () => {
    renderMap(mapData([[120.63, 14.07]]));
    loadMap();

    expect(mapTestState.controls.easeTo).toHaveBeenCalledWith({
      center: [120.63, 14.07],
      zoom: 13,
    });
    expect(mapTestState.controls.fitBounds).not.toHaveBeenCalled();
  });

  it("fits multiple located reports with padding and a maximum zoom", () => {
    renderMap(mapData([[120.5, 14.0], [120.8, 14.2]]));
    loadMap();

    expect(mapTestState.controls.fitBounds).toHaveBeenCalledWith(
      [[120.5, 14.0], [120.8, 14.2]],
      { padding: 60, maxZoom: 14 },
    );
  });

  it("uses a Nasugbu view when there are no located reports", () => {
    renderMap(mapData([], 2));
    loadMap();

    expect(mapTestState.controls.easeTo).toHaveBeenCalledWith({
      center: [120.63, 14.07],
      zoom: 10,
    });
    expect(screen.getByText("No located reports to plot.")).toBeInTheDocument();
  });

  it("does not reframe background data refreshes but reframes a new filter context", () => {
    const firstData = mapData([[120.63, 14.07]]);
    const { rerender } = renderMap(firstData);
    loadMap();
    expect(mapTestState.controls.easeTo).toHaveBeenCalledTimes(1);

    rerender(
      <MemoryRouter>
        <ValidationMap data={mapData([[121.1, 14.4]])} frameKey="all" />
      </MemoryRouter>,
    );
    expect(mapTestState.controls.easeTo).toHaveBeenCalledTimes(1);

    rerender(
      <MemoryRouter>
        <ValidationMap data={mapData([[121.1, 14.4]])} frameKey="barangay:Mabini" />
      </MemoryRouter>,
    );
    expect(mapTestState.controls.easeTo).toHaveBeenCalledTimes(2);
  });

  it("opens the selected report popup and expands clusters", () => {
    const data = mapData([[120.63, 14.07]]);
    renderMap(data);
    loadMap();

    act(() => {
      mapTestState.latestProps?.onClick?.({
        features: [{ properties: { uuid: "report-1" } }],
        lngLat: { lng: 120.63, lat: 14.07 },
      } as never);
    });
    expect(screen.getByText("CG-2026-0001")).toBeInTheDocument();

    mapTestState.controls.getSource.mockReturnValue({
      getClusterExpansionZoom: (_id: number, callback: (error: Error | null, zoom?: number) => void) => {
        callback(null, 9);
      },
    });
    act(() => {
      mapTestState.latestProps?.onClick?.({
        features: [{ properties: { point_count: 2, cluster_id: 7 } }],
        target: mapTestState.controls,
        lngLat: { lng: 120.7, lat: 14.1 },
      } as never);
    });

    expect(mapTestState.controls.getSource).toHaveBeenCalledWith("validation-reports");
    expect(mapTestState.controls.easeTo).toHaveBeenLastCalledWith({
      center: { lng: 120.7, lat: 14.1 },
      zoom: 9,
    });
  });
});
