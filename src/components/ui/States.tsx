import { AlertTriangle, FileQuestion, ImageOff, LoaderCircle, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";

interface StateProps {
  title: string;
  message: string;
  action?: ReactNode;
}

function StatePanel({
  icon,
  title,
  message,
  action,
}: StateProps & { icon: ReactNode }) {
  return (
    <div className="state-panel" role="status">
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
    />
  );
}

export function EmptyState() {
  return (
    <StatePanel
      icon={<FileQuestion aria-hidden="true" />}
      title="No submitted reports yet"
      message="New synchronized field observations will appear in this work queue."
    />
  );
}

export function NoResultsState({ onClear }: { onClear: () => void }) {
  return (
    <StatePanel
      icon={<SearchX aria-hidden="true" />}
      title="No reports match these filters"
      message="Try another keyword or clear the filters to view the full work queue."
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
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <StatePanel
      icon={<AlertTriangle aria-hidden="true" />}
      title="Something went wrong"
      message={message}
      action={
        onRetry ? (
          <Button type="button" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    />
  );
}

export function ImagePendingState({ status }: { status: "pending_sync" | "unavailable" }) {
  const pending = status === "pending_sync";
  return (
    <div className="image-state">
      <ImageOff aria-hidden="true" />
      <strong>{pending ? "Image pending sync" : "Image unavailable"}</strong>
      <span>
        {pending
          ? "The field device has not finished uploading this evidence."
          : "No submitted image is available for this report."}
      </span>
    </div>
  );
}
