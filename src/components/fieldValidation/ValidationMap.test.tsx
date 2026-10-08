import { createElement, useState, type ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldValidationMapData } from "../../domain/fieldValidation.types";
import { ValidationMap, type ValidationMapSelection } from "./ValidationMap";

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
        finalLatitude: point[1],
        finalLongitude: point[0],
      },
    })),
    metadata: {
      totalCount,
      locatedCount: coordinates.length,
      unlocatedCount: totalCount - coordinates.length,
      needVisitCount: coordinates.length,
      overdueCount: 0,
      limit: 1000,
      returnedCount: coordinates.length,
      truncated: false,
    },
  };
}

/** Holds selection state so onSelect effects (cluster highlight) are observable. */
function ControlledMap({ data, onSelection }: { data: FieldValidationMapData; onSelection?: (selection: ValidationMapSelection | null) => void }) {
  const [selection, setSelection] = useState<ValidationMapSelection | null>(null);
  return (
    <ValidationMap
      data={data}
      selection={selection}
      onSelect={(next) => { setSelection(next); onSelection?.(next); }}
      onClearSelection={() => { setSelection(null); onSelection?.(null); }}
    />
  );
}

function renderMap(data: FieldValidationMapData, frameKey = "all", onSelection?: (selection: ValidationMapSelection | null) => void) {
  return render(
    <MemoryRouter>
      <ControlledMap data={data} onSelection={onSelection} />
      <span data-hidden-frame={frameKey} />
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
  it("always clusters server locations and reports every represented member from a cluster click", async () => {
    const data = mapData([[120.63, 14.07], [120.6301, 14.07]]);
    for (const item of data.features) Object.assign(item.properties, {
      locationGroupKey: "server-group",
      locationGroupSize: 2,
      locationGroupCoordinates: [120.63, 14.07] as [number, number],
    });
    data.metadata.truncated = true;
    const selections: Array<ValidationMapSelection | null> = [];
    renderMap(data, "all", (selection) => selections.push(selection));
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

    expect(selections.at(-1)).toEqual({
      kind: "cluster",
      clusterKeys: ["server-group"],
      coordinates: [120.63, 14.07],
    });
    // Both same-coordinate members stay individually reachable.
    const expanded = mapTestState.sources["validation-expanded"].data;
    expect(new Set((expanded?.features as Array<{ geometry: { coordinates: number[] } }>).map((item) => item.geometry.coordinates.join(","))).size).toBe(2);
  });

  it("opens a single case from an isolated marker click with its identity and coordinates", async () => {
    const data = mapData([[120.63, 14.07], [120.7301, 14.11]]);
    const selections: Array<ValidationMapSelection | null> = [];
    renderMap(data, "all", (selection) => selections.push(selection));
    loadMap();

    await act(async () => {
      await mapTestState.latestProps?.onClick?.({
        features: [{ properties: { uuid: "report-2" } }],
        lngLat: { lng: 120.7301, lat: 14.11 },
      } as never);
    });

    expect(selections.at(-1)).toEqual({
      kind: "case",
      caseUuid: "report-2",
      coordinates: [120.7301, 14.11],
    });
  });

  it("reports a provider error without removing the map boundary", () => {
    renderMap(mapData([[120.63, 14.07]]));

    act(() => {
      mapTestState.latestProps?.onError?.();
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Map unavailable.");
    expect(screen.getByRole("alert")).toHaveTextContent("Reports Without Location");
    expect(screen.getByTestId("map-boundary")).toBeInTheDocument();
  });

  it("gives every operational case status a distinguishable marker, not colour alone", () => {
    renderMap(mapData([[120.63, 14.07]]));
    const markers = ["○", "!", "✓", "?", "•"].map((marker) => screen.getByText(marker));
    expect(new Set(markers.map((marker) => marker.textContent)).size).toBe(5);
  });

  it("frames one located report at a useful local zoom", () => {
    renderMap(mapData([[120.63, 14.07]]));
    loadMap();

    expect(mapTestState.controls.easeTo.mock.calls.at(-1)?.[0]).toMatchObject({
      center: [120.63, 14.07],
      zoom: 13,
    });
  });

  it("fits local located reports with padding and a maximum zoom", () => {
    renderMap(mapData([[120.7273218, 13.933159], [120.8, 14.01]]));
    loadMap();

    const fitBoundsCall = mapTestState.controls.fitBounds.mock.calls.at(-1);
    expect(fitBoundsCall?.[0]).toEqual([[120.7273218, 13.933159], [120.8, 14.01]]);
    expect(fitBoundsCall?.[1]).toMatchObject({ padding: 60, maxZoom: 14 });
  });

  it("falls back to the CaneGuard operating area instead of a world view when there are no located reports", () => {
    renderMap(mapData([], 2));
    expect(mapTestState.latestProps?.initialViewState).toMatchObject({
      longitude: 120.65,
      latitude: 14.09,
      zoom: 9,
    });

    loadMap();

    expect(mapTestState.controls.easeTo.mock.calls.at(-1)?.[0]).toMatchObject({
      center: [120.65, 14.09],
      zoom: 9,
    });
    expect(screen.getByText("No located cases")).toBeInTheDocument();
    expect(screen.getByText(/none has a usable coordinate pair/i)).toBeInTheDocument();
  });

  it("does not present a basemap failure as an empty case result", () => {
    renderMap(mapData([], 0));
    loadMap();
    act(() => {
      mapTestState.latestProps?.onError?.();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Map unavailable.");
    expect(screen.queryByText("No matching cases")).not.toBeInTheDocument();
  });

  it("does not reframe background data refreshes but reframes a new filter context", () => {
    const firstData = mapData([[120.63, 14.07]]);
    const { rerender } = render(
      <MemoryRouter>
        <ValidationMap data={firstData} frameKey="all" />
      </MemoryRouter>,
    );
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

  it("zooms into a cluster that has not reached the maximum zoom instead of expanding it", async () => {
    const data = mapData([[120.63, 14.07], [120.6301, 14.07]]);
    renderMap(data);
    loadMap();

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

    expect(mapTestState.controls.easeTo.mock.calls.at(-1)?.[0]).toMatchObject({
      center: { lng: 120.7, lat: 14.1 },
      zoom: 9,
    });
  });
});
