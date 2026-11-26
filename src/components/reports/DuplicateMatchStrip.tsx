import { GitBranch } from "lucide-react";
import type { PossibleRecentMatch } from "../../domain/report.types";
import { formatDateTime } from "../../lib/formatters";
import { Button } from "../ui/Button";
import { possibleConditionName } from "./duplicateCompareView";

interface DuplicateMatchStripProps {
  matches: PossibleRecentMatch[];
  /** The look-back window the server used, in hours. */
  windowHours?: number;
  /** One short line saying why linking is unavailable; disables the compare action. */
  blockedMessage?: string | null;
  onCompare: () => void;
  onDismiss: () => void;
}

/**
 * Top-of-case alert for possible duplicates. A match is decision support, not a
 * verdict: "Not a duplicate" only hides this strip for the current page view.
 */
export function DuplicateMatchStrip({
  matches,
  windowHours,
  blockedMessage = null,
  onCompare,
  onDismiss,
}: DuplicateMatchStripProps) {
  const nearest = matches[0];
  if (!nearest) return null;

  const count = matches.length;
  const nearby = windowHours ? ` within ${windowHours} hours` : "";
  const hint = blockedMessage ? "duplicate-strip-blocked" : undefined;

  return (
    <section className="duplicate-strip" aria-labelledby="duplicate-strip-heading">
      <GitBranch aria-hidden="true" className="duplicate-strip__icon" />
      <div className="duplicate-strip__body">
        <h2 id="duplicate-strip-heading">
          {count === 1 ? "1 similar case" : `${count} similar cases`} reported nearby{nearby}
        </h2>
        <p className="duplicate-strip__match">
          <strong>{nearest.referenceCode}</strong>
          {" · "}
          {Math.round(nearest.distanceMeters)} m away
          {" · "}
          {possibleConditionName(nearest.condition)}
          {" · "}
          {nearest.barangay}
          {" · "}
          {formatDateTime(nearest.submittedAt)}
          {count > 1 ? <span className="duplicate-strip__more"> · +{count - 1} more</span> : null}
        </p>
        {blockedMessage ? (
          <p id="duplicate-strip-blocked" className="duplicate-strip__blocked">{blockedMessage}</p>
        ) : null}
      </div>
      <div className="duplicate-strip__actions">
        <Button
          type="button"
          disabled={Boolean(blockedMessage)}
          aria-describedby={hint}
          onClick={onCompare}
        >
          Compare &amp; link duplicate
        </Button>
        <Button type="button" variant="quiet" onClick={onDismiss}>
          Not a duplicate
        </Button>
      </div>
    </section>
  );
}
