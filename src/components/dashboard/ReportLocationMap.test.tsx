import { createElement, useEffect, useMemo, useRef, type ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportLocationMap } from "./ReportLocationMap";
import {
  DASHBOARD_PREFERENCES_STORAGE_KEY,
  DASHBOARD_PREFERENCES_VERSION,
} from "./dashboardPreferences";
import { useFieldValidationMap } from "../../hooks/useFieldValidation";
import type { FieldValidationMapData } from "../../domain/fieldValidation.types";

vi.mock("../../hooks/useFieldValidation", () => ({
  useFieldValidationMap: vi.fn(),
}));

// The real map only mounts when a MapTiler key is configured.
vi.mock("../../config/env", () => ({
  env: { mapTilerKey: "test-map-key" },
}));

const mapState = vi.hoisted(() => ({
  sources: [] as Array<{ id: string; features: number }>,
  layers: [] as Array<{ id: string; paint?: Record<string, unknown> }>,
  /** Recorded MapLibre map click event replayed by the canvas stand-in. */
  mapClickEvent: undefined as unknown,
  missingImageListener: undefined as ((event: { id: string }) => void) | undefined,
  addImage: vi.fn(),
}));

/**
 * Stand-in for `@vis.gl/react-maplibre`'s <Source> and <Layer> that keeps the
 * two behaviours the dashboard map depends on:
 *
 * 1. <Source> pins its id at mount (`useMemo(..., [])`) and asserts the prop
 *    never changes, throwing "source id changed" — a conditional <Source>
 *    swap without a `key` therefore crashes the real map into a blank canvas.
 * 2. <Layer> mounts once per id.
 */
vi.mock("react-map-gl/maplibre", () => {
  const Boundary = ({
    children,
    onClick,
    onLoad,
  }: {
    children?: ReactNode;
    onClick?: (event: unknown) => void;
    onLoad?: (event: {
      target: {
        on: (name: string, callback: (event: { id: string }) => void) => void;
        hasImage: (id: string) => boolean;
        addImage: (id: string, image: { width: number; height: number; data: Uint8Array }) => void;
      };
    }) => void;
  }) => {
    useEffect(() => {
      onLoad?.({
        target: {
          on: (_name: string, callback: (event: { id: string }) => void) => {
            mapState.missingImageListener = callback;
          },
          hasImage: () => false,
          addImage: mapState.addImage,
        },
      });
    }, [onLoad]);
    return createElement(
      "div",
      { "data-testid": "map-canvas" },
      children,
      // MapLibre clicks land on the canvas, not on a DOM node per dot, so the
      // stand-in exposes a trigger that replays a recorded map click event.
      onClick
        ? createElement("button", {
            type: "button",
            "data-testid": "map-click",
            "aria-label": "Simulate a click on the map canvas",
            onClick: () => onClick(mapState.mapClickEvent),
          })
        : null,
    );
  };

  const Source = ({ id, data, children }: {
    id?: string;
    data?: { features?: unknown[] };
    children?: ReactNode;
  }) => {
    // Mirrors the library exactly: the id is pinned at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const mountedId = useMemo(() => id, []);
    // One record per mount, with the data present at that moment.
    const dataRef = useRef(data);
    dataRef.current = data;
    useEffect(() => {
      if (mountedId) {
        mapState.sources.push({
          id: mountedId,
          features: dataRef.current?.features?.length ?? 0,
        });
      }
    }, [mountedId]);
    if (mountedId !== id) throw new Error("source id changed");
    return createElement("div", { "data-source": id }, children);
  };

  const Layer = ({ id, paint }: { id?: string; paint?: Record<string, unknown> }) => {
    const paintRef = useRef(paint);
    paintRef.current = paint;
    useEffect(() => {
      if (id) mapState.layers.push({ id, paint: paintRef.current });
    }, [id]);
    return null;
  };

  const Popup = ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-testid": "map-popup" }, children);

  return {
    Layer,
    Map: Boundary,
    NavigationControl: () => null,
    Popup,
    Source,
  };
});

