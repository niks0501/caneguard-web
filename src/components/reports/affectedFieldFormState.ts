/**
 * The affected-boundary form on a case, as one named state. Same vocabulary as
 * the review form beside it (`idle`, `dirty`, `saving`, `saved`, `offline`,
 * `conflict`, `error`), published as `data-state` on the section.
 */
export type AffectedFieldFormState =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "offline"
  | "conflict"
  | "error";

export function affectedFieldFormState({
  saved,
  online,
  conflict,
  saving,
  failed,
  dirty,
}: {
  saved: boolean;
  online: boolean;
  conflict: boolean;
  saving: boolean;
  failed: boolean;
  dirty: boolean;
}): AffectedFieldFormState {
  if (saving) return "saving";
  if (!online) return dirty ? "offline" : saved ? "saved" : "idle";
  if (conflict) return "conflict";
  if (failed) return "error";
  if (saved) return "saved";
  return dirty ? "dirty" : "idle";
}
