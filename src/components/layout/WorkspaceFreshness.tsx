import { formatClockTimeWithSeconds } from "../../lib/formatters";

/**
 * One quiet freshness line per workspace. The stamp is when this browser last
 * read the server in 12-hour Asia/Manila time, never a mobile device's own
 * unsent draft. A failed refresh keeps the previous stamp and says so.
 */
export function WorkspaceFreshness({
  updatedAt,
  fetching = false,
  refreshFailed = false,
  onRetry,
  label = "Last updated",
}: {
  updatedAt: number | undefined;
  fetching?: boolean;
  refreshFailed?: boolean;
  onRetry?: () => void;
  label?: string;
}) {
  if (!updatedAt) return null;
  const stamp = formatClockTimeWithSeconds(updatedAt);

  return (
    <p className="workspace-freshness">
      <span className="workspace-freshness__label">
        {refreshFailed ? "Showing data from" : label}
      </span>
      <time dateTime={new Date(updatedAt).toISOString()}>{stamp}</time>
      <span className="sr-only">, read from the server. Unsent field-device drafts are not included.</span>
      {fetching ? <span className="workspace-freshness__state">Updating…</span> : null}
      {refreshFailed && onRetry ? (
        <button type="button" className="table-action" onClick={onRetry}>Retry</button>
      ) : null}
    </p>
  );
}
