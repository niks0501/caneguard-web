import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AUTO_TOUR_PAUSE_MS, useAutoTour } from "./useAutoTour";

type MatchMediaStub = {
  matches: boolean;
  media: string;
  onchange: null;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
};

function stubMatchMedia(matches: boolean): MatchMediaStub {
  const mql: MatchMediaStub = {
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn(() => mql),
  });
  return mql;
}

describe("useAutoTour", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    vi.useFakeTimers();
    stubMatchMedia(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: originalMatchMedia,
    });
  });

  it("auto-advances and wraps around every stepMs when active", () => {
    const { result } = renderHook(() =>
      useAutoTour({ count: 4, stepMs: 4000, initialIndex: 2 }),
    );

    expect(result.current.index).toBe(2);
    expect(result.current.isPaused).toBe(false);
    expect(result.current.secondsRemaining).toBe(0);
    expect(result.current.reducedMotion).toBe(false);

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.index).toBe(3);

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.index).toBe(0);

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.index).toBe(1);
  });

  it("pauses for exactly 25 seconds on manual selection, counts down, and resumes automatically", () => {
    const { result } = renderHook(() =>
      useAutoTour({ count: 7, stepMs: 4200, initialIndex: 0 }),
    );

    act(() => {
      result.current.selectManual(5);
    });

    expect(result.current.index).toBe(5);
    expect(result.current.isPaused).toBe(true);
    expect(result.current.secondsRemaining).toBe(25);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.secondsRemaining).toBe(24);
    expect(result.current.index).toBe(5);

    act(() => {
      vi.advanceTimersByTime(14_000);
    });
    expect(result.current.secondsRemaining).toBe(10);
    expect(result.current.isPaused).toBe(true);
    expect(result.current.index).toBe(5);

    // Just before 25 seconds elapses, still paused and on index 5
    act(() => {
      vi.advanceTimersByTime(9_999);
    });
    expect(result.current.isPaused).toBe(true);
    expect(result.current.secondsRemaining).toBe(1);
    expect(result.current.index).toBe(5);

    // At exactly 25_000 ms, auto-tour resumes
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isPaused).toBe(false);
    expect(result.current.secondsRemaining).toBe(0);
    expect(result.current.index).toBe(5);

    // Next advance occurs stepMs after resume
    act(() => {
      vi.advanceTimersByTime(4200);
    });
    expect(result.current.index).toBe(6);
  });

  it("resets the 25-second pause countdown when a second manual selection happens", () => {
    const { result } = renderHook(() =>
      useAutoTour({ count: 4, stepMs: 5400 }),
    );

    act(() => {
      result.current.selectManual(2);
    });
    expect(result.current.secondsRemaining).toBe(25);

    act(() => {
      vi.advanceTimersByTime(12_000);
    });
    expect(result.current.secondsRemaining).toBe(13);

    act(() => {
      result.current.selectManual(1);
    });
    expect(result.current.index).toBe(1);
    expect(result.current.isPaused).toBe(true);
    expect(result.current.secondsRemaining).toBe(25);

    // 20 seconds later should still be paused (5 seconds left)
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(result.current.isPaused).toBe(true);
    expect(result.current.secondsRemaining).toBe(5);
    expect(result.current.index).toBe(1);

    // Remaining 5 seconds complete the reset pause
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current.isPaused).toBe(false);
    expect(result.current.secondsRemaining).toBe(0);
  });

  it("supports resumeNow() to end the pause immediately", () => {
    const { result } = renderHook(() =>
      useAutoTour({ count: 4, stepMs: 5400, pauseMs: DEFAULT_AUTO_TOUR_PAUSE_MS }),
    );

    act(() => {
      result.current.selectManual(3);
    });
    expect(result.current.isPaused).toBe(true);
    expect(result.current.secondsRemaining).toBe(25);

    act(() => {
      result.current.resumeNow();
    });
    expect(result.current.isPaused).toBe(false);
    expect(result.current.secondsRemaining).toBe(0);

    act(() => {
      vi.advanceTimersByTime(5400);
    });
    expect(result.current.index).toBe(0);
  });

  it("disables auto-advancing under prefers-reduced-motion: reduce while keeping manual selection", () => {
    stubMatchMedia(true);

    const { result } = renderHook(() =>
      useAutoTour({ count: 4, stepMs: 3000, initialIndex: 0 }),
    );

    expect(result.current.reducedMotion).toBe(true);
    expect(result.current.isPaused).toBe(false);
    expect(result.current.secondsRemaining).toBe(0);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current.index).toBe(0);

    act(() => {
      result.current.selectManual(2);
    });
    expect(result.current.index).toBe(2);
    expect(result.current.isPaused).toBe(false);
    expect(result.current.secondsRemaining).toBe(0);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current.index).toBe(2);
  });

  it("guards safely when window.matchMedia is absent in jsdom", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: undefined,
    });

    const { result } = renderHook(() =>
      useAutoTour({ count: 3, stepMs: 2000 }),
    );

    expect(result.current.reducedMotion).toBe(false);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.index).toBe(1);
  });

  it("cleans up all active timers and media listeners on unmount", () => {
    const mql = stubMatchMedia(false);
    const { result, unmount } = renderHook(() =>
      useAutoTour({ count: 4, stepMs: 4000 }),
    );

    act(() => {
      result.current.selectManual(1);
    });
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    expect(mql.removeEventListener).toHaveBeenCalledTimes(1);
  });
});
