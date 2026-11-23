import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { reportsRepository } from "../services/reports.service";
import { reportKeys } from "./reportQueries";

/** Renew well inside the server's five-minute lease. */
export const REVIEW_CLAIM_HEARTBEAT_MS = 60_000;

/**
 * Holds the review lease while a reviewer has the case open. A failed
 * heartbeat is not treated as lost ownership: the server still guards saves.
 * Only a refusal (another reviewer holds it) marks the case read-only.
 */
export function useReviewClaim(reportId: string | undefined, enabled: boolean) {
  const queryClient = useQueryClient();
  const [refused, setRefused] = useState(false);
  const held = useRef(false);
  const wasRefusedRef = useRef(false);

  const claim = useCallback(async (takeover = false) => {
    if (!reportId) return;
    try {
      const granted = await reportsRepository.claimReview(reportId, { takeover });
      const wasRefused = wasRefusedRef.current;
      held.current = granted;
      wasRefusedRef.current = !granted;
      setRefused(!granted);
      // Re-read the case only when ownership changed: to learn who holds it,
      // or to drop a banner once the lease frees up. Plain renewals stay quiet.
      if (!granted || wasRefused) {
        await queryClient.invalidateQueries({ queryKey: reportKeys.detail(reportId), refetchType: "active" });
      }
    } catch {
      // Network failure: keep the current state; the next heartbeat retries.
    }
  }, [reportId, queryClient]);

  useEffect(() => {
    if (!reportId || !enabled) return;
    let cancelled = false;
    // Deferred so the first claim never sets state synchronously in the effect.
    queueMicrotask(() => { if (!cancelled) void claim(); });
    const timer = window.setInterval(() => void claim(), REVIEW_CLAIM_HEARTBEAT_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (held.current) {
        held.current = false;
        void reportsRepository.releaseReview(reportId).catch(() => undefined);
      }
    };
  }, [reportId, enabled, claim]);

  /** Step away on purpose: free the case now, optionally leaving a note. */
  const release = useCallback(async (note?: string) => {
    if (!reportId) return;
    await reportsRepository.releaseReview(reportId, note);
    // Released: the unmount cleanup must not release (or overwrite) again.
    held.current = false;
  }, [reportId]);

  return { refused, takeOver: () => claim(true), release };
}
