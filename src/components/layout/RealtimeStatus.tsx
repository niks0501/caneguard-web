import { Radio } from "lucide-react";
import type { RealtimeStatus as RealtimeConnectionStatus } from "../../hooks/useRealtimeInvalidation";

export function RealtimeStatus({
  status,
}: {
  status: RealtimeConnectionStatus;
}) {
  if (status === "disabled") return null;

  const connected = status === "connected";
  const label = connected
    ? "Live updates connected"
    : "Live updates unavailable - refresh mode active";

  return (
    <span
      className={`realtime-status realtime-status--${connected ? "connected" : "degraded"}`}
      role="status"
      aria-label={label}
      aria-live="polite"
    >
      <Radio aria-hidden="true" />
      <span>{connected ? "Live updates" : "Refresh mode"}</span>
    </span>
  );
}
