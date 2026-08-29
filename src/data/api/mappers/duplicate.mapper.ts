import type {
  PossibleRecentMatch,
  PossibleRecentMatches,
} from "../../../domain/report.types";
import type {
  PossibleRecentMatchesResponseDto,
  PossibleRecentMatchDto,
} from "../schemas/report.schema";

export function mapPossibleRecentMatch(
  dto: PossibleRecentMatchDto,
): PossibleRecentMatch {
  return {
    uuid: dto.case.uuid,
    referenceCode: dto.case.reference_code,
    submittedAt: dto.case.submitted_at,
    condition: dto.match.condition,
    distanceMeters: dto.match.distance_meters,
    basis: dto.match.basis,
    message: dto.message,
  };
}

export function mapPossibleRecentMatches(
  dto: PossibleRecentMatchesResponseDto,
): PossibleRecentMatches {
  return {
    matches: dto.data.map(mapPossibleRecentMatch),
    message: dto.message,
    possibleMatch: dto.meta.possible_match,
    canSubmit: dto.meta.can_submit,
    assessment: dto.meta.assessment,
    recentWindowHours: dto.meta.recent_window_hours,
    locationRadiusMeters: dto.meta.location_radius_meters,
  };
}
