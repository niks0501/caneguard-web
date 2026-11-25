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

/** True when a point lies inside the stored outer ring (even-odd rule). */
export function pointInBoundary(
  geometry: FieldSurveyPolygon | undefined,
  point: { latitude: number; longitude: number },
): boolean {
  const positions = ring(geometry);
  if (positions.length < 3) return false;

  let inside = false;
  for (let index = 0, previous = positions.length - 1; index < positions.length; previous = index++) {
    const [longitude, latitude] = positions[index];
    const [previousLongitude, previousLatitude] = positions[previous];
    const crosses = (latitude > point.latitude) !== (previousLatitude > point.latitude)
      && point.longitude < ((previousLongitude - longitude) * (point.latitude - latitude)) / (previousLatitude - latitude) + longitude;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Great-circle distance in metres between two WGS84 points. */
export function distanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLatitude = radians(to.latitude - from.latitude);
  const deltaLongitude = radians(to.longitude - from.longitude);
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
