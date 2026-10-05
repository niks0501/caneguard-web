import { createElement, type ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldValidationMapData } from "../../domain/fieldValidation.types";
import { ValidationMap } from "./ValidationMap";

type CapturedMapProps = {
  children?: ReactNode;
  initialViewState?: { longitude: number; latitude: number; zoom: number };
  maxBounds?: [[number, number], [number, number]];
  onClick?: (event: never) => Promise<void>;
  onError?: () => void;
  onLoad?: (event: never) => void;
};

const mapTestState = vi.hoisted(() => ({
  controls: {
    easeTo: vi.fn(),
    fitBounds: vi.fn(),
    getSource: vi.fn(),
    getZoom: vi.fn(() => 8),
    project: vi.fn(() => ({ x: 100, y: 100 })),
    unproject: vi.fn(([x, y]: [number, number]) => ({ lng: x / 100, lat: y / 100 })),
  },
  latestProps: undefined as CapturedMapProps | undefined,
  sources: {} as Record<string, { clusterMaxZoom?: number; maxzoom?: number; data?: { features: unknown[] } }>,
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
    Source: (props: { id: string; children?: ReactNode; clusterMaxZoom?: number; maxzoom?: number; data?: { features: unknown[] } }) => {
      mapTestState.sources[props.id] = props;
      return createElement("div", null, props.children);
    },
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
        barangay: "Balaytigui",
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
      limit: 1000,
      returnedCount: coordinates.length,
      truncated: false,
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
  mapTestState.controls.getZoom.mockReturnValue(8);
});

describe("ValidationMap", () => {
  it("always clusters server locations and deterministically expands every report at the maximum zoom", async () => {
    const data = mapData([[120.63, 14.07], [120.6301, 14.07]]);
    for (const item of data.features) Object.assign(item.properties, {
      locationGroupKey: "server-group",
      locationGroupSize: 2,
      locationGroupCoordinates: [120.63, 14.07],
    });
    data.metadata.truncated = true;
    renderMap(data);
    loadMap();
    expect(mapTestState.sources["validation-reports"].clusterMaxZoom).toBe(22);
    expect(mapTestState.sources["validation-reports"].maxzoom).toBe(24);
    const plotted = mapTestState.sources["validation-reports"].data?.features as Array<{ geometry: { coordinates: number[] } }>;
    expect(plotted.map((item) => item.geometry.coordinates)).toEqual([[120.63, 14.07], [120.63, 14.07]]);
    mapTestState.controls.getZoom.mockReturnValue(22);
    mapTestState.controls.getSource.mockReturnValue({
      getClusterExpansionZoom: vi.fn().mockResolvedValue(23),
      getClusterLeaves: vi.fn().mockResolvedValue([...data.features].reverse().map((item) => ({ properties: { uuid: item.properties.uuid } }))),
    });
    const click = {
      features: [{ properties: { point_count: 2, cluster_id: 7 } }],
      target: mapTestState.controls,
      lngLat: { lng: 120.63, lat: 14.07 },
    };
    await act(async () => { await mapTestState.latestProps?.onClick?.(click as never); });
    expect(screen.getByText("2 reports at this location")).toBeInTheDocument();
    expect(screen.getByText("Within the returned map slice.")).toBeInTheDocument();
    for (let index = 1; index <= 2; index++) {
      expect(screen.getByRole("link", { name: `CG-2026-000${index}` })).toHaveAttribute("href", `/reports/report-${index}`);
    }
    const first = mapTestState.sources["validation-expanded"].data;
    await act(async () => { await mapTestState.latestProps?.onClick?.(click as never); });
    expect(mapTestState.sources["validation-expanded"].data).toEqual(first);
    expect(new Set((first?.features as Array<{ geometry: { coordinates: number[] } }>).map((item) => item.geometry.coordinates.join(","))).size).toBe(2);
  });

  it("opens every server group member from a point and clears inaccessible selection after refetch", async () => {
    const data = mapData([[120.63, 14.07], [120.6301, 14.07]]);
    data.features.forEach((item) => Object.assign(item.properties, { locationGroupKey: "server-key", locationGroupSize: 2 }));
    const { rerender } = renderMap(data);
    await act(async () => { await mapTestState.latestProps?.onClick?.({
      features: [{ properties: { uuid: "report-2" } }],
      lngLat: { lng: 120.63, lat: 14.07 },
    } as never); });
    expect(screen.getAllByRole("link")).toHaveLength(2);
    rerender(<MemoryRouter><ValidationMap data={mapData([])} /></MemoryRouter>);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

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

  it("fits worldwide located reports with padding and a maximum zoom", () => {
    renderMap(mapData([[120.7273218, 13.933159], [122.8, 10.5]]));
    loadMap();

    expect(mapTestState.controls.fitBounds).toHaveBeenCalledWith(
      [[120.7273218, 10.5], [122.8, 13.933159]],
      { padding: 60, maxZoom: 14 },
    );
  });

  it("starts wide and returns to a worldwide view when there are no located reports", () => {
    renderMap(mapData([], 2));
    expect(mapTestState.latestProps?.initialViewState).toEqual({
      longitude: 0,
      latitude: 20,
      zoom: 1,
    });
    expect(mapTestState.latestProps?.maxBounds).toBeUndefined();

    loadMap();

    expect(mapTestState.controls.easeTo).toHaveBeenCalledWith({
      center: [0, 20],
      zoom: 1,
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
        <ValidationMap data={mapData([[120.64, 14.11]])} frameKey="all" />
      </MemoryRouter>,
    );
    expect(mapTestState.controls.easeTo).toHaveBeenCalledTimes(1);

    rerender(
      <MemoryRouter>
        <ValidationMap data={mapData([[120.65, 14.12]])} frameKey="barangay:Balaytigui" />
      </MemoryRouter>,
    );
    expect(mapTestState.controls.easeTo).toHaveBeenCalledTimes(2);
  });

  it("opens the selected report popup and expands clusters", async () => {
    const data = mapData([[120.63, 14.07]]);
    renderMap(data);
    loadMap();

    act(() => {
      mapTestState.latestProps?.onClick?.({
        features: [{ properties: { uuid: "report-1" } }],
        lngLat: { lng: 120.63, lat: 14.07 },
      } as never);
    });
    expect(screen.getByRole("link", { name: "CG-2026-0001" })).toHaveAttribute("href", "/reports/report-1");

    mapTestState.controls.getSource.mockReturnValue({
      getClusterExpansionZoom: vi.fn().mockResolvedValue(9),
    });
    await act(async () => {
      await mapTestState.latestProps?.onClick?.({
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
