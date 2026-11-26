import { useId, useRef, useState, type ReactNode } from "react";
import { ApiError } from "../../api/ApiError";
import type { DiseaseReport, PossibleRecentMatch } from "../../domain/report.types";
import { useLinkDuplicateReport } from "../../hooks/useReports";
import { formatDateTime } from "../../lib/formatters";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { TextArea } from "../ui/FormControls";
import { useUnsavedWorkGuard } from "../ui/unsavedWorkContext";
import { DiseaseBadge } from "./ReportBadges";
import { EvidenceThumbnail } from "./EvidenceThumbnail";
import { ReportPicker } from "./ReportPicker";
import {
  compareCaseFromMatch,
  compareCaseFromReport,
  possibleConditionName,
  sameText,
  type CompareCase,
} from "./duplicateCompareView";
import { duplicateLinkErrorMessage } from "./duplicateLinkMessages";

export interface DuplicateLinkedResult {
  /** The original case's reference code, when it is known. */
  referenceCode: string | null;
  closed: boolean;
}

interface DuplicateCompareModalProps {
  open: boolean;
  onClose: () => void;
  report: DiseaseReport;
  matches: PossibleRecentMatch[];
  matchesPending?: boolean;
  matchesError?: boolean;
  /** Nearby match to compare first; the reviewer can pick another. */
  initialMatchUuid?: string | null;
  /** One short line saying why linking is unavailable; disables the link action. */
  blockedMessage?: string | null;
  onLinked: (result: DuplicateLinkedResult) => void;
  onRefresh?: () => void;
}

type Choice =
  | { kind: "match"; uuid: string }
  | { kind: "search"; selected: CompareCase }
  | { kind: "pasted"; uuid: string };

function Row({ label, children, same = false }: { label: string; children: ReactNode; same?: boolean }) {
  return (
    <div className="duplicate-compare__row">
      <dt>{label}</dt>
      <dd>
        {children}
        {same ? <span className="duplicate-compare__same">Same</span> : null}
      </dd>
    </div>
  );
}

function CasePane({
  heading,
  subject,
  against,
}: {
  heading: string;
  subject: CompareCase;
  /** The other case; matching facts are marked "Same" on the original case's pane. */
  against?: CompareCase;
}) {
  const headingId = useId();

  return (
    <section className="duplicate-compare__pane" aria-labelledby={headingId}>
      <h3 id={headingId}>
        {heading} <span className="duplicate-compare__code">{subject.referenceCode}</span>
        {subject.distanceMeters !== undefined ? (
          <span className="duplicate-compare__distance">{Math.round(subject.distanceMeters)} m away</span>
        ) : null}
      </h3>
      <div className="duplicate-compare__photo">
        <EvidenceThumbnail
          status={subject.imageStatus}
          src={subject.imageUrl}
          label={`Photo for ${subject.referenceCode}`}
        />
      </div>
      <dl className="duplicate-compare__facts">
        <Row label="Farmer" same={sameText(subject.farmer, against?.farmer ?? null)}>
          {subject.farmer ?? "Not provided"}
        </Row>
        <Row label="Barangay" same={sameText(subject.barangay, against?.barangay ?? null)}>{subject.barangay}</Row>
        <Row label="Condition" same={against !== undefined && subject.condition === against.condition}>
          <DiseaseBadge disease={subject.condition} includePossibleConditionPrefix={false} />
        </Row>
        <Row label="Submitted">{formatDateTime(subject.submittedAt)}</Row>
        <Row label="Reporter">{subject.reporter ?? "Not provided"}</Row>
        <Row label="Status">{subject.status}</Row>
      </dl>
    </section>
  );
}

