import { describe, expect, it } from "vitest";
import {
  comparePlotsNewestFirst,
  latestPlotId,
  sortPlotsNewestFirst,
  summarizeCaseFieldMaps,
  supersedingPlotIds,
} from "./fieldMapFreshness";

const plot = (id: number, capturedAt: string, extra: Record<string, unknown> = {}) => ({
  fieldSurveyId: id,
  label: null,
  capturedAt,
  outlineFromSurveyId: null,
  areaSqm: 100,
  areaSource: "device_reported" as const,
  geometry: { type: "Polygon", coordinates: [] } as never,
  inspector: { uuid: "u", name: "Ana" },
  affectedAreaSqm: null,
  affectedPercent: null,
  lossRatePercent: null,
  ...extra,
});

describe("ordering", () => {
  it("sorts newest first with id tie-break and invalid dates last", () => {
    const items = [
      { id: 1, capturedAt: "2026-01-01T00:00:00Z" },
      { id: 2, capturedAt: "2026-01-02T00:00:00Z" },
      { id: 3, capturedAt: "2026-01-02T00:00:00Z" },
      { id: 4, capturedAt: "nope" },
    ];
    expect(sortPlotsNewestFirst(items).map((i) => i.id)).toEqual([3, 2, 1, 4]);
    expect(latestPlotId(items)).toBe(3);
    expect(latestPlotId([])).toBeNull();
    expect(comparePlotsNewestFirst(items[0], items[1])).toBeGreaterThan(0);
  });
  it("maps older plots to their newer remeasurements", () => {
    const map = supersedingPlotIds([
      { id: 1, capturedAt: "2026-01-01T00:00:00Z" },
      { id: 2, capturedAt: "2026-01-02T00:00:00Z", outlineFromSurveyId: 1 },
      { id: 3, capturedAt: "2026-01-03T00:00:00Z", outlineFromSurveyId: 1 },
      { id: 4, capturedAt: "2026-01-04T00:00:00Z", outlineFromSurveyId: 4 },
    ]);
    expect(map.get(1)).toEqual([3, 2]);
    expect(map.has(4)).toBe(false);
  });
});

describe("summarizeCaseFieldMaps", () => {
  it("is none without maps and pending_sync when attached but not arrived", () => {
    expect(summarizeCaseFieldMaps({}).state).toBe("none");
    const s = summarizeCaseFieldMaps({ inspectorAttachment: { clientUuid: "c", arrived: false, confirmed: false, boundary: null } });
    expect(s).toMatchObject({ state: "pending_sync", pendingSync: true, primaryBoundaryId: null });
  });
  it("flags a newer waiting plot and dedupes the attachment", () => {
    const waiting = plot(2, "2026-02-01T00:00:00Z");
    const s = summarizeCaseFieldMaps({
      affectedFields: [plot(1, "2026-01-01T00:00:00Z")],
      inspectorAttachment: { clientUuid: "c", arrived: true, confirmed: false, boundary: waiting },
    });
    expect(s.plots.map((p) => p.fieldSurveyId)).toEqual([2, 1]);
    expect(s).toMatchObject({ primaryBoundaryId: 1, latestBoundaryId: 2, confirmedCount: 1, waitingCount: 1 });
    expect(s.newerWaitingPlot?.fieldSurveyId).toBe(2);

    const same = plot(1, "2026-01-01T00:00:00Z");
    const deduped = summarizeCaseFieldMaps({
      affectedFields: [plot(1, "2026-01-01T00:00:00Z")],
      inspectorAttachment: { clientUuid: "c", arrived: true, confirmed: true, boundary: same },
    });
    expect(deduped.plots).toHaveLength(1);
    expect(deduped.newerWaitingPlot).toBeNull();
  });
  it("uses the waiting plot as primary when nothing is confirmed", () => {
    const waiting = plot(5, "2026-02-01T00:00:00Z");
    const s = summarizeCaseFieldMaps({ inspectorAttachment: { clientUuid: "c", arrived: true, confirmed: false, boundary: waiting } });
    expect(s).toMatchObject({ primaryBoundaryId: 5, newerWaitingPlot: null, state: "ready" });
  });
});
