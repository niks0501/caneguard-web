import type { FieldValidationMapFeature } from "../../domain/fieldValidation.types";

export const LOCATION_MAP_MAX_ZOOM = 22;

export function locationGroupKey(feature: FieldValidationMapFeature): string {
  return feature.properties.locationGroupKey ?? feature.properties.uuid;
}

export function locationGroupMembers(features: FieldValidationMapFeature[], key: string) {
  return features.filter((feature) => locationGroupKey(feature) === key)
    .sort((a, b) => a.properties.uuid < b.properties.uuid ? -1 : a.properties.uuid > b.properties.uuid ? 1 : 0);
}

/** Stable pixel offsets, not new evidence coordinates or client-derived membership. */
export function radialLocationOffsets(count: number): Array<[number, number]> {
  const radius = Math.max(36, Math.min(140, 12 * Math.sqrt(count)));
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + 2 * Math.PI * index / count;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
}
