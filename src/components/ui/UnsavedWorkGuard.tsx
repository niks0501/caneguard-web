import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useBlocker, type BlockerFunction } from "react-router";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { UnsavedWorkContext } from "./unsavedWorkContext";

/**
 * One consistent unsaved-work guard for every case subform. Mount it inside a
 * data router so `useBlocker` can intercept both router navigation and the
 * browser Back/Forward buttons.
 */
export function UnsavedWorkProvider({ children }: { children: ReactNode }) {
  const dirtyDrafts = useRef(0);
  const [hasDirtyDraft, setHasDirtyDraft] = useState(false);
  const dirtyRef = useRef(false);
  const stayButton = useRef<HTMLButtonElement | null>(null);

  const registerDraft = useCallback(() => {
    let active = true;
    dirtyDrafts.current += 1;
    dirtyRef.current = true;
    setHasDirtyDraft(true);
    return () => {
      if (!active) return;
      active = false;
      dirtyDrafts.current = Math.max(0, dirtyDrafts.current - 1);
      if (dirtyDrafts.current === 0) {
        dirtyRef.current = false;
        setHasDirtyDraft(false);
      }
    };
  }, []);

  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) => {
      if (!dirtyRef.current) return false;
      // An expired session must still be able to leave the workspace.
      if (nextLocation.pathname === "/login") return false;
      return (
        currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search ||
        currentLocation.hash !== nextLocation.hash
      );
    },
    [],
  );

  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    if (!hasDirtyDraft) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasDirtyDraft]);

  return (
    <UnsavedWorkContext.Provider value={registerDraft}>
      {children}
      <Modal
        id="unsaved-work-guard"
        title="Discard unsaved changes?"
        description="This draft has not been saved. Leaving now discards it, and returning will not restore it."
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        initialFocusRef={stayButton}
        footer={
          <>
            <Button
              ref={stayButton}
              type="button"
              variant="primary"
              onClick={() => blocker.reset?.()}
            >
              Stay on this page
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => blocker.proceed?.()}
            >
              Discard and leave
            </Button>
          </>
        }
      >
        <p>
          Stay to keep your selections, or discard them and continue. Nothing is
          saved to the server unless you submit the form.
        </p>
      </Modal>
    </UnsavedWorkContext.Provider>
  );
}
