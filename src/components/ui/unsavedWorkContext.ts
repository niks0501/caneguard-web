import { createContext, useContext, useEffect } from "react";

/** Registers one dirty draft and returns its unregister cleanup. */
export type RegisterDraft = () => () => void;

export const UnsavedWorkContext = createContext<RegisterDraft | null>(null);

/**
 * Marks the caller's draft as unsaved work. While any registered draft is
 * dirty, in-app navigation (links, sidebar, Back) is blocked behind a single
 * Stay / Discard decision, and leaving the page warns the browser. Autosave is
 * deliberately not used: a review keeps its meaning only when a reviewer
 * submits it explicitly.
 *
 * Outside an `UnsavedWorkProvider` (isolated component tests) this is a no-op.
 */
export function useUnsavedWorkGuard(isDirty: boolean) {
  const registerDraft = useContext(UnsavedWorkContext);

  useEffect(() => {
    if (!isDirty || !registerDraft) return;
    return registerDraft();
  }, [isDirty, registerDraft]);
}
