import { useCallback, useEffect, useState } from "react";

export const DEFAULT_AUTO_TOUR_PAUSE_MS = 25_000;

export interface UseAutoTourOptions {
  /** Number of items to cycle through. */
  count: number;
  /** Interval in milliseconds between automatic steps while active. */
  stepMs: number;
  /** Duration in milliseconds to pause after manual selection (default 25s). */
  pauseMs?: number;
  /** Starting item index (default 0). */
  initialIndex?: number;
}

export interface UseAutoTourResult {
  index: number;
  isPaused: boolean;
  secondsRemaining: number;
  reducedMotion: boolean;
  selectManual: (nextIndex: number) => void;
  resumeNow: () => void;
}

interface PauseState {
  until: number;
  token: number;
}

function normalizeIndex(value: number, count: number): number {
  if (count <= 0) return 0;
  return ((value % count) + count) % count;
}

function readReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Synchronized auto-advancing tour hook for public learning blocks.
 *
 * Advances `(index + 1) % count` every `stepMs` while active. Calling
 * `selectManual(nextIndex)` switches immediately and pauses auto-advancing for
 * `pauseMs` (25 seconds by default) with a 1-second countdown before resuming
 * automatically. Disables auto-advancing under `prefers-reduced-motion: reduce`.
 */
export function useAutoTour({
  count,
  stepMs,
  pauseMs = DEFAULT_AUTO_TOUR_PAUSE_MS,
  initialIndex = 0,
}: UseAutoTourOptions): UseAutoTourResult {
  const [index, setIndex] = useState<number>(() =>
    normalizeIndex(initialIndex, count),
  );
  const [reducedMotion, setReducedMotion] = useState<boolean>(readReducedMotion);
  const [pauseState, setPauseState] = useState<PauseState | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);

  const isPaused = !reducedMotion && pauseState !== null;

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
      if (event.matches) {
        setPauseState(null);
        setSecondsRemaining(0);
      }
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (reducedMotion || pauseState === null) {
      return undefined;
    }

    const remainingMs = Math.max(0, pauseState.until - Date.now());

    const resumeTimeout = window.setTimeout(() => {
      setPauseState(null);
      setSecondsRemaining(0);
    }, remainingMs);

    const tickInterval = window.setInterval(() => {
      const leftSeconds = Math.max(
        0,
        Math.ceil((pauseState.until - Date.now()) / 1000),
      );
      setSecondsRemaining(leftSeconds);
    }, 1000);

    return () => {
      window.clearTimeout(resumeTimeout);
      window.clearInterval(tickInterval);
    };
  }, [reducedMotion, pauseState]);

  useEffect(() => {
    if (reducedMotion || isPaused || count <= 1 || stepMs <= 0) {
      return undefined;
    }

    const advanceInterval = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % count);
    }, stepMs);

    return () => {
      window.clearInterval(advanceInterval);
    };
  }, [reducedMotion, isPaused, count, stepMs]);

  const selectManual = useCallback(
    (nextIndex: number) => {
      setIndex(normalizeIndex(nextIndex, count));

      if (reducedMotion || count <= 1 || pauseMs <= 0) {
        setPauseState(null);
        setSecondsRemaining(0);
        return;
      }

      const until = Date.now() + pauseMs;
      setPauseState((prev) => ({
        until,
        token: (prev?.token ?? 0) + 1,
      }));
      setSecondsRemaining(Math.ceil(pauseMs / 1000));
    },
    [count, pauseMs, reducedMotion],
  );

  const resumeNow = useCallback(() => {
    setPauseState(null);
    setSecondsRemaining(0);
  }, []);

  return {
    index: normalizeIndex(index, count),
    isPaused,
    secondsRemaining: isPaused ? secondsRemaining : 0,
    reducedMotion,
    selectManual,
    resumeNow,
  };
}