const rows = [
  {
    barangay: "Balaytigui",
    submitted: 8,
    open: 5,
    pastTargetDate: 2,
    scheduled: 2,
    unscheduled: 1,
  },
  {
    barangay: "Bucana",
    submitted: 4,
    open: 2,
    pastTargetDate: 0,
    scheduled: 1,
    unscheduled: 1,
  },
];

function gpsData(): FieldValidationMapData {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "report-1",
        geometry: { type: "Point", coordinates: [120.6, 14.07] },
        properties: {
          uuid: "00000000-0000-4000-8000-000000000001",
          referenceCode: "CG-2026-0718",
          barangay: "Balaytigui",
          province: "Batangas",
          municipality: "Nasugbu",
          observedAt: "2026-09-01T02:00:00.000Z",
          submittedAt: "2026-09-01T03:00:00.000Z",
          predictedDisease: "rust",
          confidence: 0.8,
          reviewStatus: "submitted_unverified",
          locationSource: "gps",
          gpsAccuracy: 6,
          affectedAreaHectares: 1.5,
          affectedPortionPercent: 20,
        },
      },
      {
        type: "Feature",
        id: "report-2",
        geometry: { type: "Point", coordinates: [120.61, 14.08] },
        properties: {
          uuid: "00000000-0000-4000-8000-000000000002",
          referenceCode: "CG-2026-0719",
          barangay: "Bucana",
          province: "Batangas",
          municipality: "Nasugbu",
          observedAt: "2026-09-02T02:00:00.000Z",
          submittedAt: "2026-09-02T03:00:00.000Z",
          predictedDisease: "mosaic",
          confidence: 0.7,
          reviewStatus: "for_field_validation",
          locationSource: "gps",
          gpsAccuracy: 8,
          affectedAreaHectares: 2,
          affectedPortionPercent: 30,
        },
      },
    ],
    metadata: {
      totalCount: 2,
      locatedCount: 2,
      unlocatedCount: 0,
      limit: 100,
      returnedCount: 2,
      truncated: false,
    },
  };
}

