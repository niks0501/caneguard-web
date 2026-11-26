import { createElement, useEffect, useState, type ReactNode } from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldSurveyBoundariesData, FieldSurveyPolygon, FieldSurveyPosition } from "../../domain/fieldSurvey.types";
import { createReturnContext, readReturnContext } from "../navigation/mapNavigationContext";
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
      properties: { boundary_id: "123", status: "unlinked" },
    });
    // Flat solids by status: confirmed green, waiting gold, not on a case grey with a dashed outline.
    expect(mapTestState.layers["field-boundaries-fill"]).toMatchObject({
      type: "fill",
      paint: {
        "fill-color": ["match", ["get", "status"], "confirmed", "#2d6b40", "waiting", "#ae8a1b", "#4a5650"],
        "fill-opacity": 0.22,
      },
    });
    expect(mapTestState.layers["field-boundaries-outline"]).toMatchObject({
      type: "line",
      paint: { "line-color": ["match", ["get", "status"], "waiting", "#45370b", "#1e452a"], "line-width": 2 },
    });
    expect(mapTestState.layers["field-boundaries-outline-unlinked"]).toMatchObject({
      type: "line",
      paint: { "line-color": "#4a5650", "line-width": 2, "line-dasharray": [2, 2] },
    });
    expect(mapTestState.latestProps?.interactiveLayerIds).toEqual([
      "field-boundaries-fill",
      "field-boundaries-outline",
      "field-boundaries-outline-unlinked",
      "field-boundaries-damage-fill",
    ]);
  });

  it("marks each map confirmed, waiting or not on a case for the paint", () => {
    const data = boundaryData();
    data.features[0].properties.cases = [{ uuid: "case-1", referenceCode: "CG-1", link: "attached" }];
    const { rerender } = render(<BoundariesMap data={data} />);
    expect(mapTestState.sources["field-boundaries"].data?.features[0]).toMatchObject({ properties: { status: "waiting" } });

    data.features[0].properties.cases = [{ uuid: "case-1", referenceCode: "CG-1", link: "confirmed" }];
    rerender(<BoundariesMap data={{ ...data, features: [...data.features] }} />);
    expect(mapTestState.sources["field-boundaries"].data?.features[0]).toMatchObject({ properties: { status: "confirmed" } });
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

  it("labels each map with its case and size once the map is close enough", () => {
    const data = boundaryData();
    data.features[0].properties.cases = [
      { uuid: "case-1", referenceCode: "CG-1", link: "confirmed" },
      { uuid: "case-2", referenceCode: "CG-2", link: "attached" },
    ];
    const { container } = render(<MemoryRouter><BoundariesMap data={data} /></MemoryRouter>);

    expect(container.querySelector("[data-boundary-label]")).toBeNull();
    act(() => { mapTestState.latestProps?.onZoomEnd?.({ viewState: { zoom: 13 } } as never); });

    const label = container.querySelector("[data-boundary-label='123']");
    expect(label).toHaveTextContent("CG-1 · 0.61 ha");
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
    expect(screen.getByText("6.8%")).toBeInTheDocument();
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
    expect(screen.getByRole("dialog", { name: "Map 123" })).toHaveTextContent("device-reported");
    expect(screen.getByRole("dialog", { name: "Map 123" })).toHaveTextContent("Not on a case");
    expect(screen.getByRole("dialog", { name: "Map 123" })).toHaveTextContent("0.61 ha");
    expect(screen.getByRole("button", { name: "Close field map details" })).toBeInTheDocument();
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

    expect(screen.getByRole("region", { name: "Map of recorded field maps" })).toHaveTextContent("Map unavailable.");
    const legend = screen.getByRole("group", { name: "Field map legend" });
    for (const entry of ["Confirmed", "Waiting for office", "Not on a case", "Damage area", "Selected map"]) {
      expect(within(legend).getByText(entry)).toBeInTheDocument();
    }
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

  it("highlights companion case plots while keeping bold stroke on the selected plot", () => {
    const data = boundaryData();
    data.features.push({
      ...data.features[0],
      id: "124",
      properties: { ...data.features[0].properties, id: 124 },
    });

    render(<BoundariesMap data={data} selectedBoundaryId="123" highlightedBoundaryIds={["123", "124"]} />);

    expect(mapTestState.sources["field-boundaries-highlighted"].data?.features).toHaveLength(1);
    expect(mapTestState.sources["field-boundaries-highlighted"].data?.features[0]).toMatchObject({
      properties: { boundary_id: "124" },
    });
    expect(mapTestState.layers["field-boundaries-highlighted-line"]).toMatchObject({
      type: "line",
      paint: { "line-color": "#b8ad73", "line-width": 2, "line-dasharray": [3, 2] },
    });
    expect(mapTestState.sources["field-boundaries-selected"].data?.features).toHaveLength(1);
  });

  it("renders a pin for focusedCaseLocation and eases camera once when no plots are focused", () => {
    const empty: FieldSurveyBoundariesData = {
      type: "FeatureCollection",
      features: [],
      metadata: { totalCount: 0, returnedCount: 0, limit: 100, truncated: false, page: 1, pageCount: 1 },
    };
    const location = { longitude: 122.96, latitude: 10.71, referenceCode: "CG-2026-0101" };

    const { rerender } = render(<BoundariesMap data={empty} focusedCaseLocation={location} />);
    loadMap();

    expect(screen.getByLabelText("Case location CG-2026-0101")).toBeInTheDocument();
    expect(mapTestState.controls.easeTo).toHaveBeenCalledTimes(1);
    expect(mapTestState.controls.easeTo).toHaveBeenCalledWith({ center: [122.96, 10.71], zoom: 15 });

    // Refetches with the same focused location must not re-ease and fight user panning.
    rerender(<BoundariesMap data={{ ...empty }} focusedCaseLocation={{ ...location }} />);
    expect(mapTestState.controls.easeTo).toHaveBeenCalledTimes(1);
  });

  it("disambiguates overlapping polygons newest-first in the popup and keeps the switcher active when switching", async () => {
    const user = userEvent.setup();
    const data = boundaryData();
    data.features.push(
      {
        ...data.features[0],
        id: "124",
        properties: {
          ...data.features[0].properties,
          id: 124,
          label: "Newer Plot",
          capturedAt: "2026-10-06T03:00:00Z",
          cases: [{ uuid: "case-2", referenceCode: "CG-2", link: "attached" }],
        },
      },
      {
        ...data.features[0],
        id: "122",
        properties: {
          ...data.features[0].properties,
          id: 122,
          label: "Oldest Plot",
          capturedAt: "2026-09-20T01:00:00Z",
          cases: [{ uuid: "case-1", referenceCode: "CG-1", link: "confirmed" }],
        },
      },
    );

    const selections: Array<{ id: string; coords: FieldSurveyPosition }> = [];
    function Controlled() {
      const [selected, setSelected] = useState<string | null>(null);
      const [coords, setCoords] = useState<FieldSurveyPosition | null>(null);
      return (
        <MemoryRouter>
          <BoundariesMap
            data={data}
            selectedBoundaryId={selected}
            popupCoordinates={coords}
            onSelect={(id, c) => {
              selections.push({ id, coords: c });
              setSelected(id);
              setCoords(c);
            }}
          />
        </MemoryRouter>
      );
    }

    render(<Controlled />);

    act(() => {
      mapTestState.latestProps?.onClick?.({
        features: [
          { properties: { boundary_id: "122" } },
          { properties: { boundary_id: "124" } },
          { properties: { boundary_id: "124" } },
          { properties: { boundary_id: "123" } },
        ],
        lngLat: { lng: 122.9505, lat: 10.7005 },
      } as never);
    });

    // Selects newest first (124).
    expect(selections[0]).toEqual({ id: "124", coords: [122.9505, 10.7005] });
    const group = screen.getByRole("group", { name: "Overlapping plots at this spot" });
    expect(within(group).getByText("3 overlapping plots at this spot (newest first)")).toBeInTheDocument();
    const pills = within(group).getAllByRole("button");
    expect(pills).toHaveLength(3);
    expect(pills[0]).toHaveTextContent("Newer Plot");
    expect(pills[0]).toHaveTextContent("Latest");
    expect(pills[0]).toHaveTextContent("Oct 6, 2026, 11:00 AM");
    expect(pills[0]).toHaveTextContent("Waiting");
    expect(pills[1]).toHaveTextContent("Map 123");
    expect(pills[1]).toHaveTextContent("Not on a case");
    expect(pills[2]).toHaveTextContent("Oldest Plot");
    expect(pills[2]).toHaveTextContent("Confirmed");

    // Clicking another pill switches selectedBoundaryId without losing the overlap bar.
    await user.click(pills[2]);
    expect(selections[1]).toEqual({ id: "122", coords: [122.9505, 10.7005] });
    expect(screen.getByRole("dialog", { name: "Oldest Plot" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Overlapping plots at this spot" })).toBeInTheDocument();
  });

  it("shows re-measurement lineage cues when outlineFromSurveyId links plots", () => {
    const data = boundaryData();
    data.features.push({
      ...data.features[0],
      id: "124",
      properties: {
        ...data.features[0].properties,
        id: 124,
        capturedAt: "2026-10-05T02:30:00Z",
        outlineFromSurveyId: 123,
      },
    });

    const { rerender } = render(<MemoryRouter><BoundariesMap data={data} selectedBoundaryId="123" /></MemoryRouter>);
    expect(screen.getByText("Newer survey exists: Map 124")).toBeInTheDocument();

    rerender(<MemoryRouter><BoundariesMap data={data} selectedBoundaryId="124" /></MemoryRouter>);
    expect(screen.getByText("Reused plot outline from Map 123")).toBeInTheDocument();
  });

  it("attaches returnContext state to popup case links and offers Show on Monitoring Map", async () => {
    const user = userEvent.setup();
    const data = boundaryData();
    data.features[0].properties.cases = [{ uuid: "case-1", referenceCode: "CG-1", link: "confirmed" }];
    const returnContext = createReturnContext("/monitoring?view=boundaries&fm_status=confirmed", "Field maps");

    function Probe() {
      const location = useLocation();
      const ctx = readReturnContext(location.state);
      return <output data-testid="nav-probe">{location.pathname}{location.search}|{ctx ? `${ctx.label}:${ctx.to}` : "none"}</output>;
    }

    render(
      <MemoryRouter initialEntries={["/monitoring?view=boundaries"]}>
        <Routes>
          <Route path="/monitoring" element={<BoundariesMap data={data} selectedBoundaryId="123" returnContext={returnContext} />} />
          <Route path="/reports/:reportId" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Show on Monitoring Map" })).toHaveAttribute(
      "href",
      "/monitoring?view=map&report=case-1",
    );

    await user.click(screen.getByRole("link", { name: "CG-1" }));
    expect(screen.getByTestId("nav-probe")).toHaveTextContent(
      "/reports/case-1|Field maps:/monitoring?view=boundaries&fm_status=confirmed",
    );
  });
});
