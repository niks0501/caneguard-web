import { createElement, type ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldSurveyBoundariesData, FieldSurveyPosition } from "../../domain/fieldSurvey.types";
import { BoundariesMap } from "./BoundariesMap";

type CapturedMapProps = {
  children?: ReactNode;
  initialViewState?: { longitude: number; latitude: number; zoom: number };
  mapStyle?: string | { version: number };
  interactiveLayerIds?: string[];
  onClick?: (event: never) => void;
  onError?: () => void;
  onLoad?: (event: never) => void;
  onSourceData?: (event: { sourceId?: string; sourceDataType?: string }) => void;
};

const envState = vi.hoisted(() => ({ mapTilerKey: "test-map-key" }));
const styleState = vi.hoisted(() => ({ value: "test-style" as string | undefined }));
const mapTestState = vi.hoisted(() => ({
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
    return createElement("div", { "data-testid": "map-boundary" }, props.children);
  };
  const Child = ({ children }: { children?: ReactNode }) => createElement("div", null, children);

  return {
    Layer: (props: { id: string; type?: string; paint?: Record<string, unknown> }) => {
      mapTestState.layers[props.id] = props;
      return null;
    },
    Map: Boundary,
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
        inspector: { uuid: "inspector-1", name: "Maria Santos" },
      },
    }],
    metadata: { totalCount: 1, returnedCount: 1, limit: 100, truncated: false },
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
  mapTestState.sources = {};
  mapTestState.layers = {};
});

describe("BoundariesMap", () => {
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
    ]);
  });

  it("adds the selected boundary outline and a labelled detail popup", () => {
    render(<BoundariesMap data={boundaryData()} selectedBoundaryId="123" />);

    expect(mapTestState.sources["field-boundaries-selected"].data?.features).toHaveLength(1);
    expect(mapTestState.layers["field-boundaries-selected-line"]).toMatchObject({
      type: "line",
      paint: { "line-color": "#b8ad73", "line-width": 3 },
    });
    expect(screen.getByRole("dialog", { name: "Field boundary" })).toHaveTextContent("device-reported");
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
      metadata: { totalCount: 0, returnedCount: 0, limit: 100, truncated: false },
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

  it("keeps a loaded map interactive until successful basemap content arrives", () => {
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
      mapTestState.latestProps?.onSourceData?.({ sourceId: "field-boundaries", sourceDataType: "content" });
      mapTestState.latestProps?.onSourceData?.({ sourceId: "field-boundaries-selected", sourceDataType: "content" });
      mapTestState.latestProps?.onSourceData?.({ sourceId: "basemap", sourceDataType: "metadata" });
    });
    expect(screen.getByRole("status")).toHaveTextContent("Map tiles are temporarily unavailable.");

    act(() => {
      mapTestState.latestProps?.onSourceData?.({ sourceId: "basemap", sourceDataType: "content" });
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("retries the map by loading a fresh instance", () => {
    render(<BoundariesMap data={boundaryData()} />);
    loadMap();

    act(() => {
      mapTestState.latestProps?.onError?.();
    });
    act(() => {
      screen.getByRole("button", { name: "Retry map" }).click();
    });

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
