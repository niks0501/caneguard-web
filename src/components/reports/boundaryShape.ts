import type { FieldSurveyPolygon, FieldSurveyPosition } from "../../domain/fieldSurvey.types";

export interface BoundaryOutline {
  /** SVG polygon points in a 0..width / 0..height box. */
  points: string;
  /** True when the stored ring has usable distinct positions. */
  drawable: boolean;
}

function ring(geometry: FieldSurveyPolygon | undefined): FieldSurveyPosition[] {
  return geometry?.coordinates[0] ?? [];
}

/**
 * Project a stored boundary ring into a small SVG box so the reviewer can
 * compare the shape in context. Longitude is scaled and latitude flipped; the
 * aspect ratio is preserved inside the box, with padding for the stroke.
 */
export function boundaryOutline(
  geometry: FieldSurveyPolygon | undefined,
  width = 200,
  height = 140,
  padding = 10,
): BoundaryOutline {
  const positions = ring(geometry);
  if (positions.length < 3) return { points: "", drawable: false };

  const longitudes = positions.map(([longitude]) => longitude);
  const latitudes = positions.map(([, latitude]) => latitude);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const spanLongitude = maxLongitude - minLongitude;
  const spanLatitude = maxLatitude - minLatitude;
  if (spanLongitude <= 0 || spanLatitude <= 0) return { points: "", drawable: false };

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const scale = Math.min(innerWidth / spanLongitude, innerHeight / spanLatitude);
  const offsetX = (width - spanLongitude * scale) / 2;
  const offsetY = (height - spanLatitude * scale) / 2;

  const points = positions
    .map(([longitude, latitude]) => {
      const x = offsetX + (longitude - minLongitude) * scale;
      const y = offsetY + (maxLatitude - latitude) * scale;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return { points, drawable: true };
}
