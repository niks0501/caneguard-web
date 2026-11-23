import { useState } from "react";
import { Button } from "../ui/Button";

export const REVIEW_HANDOFF_NOTE_MAX = 500;

/**
 * Lets the reviewer holding a case step away on purpose, so the next reviewer
 * does not wait for the lease to run out. The optional note travels with the case.
 */
export function ReviewHandoffPanel({ onRelease }: { onRelease: (note: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Step away
      </Button>
    );
  }

  const release = async () => {
    setPending(true);
    setFailed(false);
    try {
      await onRelease(note);
    } catch {
      setFailed(true);
      setPending(false);
    }
  };

  return (
    <section className="review-handoff-panel" aria-label="Step away from this case">
      <label>
        Note for the next reviewer
        <textarea
          value={note}
          maxLength={REVIEW_HANDOFF_NOTE_MAX}
          rows={3}
          disabled={pending}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      {failed ? <p className="form-error" role="alert">The case could not be released. Try again.</p> : null}
      <div className="review-handoff-panel__actions">
        <Button type="button" disabled={pending} onClick={() => void release()}>
          {pending ? "Releasing..." : "Release case"}
        </Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