function renderMap() {
  return render(
    <MemoryRouter>
      <ReportLocationMap
        rows={rows}
        scopeLabel="1–24 Sep 2026"
        from="2026-09-01"
        to="2026-09-24"
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mapState.sources.length = 0;
  mapState.layers.length = 0;
  mapState.mapClickEvent = undefined;
  mapState.missingImageListener = undefined;
  mapState.addImage.mockClear();
  vi.mocked(useFieldValidationMap).mockReturnValue({
    data: gpsData(),
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useFieldValidationMap>);
});

describe("ReportLocationMap layer toggle", () => {
  it("registers an image fallback when the map style requests an absent sprite", async () => {
    renderMap();

    await vi.waitFor(() => expect(mapState.missingImageListener).toBeDefined());
    mapState.missingImageListener?.({ id: "missing-marker" });

    expect(mapState.addImage).toHaveBeenCalledWith("missing-marker", {
      width: 1,
      height: 1,
      data: new Uint8Array([45, 107, 64, 255]),
    });
  });

  it("remounts the map source per layer so the GPS toggle plots real points", async () => {
    const user = userEvent.setup();
    renderMap();

    expect(mapState.sources).toEqual([
      { id: "dashboard-barangay-circles", features: 2 },
    ]);

    await user.click(screen.getByRole("button", { name: "GPS points" }));

    // A mounted <Source> may never change its id: the swap has to be a
    // remount, otherwise react-map-gl throws and the canvas goes blank.
    expect(screen.getByRole("button", { name: "GPS points" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(mapState.sources).toEqual([
      { id: "dashboard-barangay-circles", features: 2 },
      { id: "dashboard-gps-points", features: 2 },
    ]);
    expect(screen.getByText("2 GPS points shown (limit 100).")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Barangay circles" }));

    expect(mapState.sources).toEqual([
      { id: "dashboard-barangay-circles", features: 2 },
      { id: "dashboard-gps-points", features: 2 },
      { id: "dashboard-barangay-circles", features: 2 },
    ]);
    expect(
      screen.getByRole("button", { name: "Barangay circles" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("names the active layer on the map frame and keeps the barangay links", async () => {
    const user = userEvent.setup();
    renderMap();

    expect(screen.getByLabelText("Map of field-report locations: Barangay circles")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Balaytigui 8 submitted/ }),
    ).toHaveAttribute("href", "/reports?barangay=Balaytigui");

    await user.click(screen.getByRole("button", { name: "GPS points" }));

    expect(screen.getByLabelText("Map of field-report locations: GPS points")).toBeInTheDocument();
  });

  it("announces a failed GPS load instead of leaving the canvas silently blank", async () => {
    vi.mocked(useFieldValidationMap).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as unknown as ReturnType<typeof useFieldValidationMap>);
    const user = userEvent.setup();
    renderMap();

    await user.click(screen.getByRole("button", { name: "GPS points" }));

    expect(screen.getByText(/GPS points could not be loaded/)).toBeInTheDocument();
  });

  it("keeps the circle-radius interpolate stops strictly ascending", () => {
    // A period where every barangay holds one report used to produce stops
    // [1, 10, 1, 30]. MapLibre rejects that expression, so the whole circle
    // layer disappeared and the canvas looked blank.
    render(
      <MemoryRouter>
        <ReportLocationMap
          rows={[
            {
              barangay: "Balaytigui",
              submitted: 1,
              open: 1,
              pastTargetDate: 1,
              scheduled: 0,
              unscheduled: 0,
            },
          ]}
          scopeLabel="1–24 Sep 2026"
          from="2026-09-01"
          to="2026-09-24"
        />
      </MemoryRouter>,
    );

    const circle = mapState.layers.find(
      (entry) => entry.id === "dashboard-barangay-circle",
    );
    expect(circle).toBeDefined();
    const radius = circle?.paint?.["circle-radius"] as unknown[];
    expect(radius.slice(0, 3)).toEqual([
      "interpolate",
      ["linear"],
      ["sqrt", ["get", "submitted"]],
    ]);
    const stops = radius.slice(3) as number[];
    for (let index = 0; index < stops.length; index += 2) {
      if (index > 0) expect(stops[index]).toBeGreaterThan(stops[index - 2]);
    }
    expect(stops).toEqual([1, 10, 2, 30]);
  });

  it("opens a dot summary popup with the counts and a link through", async () => {
    const user = userEvent.setup();
    renderMap();

    mapState.mapClickEvent = {
      features: [
        {
          layer: { id: "dashboard-barangay-circle" },
          properties: { barangay: "Balaytigui", submitted: 8, open: 5 },
        },
      ],
      lngLat: { lng: 120.6, lat: 14.07 },
    };
    await user.click(screen.getByTestId("map-click"));
    const barangayPopup = screen.getByRole("group", {
      name: "Balaytigui report summary",
    });
    expect(barangayPopup).toHaveTextContent("Balaytigui");
    expect(barangayPopup).toHaveTextContent("8 submitted · 5 open validation");
    expect(
      within(barangayPopup).getByRole("link", {
        name: "Open Balaytigui reports register",
      }),
    ).toHaveAttribute("href", "/reports?barangay=Balaytigui");

    // The GPS dot reaches the single report instead, and switching layers
    // clears the previous popup.
    await user.click(screen.getByRole("button", { name: "GPS points" }));
    expect(barangayPopup).not.toBeInTheDocument();
    mapState.mapClickEvent = {
      features: [
        {
          layer: { id: "dashboard-gps-point" },
          properties: {
            uuid: "00000000-0000-4000-8000-000000000001",
            referenceCode: "CG-2026-0718",
            barangay: "Balaytigui",
          },
        },
      ],
      lngLat: { lng: 120.6, lat: 14.07 },
    };
    await user.click(screen.getByTestId("map-click"));
    const gpsPopup = screen.getByRole("group", {
      name: "Report CG-2026-0718 summary",
    });
    expect(gpsPopup).toHaveTextContent("CG-2026-0718");
    expect(
      within(gpsPopup).getByRole("link", { name: "Open CG-2026-0718" }),
    ).toHaveAttribute(
      "href",
      "/reports/00000000-0000-4000-8000-000000000001",
    );
  });

  it("keeps the barangay list as the keyboard route to the same destinations", () => {
    renderMap();

    // The list links stay focusable and unchanged while the map dots now open
    // their own popups, so a keyboard user keeps every destination the dots
    // offer (the register for a barangay, the report for a GPS point).
    const listLink = screen.getByRole("link", {
      name: /Balaytigui 8 submitted/,
    });
    expect(listLink).toHaveAttribute("href", "/reports?barangay=Balaytigui");
    listLink.focus();
    expect(listLink).toHaveFocus();
  });
});

describe("ReportLocationMap layer memory", () => {
  function stored(): Record<string, unknown> {
    return JSON.parse(
      window.localStorage.getItem(DASHBOARD_PREFERENCES_STORAGE_KEY) ?? "null",
    ) as Record<string, unknown>;
  }

  it("brings back the chosen layer after the page is left and reopened", async () => {
    const user = userEvent.setup();
    const { unmount } = renderMap();
    expect(
      screen.getByRole("button", { name: "Barangay circles" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "GPS points" }));
    unmount();

    // A later visit starts from the stored layer instead of the default.
    mapState.sources.length = 0;
    renderMap();

    expect(screen.getByRole("button", { name: "GPS points" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("Map of field-report locations: GPS points")).toBeInTheDocument();
    expect(mapState.sources).toEqual([
      { id: "dashboard-gps-points", features: 2 },
    ]);
    // The restored layer still drives the GPS query for the current scope.
    expect(useFieldValidationMap).toHaveBeenLastCalledWith(
      { dateFrom: "2026-09-01", dateTo: "2026-09-24", limit: 100 },
      { enabled: true },
    );
  });

  it("brings back barangay circles after that layer is chosen again", async () => {
    const user = userEvent.setup();
    const first = renderMap();
    await user.click(screen.getByRole("button", { name: "GPS points" }));
    await user.click(screen.getByRole("button", { name: "Barangay circles" }));
    first.unmount();

    mapState.sources.length = 0;
    renderMap();

    expect(
      screen.getByRole("button", { name: "Barangay circles" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(mapState.sources).toEqual([
      { id: "dashboard-barangay-circles", features: 2 },
    ]);
  });

  it("writes the chosen layer into the versioned store", async () => {
    const user = userEvent.setup();
    renderMap();
    await user.click(screen.getByRole("button", { name: "GPS points" }));

    expect(stored().version).toBe(DASHBOARD_PREFERENCES_VERSION);
    expect(stored().mapLayer).toBe("gps");
  });

  it("falls back to barangay circles when the stored layer is corrupt", () => {
    window.localStorage.setItem(DASHBOARD_PREFERENCES_STORAGE_KEY, "");

    renderMap();

    expect(
      screen.getByRole("button", { name: "Barangay circles" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(mapState.sources).toEqual([
      { id: "dashboard-barangay-circles", features: 2 },
    ]);
  });

  it("falls back to barangay circles for an unknown map layer", () => {
    window.localStorage.setItem(
      DASHBOARD_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        version: DASHBOARD_PREFERENCES_VERSION,
        selection: {
          mode: "month",
          month: "2026-09",
          from: "2026-09-01",
          to: "2026-09-24",
        },
        mapLayer: "satellite",
      }),
    );

    renderMap();

    expect(
      screen.getByRole("button", { name: "Barangay circles" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(useFieldValidationMap).toHaveBeenLastCalledWith(
      { dateFrom: "2026-09-01", dateTo: "2026-09-24", limit: 100 },
      { enabled: false },
    );
  });
});
