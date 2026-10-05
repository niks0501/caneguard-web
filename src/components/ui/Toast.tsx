import { useEffect, useRef } from "react";
import { CheckCircle2, X } from "lucide-react";

const DEFAULT_DISMISS_MS = 8000;

export interface ToastProps {
  message: string;
  onDismiss: () => void;
  autoDismissMs?: number;
}

/**
 * Floating success message for a save that keeps the reviewer on the case.
 * It sits above the page instead of pushing content down, and clears itself
 * so it never needs dismissing to keep reading.
 */
export function Toast({
  message,
  onDismiss,
  autoDismissMs = DEFAULT_DISMISS_MS,
}: ToastProps) {
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (autoDismissMs <= 0) return;
    const timer = window.setTimeout(() => onDismissRef.current(), autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [autoDismissMs, message]);

  return (
    <div className="review-toast" role="status">
      <CheckCircle2 aria-hidden="true" />
      <span>{message}</span>
      <button
        type="button"
        className="review-toast__dismiss"
        aria-label="Dismiss saved message"
        onClick={onDismiss}
      >
        <X aria-hidden="true" />
      </button>
    </div>
  );
}
