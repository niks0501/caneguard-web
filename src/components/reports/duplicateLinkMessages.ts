import { ZodError } from "zod";
import { ApiError } from "../../api/ApiError";
import type { DuplicateLinkBlockedReason } from "../../domain/report.types";

/** One short line saying why duplicate linking is unavailable, or null when it is available. */
export function duplicateLinkBlockedMessage(
  blockedReason: DuplicateLinkBlockedReason | null,
  reviewLocked: boolean,
): string | null {
  if (reviewLocked) return "Another reviewer is reviewing this case. Linking is unavailable until they finish.";
  if (blockedReason === "closed") return "This case is closed. Reopen it to change duplicate links.";
  if (blockedReason === "visit_completed") return "The field visit is completed, so duplicate links can no longer change.";
  return null;
}

/** Inline message for a failed link request; null when there is no error. */
export function duplicateLinkErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof ZodError) {
    return "The server returned an unexpected response. Refresh the case before trying again.";
  }
  if (!(error instanceof ApiError)) {
    return "The duplicate linking service is unavailable. No link was recorded.";
  }
  const serverMessage = error.errors?.canonical_report_uuid?.[0] ?? error.errors?.report?.[0];

  switch (error.status) {
    case 409:
      return "This case changed, or it is already linked to a different original case. Refresh the case, then try again.";
    case 422:
      return serverMessage
        ?? (error.errors?.case_state ? "This case is closed, so its duplicate link can no longer change." : null)
        ?? (error.errors?.field_validation_state ? "The field visit is completed, so duplicate links can no longer change." : null)
        ?? "The server rejected this link. Check the selected case and try again.";
    case 423:
      return "Another reviewer is reviewing this case, so it cannot be closed right now. Link without closing it, or try again later.";
    case 403:
      return "You do not have permission to link duplicate cases.";
    default:
      return serverMessage ?? "The duplicate linking service is unavailable. No link was recorded.";
  }
}

/** Inline message for a failed unlink request; null when there is no error. */
export function duplicateUnlinkErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof ZodError) {
    return "The duplicate unlink response had an unexpected format. Refresh the case before trying again.";
  }
  if (!(error instanceof ApiError)) {
    return "The duplicate unlinking service is unavailable. No link change was confirmed.";
  }
  switch (error.status) {
    case 409:
      return "This case changed while the duplicate link was being removed. Refresh before trying again.";
    case 403:
      return "You do not have permission to remove duplicate links.";
    case 422:
      return "This duplicate link cannot be removed while the case is closed or its field visit is completed.";
    default:
      return "The duplicate unlinking service is unavailable. No link change was confirmed.";
  }
}
