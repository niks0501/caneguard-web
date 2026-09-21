/**
 * Shared dirty-draft guard for modal Cancel, backdrop, and Escape.
 * Returns true when it is safe to close (clean draft, or the reviewer
 * confirmed the discard).
 */
export function confirmDiscardUnsavedChanges(isDirty: boolean): boolean {
  if (!isDirty) return true;
  return window.confirm(
    "You have unsaved changes. Are you sure you want to discard them?",
  );
}
