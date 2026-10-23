import { describe, expect, it } from "vitest";
import { boundaryOutline } from "./boundaryShape";
import type { FieldSurveyPolygon } from "../../domain/fieldSurvey.types";

const square: FieldSurveyPolygon = {
  type: "Polygon",
  coordinates: [[
    [122.95, 10.7],
    [122.951, 10.7],
    [122.951, 10.701],
    [122.95, 10.701],
    [122.95, 10.7],
  ]],
};

describe("boundaryOutline", () => {
  it("draws a closed stored ring inside the preview box", () => {
    const outline = boundaryOutline(square, 200, 140);

    expect(outline.drawable).toBe(true);
    const points = outline.points.split(" ");
    expect(points).toHaveLength(5);
    for (const [x, y] of points.map((point) => point.split(",").map(Number))) {
      expect(x).toBeGreaterThanOrEqual(10);
      expect(x).toBeLessThanOrEqual(190);
      expect(y).toBeGreaterThanOrEqual(10);
      expect(y).toBeLessThanOrEqual(130);
    }
  });

  it("flips latitude so north is up and preserves the aspect ratio", () => {
    const tall: FieldSurveyPolygon = {
      type: "Polygon",
      coordinates: [[
        [122.95, 10.7],
        [122.951, 10.7],
        [122.951, 10.71],
        [122.95, 10.71],
        [122.95, 10.7],
      ]],
    };

    const [southWest, , northEast] = boundaryOutline(tall, 200, 140).points.split(" ");
    const [, ySouth] = southWest.split(",").map(Number);
    const [, yNorth] = northEast.split(",").map(Number);

    expect(yNorth).toBeLessThan(ySouth);
    // The taller span is constrained by the box height, not stretched to it.
    expect(boundaryOutline(tall, 200, 140).points).not.toBe(boundaryOutline(square, 200, 140).points);
  });

  it("refuses to invent a shape for a degenerate or missing ring", () => {
    expect(boundaryOutline(undefined).drawable).toBe(false);
    expect(boundaryOutline({ type: "Polygon", coordinates: [[]] }).drawable).toBe(false);
    expect(boundaryOutline({
      type: "Polygon",
      coordinates: [[[122.95, 10.7], [122.95, 10.7], [122.95, 10.7], [122.95, 10.7]]],
    }).drawable).toBe(false);
  });
});