function CompareDialog({
  onClose,
  report,
  matches,
  matchesPending,
  matchesError,
  initialMatchUuid,
  blockedMessage = null,
  onLinked,
  onRefresh,
}: Omit<DuplicateCompareModalProps, "open">) {
  const link = useLinkDuplicateReport(report.uuid);
  // Open on the comparison itself; the default first-field focus would scroll past the photos.
  const comparisonRef = useRef<HTMLDivElement>(null);
  const nearbyLegendId = useId();
  const reasonId = useId();
  const pastedId = useId();
  const [choice, setChoice] = useState<Choice | null>(
    initialMatchUuid ? { kind: "match", uuid: initialMatchUuid } : null,
  );
  const [pasted, setPasted] = useState("");
  const [reason, setReason] = useState("");
  const [closeDuplicate, setCloseDuplicate] = useState(false);

  const dirty = Boolean(reason.trim() || closeDuplicate || pasted.trim());
  useUnsavedWorkGuard(dirty);

  const thisCase = compareCaseFromReport(report);
  const selectedMatch = choice?.kind === "match" ? matches.find((match) => match.uuid === choice.uuid) : undefined;
  const candidate: CompareCase | null = choice?.kind === "search"
    ? choice.selected
    : selectedMatch
      ? compareCaseFromMatch(selectedMatch)
      : null;
  const targetUuid = choice?.kind === "pasted" ? choice.uuid : candidate?.uuid ?? null;
  const errorMessage = duplicateLinkErrorMessage(link.error);
  const stale = link.error instanceof ApiError && link.error.status === 409;
  const canLink = Boolean(targetUuid) && !blockedMessage && report.reviewVersion !== undefined;

  const edit = () => link.reset();
  const choose = (next: Choice | null) => {
    setChoice(next);
    edit();
  };

  const submit = async () => {
    if (!canLink || !targetUuid || report.reviewVersion === undefined) return;
    try {
      await link.mutateAsync({
        canonicalReportUuid: targetUuid,
        reason: reason.trim() || undefined,
        expectedVersion: report.reviewVersion,
        closeDuplicate,
      });
      onLinked({ referenceCode: candidate?.referenceCode ?? null, closed: closeDuplicate });
    } catch {
      return;
    }
  };

  return (
    <Modal
      id="duplicate-compare-modal"
      className="duplicate-compare-modal"
      title="Compare with original case"
      description="Both records stay preserved. Linking only marks this case as a duplicate of the original."
      open
      onClose={onClose}
      initialFocusRef={comparisonRef}
      disabled={link.isPending}
      isDirty={dirty}
      footer={
        <>
          <Button type="button" variant="secondary" disabled={link.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!canLink || link.isPending} onClick={submit}>
            {link.isPending
              ? "Linking case..."
              : candidate
                ? `Link as duplicate of ${candidate.referenceCode}`
                : "Link as duplicate"}
          </Button>
        </>
      }
    >
      {blockedMessage ? (
        <p className="duplicate-compare__blocked" role="status">{blockedMessage}</p>
      ) : null}

      <div ref={comparisonRef} tabIndex={-1} className="duplicate-compare" role="group" aria-label="Side-by-side comparison">
        <CasePane heading="This case" subject={thisCase} against={candidate ?? undefined} />
        {candidate ? (
          <CasePane heading="Original case" subject={candidate} against={thisCase} />
        ) : (
          <section className="duplicate-compare__pane duplicate-compare__pane--empty" aria-label="Original case">
            <p>
              {choice?.kind === "pasted"
                ? "A case reference was entered. Its details are not previewed."
                : "Choose an original case to compare."}
            </p>
          </section>
        )}
      </div>

      <div className="duplicate-compare__choose">
        {matchesPending ? <p className="duplicate-compare__status" role="status">Checking nearby cases...</p> : null}
        {matchesError ? (
          <p className="duplicate-compare__status" role="alert">
            Nearby matches could not be loaded. You can still search for the original case.
          </p>
        ) : null}
        {matches.length > 0 ? (
          <fieldset className="duplicate-compare__nearby" aria-labelledby={nearbyLegendId} disabled={link.isPending}>
            <legend id={nearbyLegendId}>Nearby matches</legend>
            {matches.map((match) => (
              <label key={match.uuid} className="duplicate-compare__nearby-option">
                <input
                  type="radio"
                  name="duplicate-original-case"
                  checked={choice?.kind === "match" && choice.uuid === match.uuid}
                  onChange={() => {
                    setPasted("");
                    choose({ kind: "match", uuid: match.uuid });
                  }}
                />
                <span>
                  <strong>{match.referenceCode}</strong>
                  <small>
                    {Math.round(match.distanceMeters)} m away · {possibleConditionName(match.condition)} · {match.barangay} · {formatDateTime(match.submittedAt)}
                  </small>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}
        <ReportPicker
          excludeUuid={report.uuid}
          value={null}
          onSelect={() => undefined}
          onSelectReport={(selected) => {
            setPasted("");
            choose({ kind: "search", selected: compareCaseFromReport(selected) });
          }}
          disabled={link.isPending}
        />
        {choice?.kind === "search" ? (
          <p className="duplicate-compare__status" role="status">Comparing with {choice.selected.referenceCode} from search.</p>
        ) : null}
        <details className="uuid-fallback">
          <summary>Advanced: paste a case reference</summary>
          <label className="select-filter" htmlFor={pastedId}>
            <span>Case reference</span>
            <input
              id={pastedId}
              value={pasted}
              disabled={link.isPending}
              onChange={(event) => {
                const value = event.target.value;
                setPasted(value);
                choose(value.trim() ? { kind: "pasted", uuid: value.trim() } : null);
              }}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </label>
        </details>
      </div>

      <TextArea
        id={reasonId}
        label="Reason (optional)"
        rows={2}
        maxLength={1000}
        value={reason}
        disabled={link.isPending}
        placeholder="Why is this case treated as a duplicate?"
        onChange={(event) => {
          setReason(event.target.value);
          edit();
        }}
      />
      <label className="case-confirmation duplicate-compare__close">
        <input
          type="checkbox"
          checked={closeDuplicate}
          disabled={link.isPending}
          onChange={(event) => {
            setCloseDuplicate(event.target.checked);
            edit();
          }}
        />
        <span>Also close this duplicate case</span>
      </label>

      {errorMessage ? (
        <div className="duplicate-compare__error" role="alert">
          <p className="form-error">{errorMessage}</p>
          {stale && onRefresh ? (
            <Button type="button" variant="secondary" onClick={() => { link.reset(); onRefresh(); }}>
              Refresh case
            </Button>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

/** Side-by-side comparison and one-click link. Mounts only while open, so each visit starts fresh. */
export function DuplicateCompareModal({ open, ...props }: DuplicateCompareModalProps) {
  return open ? <CompareDialog {...props} /> : null;
}
