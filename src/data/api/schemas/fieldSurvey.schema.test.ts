import { describe, expect, it } from "vitest";
import { fieldSurveyBoundariesResponseSchema } from "./fieldSurvey.schema";

const ring = [
  [122.95, 10.7],
  [122.951, 10.7],
  [122.951, 10.701],
  [122.95, 10.7],
];

function response(overrides: Record<string, unknown> = {}) {
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      id: "123",
      geometry: { type: "Polygon", coordinates: [ring] },
      properties: {
        id: 123,
        captured_at: "2026-10-04T02:30:12.123456Z",
        area_sqm: 6075.123,
        area_source: "device_reported",
        inspector: { uuid: "inspector-1", name: "Maria Santos" },
      },
    }],
    metadata: { total_count: 1, returned_count: 1, limit: 100, truncated: false },
    ...overrides,
  };
}

describe("fieldSurveyBoundariesResponseSchema", () => {
  it("accepts a polygon with a hole and keeps longitude-first GeoJSON positions", () => {
    const polygonWithHole = [
      ring,
      [
        [122.9502, 10.7002],
        [122.9503, 10.7002],
        [122.9503, 10.7003],
        [122.9502, 10.7002],
      ],
    ];
    const parsed = fieldSurveyBoundariesResponseSchema.parse(response({
      features: [{
        ...response().features[0],
        geometry: { type: "Polygon", coordinates: polygonWithHole },
      }],
    }));

    expect(parsed.features[0].geometry.coordinates).toHaveLength(2);
    expect(parsed.features[0].geometry.coordinates[0][0]).toEqual([122.95, 10.7]);
  });

  it("rejects out-of-range or swapped coordinates", () => {
    const invalidRing = [[10.7, 122.95], [10.8, 122.95], [10.8, 122.96], [10.7, 122.95]];
    expect(fieldSurveyBoundariesResponseSchema.safeParse(response({
      features: [{ ...response().features[0], geometry: { type: "Polygon", coordinates: [invalidRing] } }],
    })).success).toBe(false);
  });

  it("rejects a non-Polygon geometry", () => {
    expect(fieldSurveyBoundariesResponseSchema.safeParse(response({
      features: [{ ...response().features[0], geometry: { type: "Point", coordinates: [122.95, 10.7] } }],
    })).success).toBe(false);
  });

  it("rejects a negative reported area", () => {
    const invalidFeature = response().features[0];
    expect(fieldSurveyBoundariesResponseSchema.safeParse(response({
      features: [{ ...invalidFeature, properties: { ...invalidFeature.properties, area_sqm: -1 } }],
    })).success).toBe(false);
  });

  it("rejects a missing metadata envelope", () => {
    const incomplete = response();
    delete (incomplete as { metadata?: unknown }).metadata;
    expect(fieldSurveyBoundariesResponseSchema.safeParse(incomplete).success).toBe(false);
  });

  it("rejects an open ring but preserves a stored self-intersecting ring", () => {
    const openRing = [[122.95, 10.7], [122.951, 10.7], [122.951, 10.701], [122.9505, 10.7005]];
    expect(fieldSurveyBoundariesResponseSchema.safeParse(response({
      features: [{ ...response().features[0], geometry: { type: "Polygon", coordinates: [openRing] } }],
    })).success).toBe(false);

    const bowTie = [
      [122.95, 10.7],
      [122.951, 10.701],
      [122.951, 10.7],
      [122.95, 10.701],
      [122.95, 10.7],
    ];
    const parsed = fieldSurveyBoundariesResponseSchema.parse(response({
      features: [{ ...response().features[0], geometry: { type: "Polygon", coordinates: [bowTie] } }],
    }));
    expect(parsed.features[0].geometry.coordinates[0]).toEqual(bowTie);
  });

  it("rejects a response limit above the read-contract maximum", () => {
    expect(fieldSurveyBoundariesResponseSchema.safeParse(response({
      metadata: { total_count: 1, returned_count: 1, limit: 251, truncated: false },
    })).success).toBe(false);
  });

  it("accepts count/get races while preserving the returned feature count", () => {
    const feature = response().features[0];
    const features = Array.from({ length: 43 }, (_, index) => ({
      ...feature,
      id: String(index + 1),
      properties: { ...feature.properties, id: index + 1 },
    }));
    expect(fieldSurveyBoundariesResponseSchema.safeParse(response({
      features,
      metadata: { total_count: 42, returned_count: 43, limit: 100, truncated: false },
    })).success).toBe(true);

    const limitFeatures = Array.from({ length: 100 }, (_, index) => ({
      ...feature,
      id: String(index + 1),
      properties: { ...feature.properties, id: index + 1 },
    }));
    expect(fieldSurveyBoundariesResponseSchema.safeParse(response({
      features: limitFeatures,
      metadata: { total_count: 100, returned_count: 100, limit: 100, truncated: true },
    })).success).toBe(true);
  });

  it("rejects inconsistent returned counts and incomplete truncation states", () => {
    expect(fieldSurveyBoundariesResponseSchema.safeParse(response({
      metadata: { total_count: 1, returned_count: 2, limit: 100, truncated: false },
    })).success).toBe(false);

    const twoFeatures = Array.from({ length: 2 }, (_, index) => ({
      ...response().features[0],
      id: String(index + 1),
      properties: { ...response().features[0].properties, id: index + 1 },
    }));
    expect(fieldSurveyBoundariesResponseSchema.safeParse(response({
      features: twoFeatures,
      metadata: { total_count: 2, returned_count: 2, limit: 1, truncated: false },
    })).success).toBe(false);

    const features = Array.from({ length: 99 }, (_, index) => ({
      ...response().features[0],
      id: String(index + 1),
      properties: { ...response().features[0].properties, id: index + 1 },
    }));
    expect(fieldSurveyBoundariesResponseSchema.safeParse(response({
      features,
      metadata: { total_count: 101, returned_count: 99, limit: 100, truncated: true },
    })).success).toBe(false);

    expect(fieldSurveyBoundariesResponseSchema.safeParse(response({
      metadata: { total_count: 2, returned_count: 1, limit: 100, truncated: false },
    })).success).toBe(false);
  });
});
