import { AlertTriangle, FileQuestion, ImageOff, LoaderCircle, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";

interface StateProps {
  title: string;
  message: string;
  action?: ReactNode;
  role?: "status" | "alert";
  /** Stable agent marker for the panel's state; never carries identifiers. */
  state: "loading" | "empty" | "no-results" | "error";
  errorKind?: ErrorKind;
}

/** Closed vocabulary for `data-error-kind`; extend here, never with free text. */
export type ErrorKind =
  | "invalid-query"
  | "access-denied"
  | "not-found"
  | "malformed-data"
  | "unreachable"
  | "rate-limited"
  | "unavailable"
  | "session-unavailable"
  | "render";

function StatePanel({
  icon,
  title,
  message,
  action,
  role = "status",
  state,
  errorKind,
}: StateProps & { icon: ReactNode }) {
  return (
    <div
      className="state-panel"
      role={role}
      data-state={state}
      data-error-kind={errorKind}
    >
      <div className="state-panel__icon">{icon}</div>
      <h2>{title}</h2>
      <p>{message}</p>
      {action}
    </div>
  );
}

export function LoadingState({ message = "Loading submitted reports..." }) {
  return (
    <StatePanel
      icon={<LoaderCircle className="spin" aria-hidden="true" />}
      title="Loading"
      message={message}
      state="loading"
    />
  );
}

/**
 * Per-card loading placeholder for the analytical dashboard's progressive
 * loading (overhaul §4). Decorative: the section carries aria-busy while
 * skeletons are visible, so screen readers are not spammed per card.
 */
export function Skeleton({ label = "Loading…" }: { label?: string }) {
  return <div className="skeleton" aria-hidden="true" title={label} />;
}

export function EmptyState({ title = "No submitted reports yet", message = "New synchronized field observations will appear in this work queue." }: { title?: string; message?: string } = {}) {
  return (
    <StatePanel
      icon={<FileQuestion aria-hidden="true" />}
      title={title}
      message={message}
      state="empty"
    />
  );
}

export function NoResultsState({
  onClear,
  scopeLabel,
}: {
  onClear: () => void;
  /** Names the queue the list is scoped to, so the empty state says where it looked. */
  scopeLabel?: string;
}) {
  return (
    <StatePanel
      icon={<SearchX aria-hidden="true" />}
      title={scopeLabel ? `Nothing in ${scopeLabel}` : "No reports match these filters"}
      message={scopeLabel
        ? "No report matches this queue and the filters set. Clear the filters to leave the queue."
        : "Try another keyword or clear the filters to view the full work queue."}
      state="no-results"
      action={
        <Button type="button" variant="secondary" onClick={onClear}>
          Clear filters
        </Button>
      }
    />
  );
}

export function ErrorState({
  message = "The reports could not be loaded. Please try again.",
  onRetry,
  detail,
  kind = "unavailable",
}: {
  kind?: ErrorKind;
  message?: string;
  onRetry?: () => void;
  /** Developer detail, kept out of the staff-facing message. */
  detail?: string;
}) {
  return (
    <StatePanel
      icon={<AlertTriangle aria-hidden="true" />}
      title="Something went wrong"
      message={message}
      role="alert"
      state="error"
      errorKind={kind}
      action={
        <>
          {onRetry ? (
            <Button type="button" variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
          {detail ? (
            <details className="state-panel__detail">
              <summary>Technical details</summary>
              <p>{detail}</p>
            </details>
          ) : null}
        </>
      }
    />
  );
}

export function ImagePendingState({ status }: { status: "pending_sync" | "unavailable" }) {
  const pending = status === "pending_sync";
  return (
    <div className="image-state">
      <ImageOff aria-hidden="true" />
      <strong>{pending ? "Photo not yet available" : "Photo unavailable"}</strong>
      <span>
        {pending
          ? "The field device has not finished sending this photo."
          : "No submitted photo is available for this report."}
      </span>
    </div>
  );
}
