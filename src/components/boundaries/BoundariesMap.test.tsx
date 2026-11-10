import { createElement, useEffect, type ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldSurveyBoundariesData, FieldSurveyPolygon, FieldSurveyPosition } from "../../domain/fieldSurvey.types";
import { BoundariesMap } from "./BoundariesMap";

type CapturedMapProps = {
  children?: ReactNode;
  initialViewState?: { longitude: number; latitude: number; zoom: number };
  mapStyle?: string | { version: number };
  interactiveLayerIds?: string[];
  onClick?: (event: never) => void;
  onError?: () => void;
  onLoad?: (event: never) => void;
  onSourceData?: (event: { sourceId?: string; tile?: unknown }) => void;
  onZoomEnd?: (event: { viewState: { zoom: number } }) => void;
};

const envState = vi.hoisted(() => ({ mapTilerKey: "test-map-key" }));
const styleState = vi.hoisted(() => ({ value: "test-style" as string | undefined }));
const mapTestState = vi.hoisted(() => ({
  mountCount: 0,
  controls: {
    easeTo: vi.fn(),
    fitBounds: vi.fn(),
  },
  latestProps: undefined as CapturedMapProps | undefined,
  sources: {} as Record<string, { data?: { features: unknown[] } }>,
  layers: {} as Record<string, { type?: string; paint?: Record<string, unknown> }>,
}));

vi.mock("../../config/env", () => ({ env: envState }));
vi.mock("../fieldValidation/localBasemap", () => ({ resolveBasemapStyle: () => styleState.value }));
vi.mock("react-map-gl/maplibre", () => {
  const Boundary = (props: CapturedMapProps) => {
    mapTestState.latestProps = props;
    useEffect(() => {
      mapTestState.mountCount += 1;
    }, []);
    return createElement("div", { "data-testid": "map-boundary" }, props.children);
  };
  const Child = ({ children }: { children?: ReactNode }) => createElement("div", null, children);

  return {
    Layer: (props: { id: string; type?: string; paint?: Record<string, unknown> }) => {
      mapTestState.layers[props.id] = props;
      return null;
    },
    Map: Boundary,
    Marker: Child,
    NavigationControl: () => null,
    Popup: Child,
    Source: (props: { id: string; children?: ReactNode; data?: { features: unknown[] } }) => {
      mapTestState.sources[props.id] = props;
      return createElement("div", null, props.children);
    },
  };
});

function boundaryData(): FieldSurveyBoundariesData {
  return {
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
        affectedAreas: [],
        affectedAreaSqm: null,
        cases: [],
        inspector: { uuid: "inspector-1", name: "Maria Santos" },
      },
    }],
    metadata: { totalCount: 1, returnedCount: 1, limit: 100, truncated: false, page: 1, pageCount: 1 },
  };
}

