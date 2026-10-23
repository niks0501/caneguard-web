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

function ringBounds(positions: FieldSurveyPosition[]) {
  const longitudes = positions.map(([longitude]) => longitude);
  const latitudes = positions.map(([, latitude]) => latitude);

  return {
    minLongitude: Math.min(...longitudes),
    maxLongitude: Math.max(...longitudes),
    minLatitude: Math.min(...latitudes),
    maxLatitude: Math.max(...latitudes),
  };
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

  const { minLongitude, maxLongitude, minLatitude, maxLatitude } = ringBounds(positions);
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

export interface BoundaryCentroid {
  latitude: number;
  longitude: number;
}

/**
 * Area-weighted centroid of the stored outer ring, so an older boundary can be
 * placed in context without leaving the case. A ring that encloses no area, or
 * whose centroid falls outside its own extents, has no usable location.
 */
export function boundaryCentroid(
  geometry: FieldSurveyPolygon | undefined,
): BoundaryCentroid | null {
  const positions = ring(geometry);
  if (positions.length < 3) return null;

  const { minLongitude, maxLongitude, minLatitude, maxLatitude } = ringBounds(positions);
  if (minLongitude === maxLongitude || minLatitude === maxLatitude) return null;

  const [originLongitude, originLatitude] = positions[0];
  let twiceArea = 0;
  let weightedLongitude = 0;
  let weightedLatitude = 0;
  for (const [index, [longitude, latitude]] of positions.entries()) {
    const [nextLongitude, nextLatitude] = positions[(index + 1) % positions.length];
    const x = longitude - originLongitude;
    const y = latitude - originLatitude;
    const nextX = nextLongitude - originLongitude;
    const nextY = nextLatitude - originLatitude;
    const cross = x * nextY - nextX * y;
    twiceArea += cross;
    weightedLongitude += (x + nextX) * cross;
    weightedLatitude += (y + nextY) * cross;
  }
  if (twiceArea === 0) return null;

  const longitude = originLongitude + weightedLongitude / (3 * twiceArea);
  const latitude = originLatitude + weightedLatitude / (3 * twiceArea);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  if (latitude < minLatitude || latitude > maxLatitude) return null;
  if (longitude < minLongitude || longitude > maxLongitude) return null;

  return { latitude, longitude };
}
