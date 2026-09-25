import { beforeEach, describe, expect, it } from "vitest";
import {
  DASHBOARD_PREFERENCES_STORAGE_KEY,
  DASHBOARD_PREFERENCES_VERSION,
  defaultDashboardPreferences,
  mapLayerValues,
  parseDashboardPreferences,
  readDashboardPreferences,
  saveDashboardMapLayer,
  saveDashboardScope,
} from "./dashboardPreferences";
import type { ScopeSelection } from "./dashboardScope";

const TODAY = "2026-09-24";

/** Minimal Storage stand-in for the blocked/absent-storage paths. */
function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => entries.delete(key),
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
}

function unwritableStorage(): Storage {
  return {
    ...memoryStorage(),
    getItem: () => {
      throw new Error("storage unavailable");
    },
    setItem: () => {
      throw new Error("storage unavailable");
    },
  };
}

function store(payload: unknown) {
  window.localStorage.setItem(
    DASHBOARD_PREFERENCES_STORAGE_KEY,
    JSON.stringify(payload),
  );
}

function persisted(): Record<string, unknown> {
  return JSON.parse(
    window.localStorage.getItem(DASHBOARD_PREFERENCES_STORAGE_KEY) ?? "null",
  ) as Record<string, unknown>;
}

const defaultSelection = defaultDashboardPreferences(TODAY).selection;

beforeEach(() => {
  window.localStorage.clear();
});

