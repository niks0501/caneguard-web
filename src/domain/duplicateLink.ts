import type { DiseaseReport, DuplicateLinkBlockedReason } from "./report.types";

/**
 * Why this case's duplicate link cannot change right now, or null when it can.
 * The server's `link_blocked_reason` is authoritative; reports without it
 * (older payloads, mock data) fall back to the same two lifecycle rules the
 * server guard applies: the case must be open and its visit not completed.
 */
export function duplicateLinkBlockedReason(
  report: Pick<DiseaseReport, "canonicalLinkage" | "lifecycle">,
): DuplicateLinkBlockedReason | null {
  const reported = report.canonicalLinkage?.linkBlockedReason;
  if (reported !== undefined) return reported;

  const lifecycle = report.lifecycle;
  if (!lifecycle) return null;
  if (lifecycle.caseState !== "open") return "closed";
  if (lifecycle.fieldValidationState === "completed") return "visit_completed";
  return null;
}
