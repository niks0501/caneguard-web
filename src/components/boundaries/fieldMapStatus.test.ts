import { describe, expect, it } from "vitest";
import type { FieldSurveyBoundaryFeature, FieldSurveyCaseLink } from "../../domain/fieldSurvey.types";
import {
  fieldMapInspectors,
  fieldMapName,
  fieldMapStatus,
  filterFieldMaps,
  NO_FIELD_MAP_FILTERS,
  percentAffected,
  primaryCase,
} from "./fieldMapStatus";

function feature(
  id: number,
  cases: FieldSurveyCaseLink[],
  overrides: { inspector?: string; capturedAt?: string } = {},
): FieldSurveyBoundaryFeature {
  const inspector = overrides.inspector ?? "Ana";
  return {
    type: "Feature",
    id: String(id),
    geometry: { type: "Polygon", coordinates: [[[122.95, 10.7], [122.951, 10.7], [122.95, 10.701], [122.95, 10.7]]] },
    properties: {
      id,
      capturedAt: overrides.capturedAt ?? "2026-11-20T02:00:00.000Z",
      areaSqm: 10_000,
      areaSource: "device_reported",
      affectedAreas: [],
      affectedAreaSqm: null,
      cases,
      inspector: { uuid: `uuid-${inspector}`, name: inspector },
    },
  };
}

const confirmed: FieldSurveyCaseLink = { uuid: "c1", referenceCode: "CG-0001", link: "confirmed" };
const attached: FieldSurveyCaseLink = { uuid: "c2", referenceCode: "CG-0002", link: "attached" };

describe("field map status", () => {
  it("reads a map as confirmed, waiting or not on a case", () => {
    expect(fieldMapStatus(feature(1, [confirmed]))).toBe("confirmed");
    expect(fieldMapStatus(feature(2, [attached]))).toBe("waiting");
    expect(fieldMapStatus(feature(3, [attached, confirmed]))).toBe("confirmed");
    expect(fieldMapStatus(feature(4, []))).toBe("unlinked");
  });

  it("names a map by its case, preferring the confirmed one", () => {
    expect(fieldMapName(feature(1, [attached, confirmed]))).toBe("CG-0001");
    expect(primaryCase(feature(1, [attached, confirmed]))?.uuid).toBe("c1");
    expect(fieldMapName(feature(9, []))).toBe("Map 9");
  });

  it("computes % affected like the API and refuses to invent one", () => {
    expect(percentAffected(10_000, 2_600)).toBe(26);
    expect(percentAffected(10_000, 33.33)).toBe(0.3);
    expect(percentAffected(10_000, 99_999)).toBe(100);
    expect(percentAffected(10_000, null)).toBeNull();
    expect(percentAffected(0, 100)).toBeNull();
  });

  it("filters by inspector, status and period together", () => {
    const now = Date.parse("2026-11-25T02:00:00.000Z");
    const features = [
      feature(1, [confirmed], { inspector: "Ana" }),
      feature(2, [attached], { inspector: "Ben" }),
      feature(3, [], { inspector: "Ana", capturedAt: "2026-08-01T02:00:00.000Z" }),
    ];

    expect(filterFieldMaps(features, NO_FIELD_MAP_FILTERS, now)).toHaveLength(3);
    expect(filterFieldMaps(features, { ...NO_FIELD_MAP_FILTERS, inspector: "uuid-Ana" }, now).map((f) => f.properties.id)).toEqual([1, 3]);
    expect(filterFieldMaps(features, { ...NO_FIELD_MAP_FILTERS, status: "waiting" }, now).map((f) => f.properties.id)).toEqual([2]);
    expect(filterFieldMaps(features, { ...NO_FIELD_MAP_FILTERS, period: "30" }, now).map((f) => f.properties.id)).toEqual([1, 2]);
    expect(filterFieldMaps(features, { inspector: "uuid-Ana", status: "unlinked", period: "90" }, now)).toEqual([]);
  });

  it("lists each inspector once, by name", () => {
    const features = [feature(1, [], { inspector: "Ben" }), feature(2, [], { inspector: "Ana" }), feature(3, [], { inspector: "Ben" })];
    expect(fieldMapInspectors(features).map((entry) => entry.name)).toEqual(["Ana", "Ben"]);
  });
});