describe("dashboard preferences store", () => {
  it("starts from the current PHT month to date and barangay circles", () => {
    expect(readDashboardPreferences(window.localStorage, TODAY)).toEqual({
      selection: defaultSelection,
      mapLayer: "barangay",
    });
  });

  it("round-trips a chosen scope with its version envelope", () => {
    const selection: ScopeSelection = {
      mode: "custom",
      month: "2026-07",
      from: "2026-07-05",
      to: "2026-07-19",
    };
    saveDashboardScope(selection, window.localStorage, TODAY);

    expect(readDashboardPreferences(window.localStorage, TODAY).selection).toEqual(
      selection,
    );
    expect(persisted().version).toBe(DASHBOARD_PREFERENCES_VERSION);
  });

  it("round-trips the map layer and keeps both controls side by side", () => {
    const selection: ScopeSelection = {
      mode: "month",
      month: "2026-08",
      from: "2026-08-01",
      to: "2026-08-31",
    };
    saveDashboardScope(selection, window.localStorage, TODAY);
    saveDashboardMapLayer("gps", window.localStorage, TODAY);

    // Each control saves only its own slice, so neither write erases the other.
    expect(readDashboardPreferences(window.localStorage, TODAY)).toEqual({
      selection,
      mapLayer: "gps",
    });

    saveDashboardScope(
      { ...selection, mode: "last30" },
      window.localStorage,
      TODAY,
    );
    expect(readDashboardPreferences(window.localStorage, TODAY)).toEqual({
      selection: { ...selection, mode: "last30" },
      mapLayer: "gps",
    });

    saveDashboardMapLayer("barangay", window.localStorage, TODAY);
    expect(readDashboardPreferences(window.localStorage, TODAY).mapLayer).toBe(
      "barangay",
    );
  });

  it("round-trips every scope mode", () => {
    for (const mode of ["month", "last30", "custom"] as const) {
      window.localStorage.clear();
      const selection: ScopeSelection = {
        mode,
        month: "2026-06",
        from: "2026-06-02",
        to: "2026-06-11",
      };
      saveDashboardScope(selection, window.localStorage, TODAY);
      expect(
        readDashboardPreferences(window.localStorage, TODAY).selection,
      ).toEqual(selection);
    }
  });

  it("falls back to defaults when the stored value is not JSON", () => {
    window.localStorage.setItem(DASHBOARD_PREFERENCES_STORAGE_KEY, "{not json");
    expect(readDashboardPreferences(window.localStorage, TODAY)).toEqual(
      defaultDashboardPreferences(TODAY),
    );
  });

  it("falls back to defaults for a truncated or wrongly shaped payload", () => {
    for (const payload of [null, 42, "gps", [], {}, { version: undefined }]) {
      store(payload);
      expect(readDashboardPreferences(window.localStorage, TODAY)).toEqual(
        defaultDashboardPreferences(TODAY),
      );
    }
  });

  it("ignores a payload written by an unknown store version", () => {
    // The version gate is the migration seam: an unreadable shape is never
    // guessed at, it is replaced by the current defaults.
    store({
      version: DASHBOARD_PREFERENCES_VERSION + 1,
      selection: {
        mode: "custom",
        month: "2026-07",
        from: "2026-07-05",
        to: "2026-07-19",
      },
      mapLayer: "gps",
    });
    expect(readDashboardPreferences(window.localStorage, TODAY)).toEqual(
      defaultDashboardPreferences(TODAY),
    );
  });

  it("keeps the readable control when only the other one is invalid", () => {
    store({
      version: DASHBOARD_PREFERENCES_VERSION,
      selection: {
        mode: "yearly",
        month: "2026-13",
        from: "not-a-date",
        to: "2026-09-01",
      },
      mapLayer: "gps",
    });
    const restored = readDashboardPreferences(window.localStorage, TODAY);
    expect(restored.selection).toEqual(defaultSelection);
    expect(restored.mapLayer).toBe("gps");

    store({
      version: DASHBOARD_PREFERENCES_VERSION,
      selection: {
        mode: "month",
        month: "2026-08",
        from: "2026-08-01",
        to: "2026-08-31",
      },
      mapLayer: "satellite",
    });
    const other = readDashboardPreferences(window.localStorage, TODAY);
    expect(other.selection.mode).toBe("month");
    expect(other.selection.month).toBe("2026-08");
    expect(other.mapLayer).toBe("barangay");
  });

  it("treats a scope that starts in the future as stale", () => {
    for (const selection of [
      { mode: "month", month: "2026-10", from: "2026-10-01", to: "2026-10-31" },
      { mode: "custom", month: "2026-10", from: "2026-10-02", to: "2026-10-09" },
    ]) {
      store({
        version: DASHBOARD_PREFERENCES_VERSION,
        selection,
        mapLayer: "gps",
      });
      expect(
        readDashboardPreferences(window.localStorage, TODAY).selection,
      ).toEqual(defaultSelection);
    }
  });

  it("treats a reversed custom window as stale", () => {
    store({
      version: DASHBOARD_PREFERENCES_VERSION,
      selection: {
        mode: "custom",
        month: "2026-09",
        from: "2026-09-20",
        to: "2026-09-02",
      },
      mapLayer: "barangay",
    });
    expect(readDashboardPreferences(window.localStorage, TODAY).selection).toEqual(
      defaultSelection,
    );
  });

  it("keeps a last-30-days choice whose stored window has moved on", () => {
    // The mode is resolved from today on every read, so its stored dates can
    // never make it stale.
    const selection: ScopeSelection = {
      mode: "last30",
      month: "2025-01",
      from: "2025-01-01",
      to: "2025-01-30",
    };
    saveDashboardScope(selection, window.localStorage, TODAY);

    const restored = readDashboardPreferences(window.localStorage, TODAY);
    expect(restored.selection.mode).toBe("last30");
    expect(restored.mapLayer).toBe("barangay");
  });

  it("never throws when storage refuses to read or write", () => {
    const blocked = unwritableStorage();
    expect(readDashboardPreferences(blocked, TODAY)).toEqual(
      defaultDashboardPreferences(TODAY),
    );
    expect(() =>
      saveDashboardScope(defaultSelection, blocked, TODAY),
    ).not.toThrow();
    expect(() => saveDashboardMapLayer("gps", blocked, TODAY)).not.toThrow();
  });

  it("persists without a browser store at all", () => {
    expect(readDashboardPreferences(null, TODAY)).toEqual(
      defaultDashboardPreferences(TODAY),
    );
    expect(() =>
      saveDashboardMapLayer("gps", null, TODAY),
    ).not.toThrow();
  });

  it("accepts only the two map layers", () => {
    expect(mapLayerValues).toEqual(["barangay", "gps"]);
    expect(
      parseDashboardPreferences(
        {
          version: DASHBOARD_PREFERENCES_VERSION,
          selection: defaultSelection,
          mapLayer: "barangay",
        },
        TODAY,
      ).mapLayer,
    ).toBe("barangay");
  });

  it("repairs a corrupt value in place on the next save", () => {
    window.localStorage.setItem(DASHBOARD_PREFERENCES_STORAGE_KEY, "garbage");
    saveDashboardMapLayer("gps", window.localStorage, TODAY);

    expect(persisted()).toEqual({
      version: DASHBOARD_PREFERENCES_VERSION,
      selection: defaultSelection,
      mapLayer: "gps",
    });
  });

  it("reads and writes through an injected memory store", () => {
    const storage = memoryStorage();
    const selection = defaultDashboardPreferences(TODAY).selection;
    saveDashboardScope(selection, storage, TODAY);
    saveDashboardMapLayer("gps", storage, TODAY);

    expect(readDashboardPreferences(storage, TODAY)).toEqual({
      selection,
      mapLayer: "gps",
    });
  });
});