function loadMap() {
  act(() => {
    mapTestState.latestProps?.onLoad?.({ target: mapTestState.controls } as never);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  envState.mapTilerKey = "test-map-key";
  styleState.value = "test-style";
  mapTestState.latestProps = undefined;
  mapTestState.mountCount = 0;
  mapTestState.sources = {};
  mapTestState.layers = {};
});

describe("BoundariesMap", () => {
  it("counts the boundaries it draws, including one opened outside the newest page", () => {
    const data = boundaryData();
    data.features.push({
      ...data.features[0],
      id: "7",
      properties: { ...data.features[0].properties, id: 7 },
    });
    data.metadata = { ...data.metadata, returnedCount: 1 };
    render(<BoundariesMap data={data} />);

    expect(screen.getByText("2 shown")).toBeInTheDocument();
  });

  it("draws stored polygon geometry with the specified fill and outline layers", () => {
    const data = boundaryData();
    render(<BoundariesMap data={data} />);

    expect(mapTestState.sources["field-boundaries"].data?.features[0]).toMatchObject({
      geometry: data.features[0].geometry,
      properties: { boundary_id: "123" },
    });
    expect(mapTestState.layers["field-boundaries-fill"]).toMatchObject({
      type: "fill",
      paint: { "fill-color": "#2d6b40", "fill-opacity": 0.18 },
    });
    expect(mapTestState.layers["field-boundaries-outline"]).toMatchObject({
      type: "line",
      paint: { "line-color": "#1e452a", "line-width": 2 },
    });
    expect(mapTestState.latestProps?.interactiveLayerIds).toEqual([
      "field-boundaries-fill",
      "field-boundaries-outline",
      "field-boundaries-damage-fill",
    ]);
  });

  it("draws the damage areas inside a boundary as their own layer that selects the boundary", () => {
    const data = boundaryData();
    const damage: FieldSurveyPolygon = {
      type: "Polygon",
      coordinates: [[[122.9502, 10.7002], [122.9504, 10.7002], [122.9504, 10.7004], [122.9502, 10.7002]]],
    };
    data.features[0].properties.affectedAreas = [damage];
    render(<BoundariesMap data={data} />);

    expect(mapTestState.sources["field-boundaries-damage"].data?.features).toEqual([
      { type: "Feature", geometry: damage, properties: { boundary_id: "123" } },
    ]);
    expect(mapTestState.layers["field-boundaries-damage-fill"]).toMatchObject({
      type: "fill",
      paint: { "fill-color": "#8a4a06" },
    });
    expect(mapTestState.layers["field-boundaries-damage-line"]).toMatchObject({ type: "line" });
  });

  it("labels each boundary with its size and case once the map is close enough", () => {
    const data = boundaryData();
    data.features[0].properties.cases = [
      { uuid: "case-1", referenceCode: "CG-1", link: "confirmed" },
      { uuid: "case-2", referenceCode: "CG-2", link: "attached" },
    ];
    const { container } = render(<MemoryRouter><BoundariesMap data={data} /></MemoryRouter>);

    expect(container.querySelector("[data-boundary-label]")).toBeNull();
    act(() => { mapTestState.latestProps?.onZoomEnd?.({ viewState: { zoom: 13 } } as never); });

    const label = container.querySelector("[data-boundary-label='123']");
    expect(label).toHaveTextContent("0.61 ha · 2 cases");
    expect(label).toHaveClass("boundaries-map__label--case");
  });

  it("shows the damage size and the cases that use the selected boundary", () => {
    const data = boundaryData();
    data.features[0].properties.affectedAreas = [{
      type: "Polygon",
      coordinates: [[[122.9502, 10.7002], [122.9504, 10.7002], [122.9504, 10.7004], [122.9502, 10.7002]]],
    }];
    data.features[0].properties.affectedAreaSqm = 412.5;
    data.features[0].properties.cases = [{ uuid: "case-1", referenceCode: "CG-1", link: "attached" }];
    render(<MemoryRouter><BoundariesMap data={data} selectedBoundaryId="123" /></MemoryRouter>);

    expect(screen.getByText("Damage · device-reported")).toBeInTheDocument();
    expect(screen.getByText("0.04 ha")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CG-1" })).toHaveAttribute("href", "/reports/case-1");
  });

  it("adds the selected boundary outline and a labelled detail popup", () => {
    render(<BoundariesMap data={boundaryData()} selectedBoundaryId="123" />);

    expect(mapTestState.sources["field-boundaries-selected"].data?.features).toHaveLength(1);
    expect(mapTestState.layers["field-boundaries-selected-line"]).toMatchObject({
      type: "line",
      paint: { "line-color": "#b8ad73", "line-width": 3 },
    });
    expect(screen.getByRole("dialog", { name: "Field boundary" })).toHaveTextContent("device-reported");
    expect(screen.getByRole("dialog", { name: "Field boundary" })).toHaveTextContent("0.61 ha");
    expect(screen.getByRole("button", { name: "Close boundary details" })).toBeInTheDocument();
  });

  it("selects a clicked polygon at the click coordinate", () => {
    const onSelect = vi.fn<(id: string, coordinates: FieldSurveyPosition) => void>();
    render(<BoundariesMap data={boundaryData()} onSelect={onSelect} />);

    act(() => {
      mapTestState.latestProps?.onClick?.({
        features: [{ properties: { boundary_id: "123" } }],
        lngLat: { lng: 122.9505, lat: 10.7005 },
      } as never);
    });

    expect(onSelect).toHaveBeenCalledWith("123", [122.9505, 10.7005]);
  });

  it("fits all boundaries on first load", () => {
    render(<BoundariesMap data={boundaryData()} />);
    loadMap();
    expect(mapTestState.controls.fitBounds).toHaveBeenCalledWith(
      [[122.95, 10.7], [122.951, 10.701]],
      { padding: 60, maxZoom: 14 },
    );
  });

  it("fits the selected boundary after the initial all-boundary frame", () => {
    render(<BoundariesMap data={boundaryData()} selectedBoundaryId="123" />);
    loadMap();
    expect(mapTestState.controls.fitBounds.mock.calls.at(-1)?.[1]).toEqual({ padding: 80, maxZoom: 15 });
  });

  it("uses the operating area when there are no boundaries", () => {
    const empty: FieldSurveyBoundariesData = {
      type: "FeatureCollection",
      features: [],
      metadata: { totalCount: 0, returnedCount: 0, limit: 100, truncated: false, page: 1, pageCount: 1 },
    };
    render(<BoundariesMap data={empty} />);
    loadMap();
    expect(mapTestState.controls.easeTo).toHaveBeenCalledWith({ center: [120.65, 14.09], zoom: 9 });
    expect(mapTestState.controls.fitBounds).not.toHaveBeenCalled();
  });

  it("keeps the map region and boundary legend when the basemap is unavailable", () => {
    styleState.value = undefined;
    render(<BoundariesMap data={boundaryData()} />);

    expect(screen.getByRole("region", { name: "Map of recorded field boundaries" })).toHaveTextContent("Map unavailable.");
    expect(screen.getByText("Recorded field boundary")).toBeInTheDocument();
    expect(screen.getByText("Selected boundary")).toBeInTheDocument();
  });

  it("keeps a loaded map interactive until a successful basemap tile arrives", () => {
    const data = boundaryData();
    const onSelect = vi.fn();
    const { rerender } = render(<BoundariesMap data={data} onSelect={onSelect} />);
    loadMap();

    act(() => {
      mapTestState.latestProps?.onError?.();
    });

    expect(screen.getByRole("status")).toHaveTextContent("Map tiles are temporarily unavailable.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry map" })).toBeInTheDocument();

    rerender(<BoundariesMap data={data} selectedBoundaryId="123" onSelect={onSelect} />);
    expect(mapTestState.controls.fitBounds).toHaveBeenLastCalledWith(
      [[122.95, 10.7], [122.951, 10.701]],
      { padding: 80, maxZoom: 15 },
    );

    act(() => {
      mapTestState.latestProps?.onClick?.({
        features: [{ properties: { boundary_id: "123" } }],
        lngLat: { lng: 122.9505, lat: 10.7005 },
      } as never);
    });
    expect(onSelect).toHaveBeenCalledWith("123", [122.9505, 10.7005]);

    act(() => {
      mapTestState.latestProps?.onSourceData?.({ sourceId: "basemap", tile: undefined });
      mapTestState.latestProps?.onSourceData?.({ sourceId: "field-boundaries", tile: {} });
      mapTestState.latestProps?.onSourceData?.({ sourceId: "field-boundaries-selected", tile: {} });
    });
    expect(screen.getByRole("status")).toHaveTextContent("Map tiles are temporarily unavailable.");

    act(() => {
      mapTestState.latestProps?.onSourceData?.({ sourceId: "basemap", tile: {} });
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("retries the map by loading a fresh instance", () => {
    render(<BoundariesMap data={boundaryData()} />);
    loadMap();
    const mountCount = mapTestState.mountCount;

    act(() => {
      mapTestState.latestProps?.onError?.();
    });
    act(() => {
      screen.getByRole("button", { name: "Retry map" }).click();
    });

    expect(mapTestState.mountCount).toBe(mountCount + 1);
    expect(screen.getByRole("status")).toHaveTextContent("Loading map...");
    loadMap();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(mapTestState.controls.fitBounds).toHaveBeenCalledTimes(2);
  });

  it("shows a pre-load map failure until the style successfully loads", () => {
    render(<BoundariesMap data={boundaryData()} />);

    act(() => {
      mapTestState.latestProps?.onError?.();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Map unavailable.");

    loadMap();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
