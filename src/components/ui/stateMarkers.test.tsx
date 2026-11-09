import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppErrorFallback } from "../../app/AppErrorBoundary";
import { EmptyState, ErrorState, LoadingState, NoResultsState } from "./States";

// Proves intent: stable data-state / data-error-kind markers on loading, empty,
// filter, error and error-boundary surfaces, without copy-based inference.
describe("agent state markers", () => {
  it("marks each list state panel", () => {
    const { rerender } = render(<LoadingState />);
    expect(screen.getByRole("status")).toHaveAttribute("data-state", "loading");
    rerender(<EmptyState />);
    expect(screen.getByRole("status")).toHaveAttribute("data-state", "empty");
    rerender(<NoResultsState onClear={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveAttribute("data-state", "no-results");
  });

  it("marks errors with a closed-vocabulary kind", () => {
    const { rerender } = render(<ErrorState kind="rate-limited" />);
    expect(screen.getByRole("alert")).toHaveAttribute("data-state", "error");
    expect(screen.getByRole("alert")).toHaveAttribute("data-error-kind", "rate-limited");
    rerender(<ErrorState />);
    expect(screen.getByRole("alert")).toHaveAttribute("data-error-kind", "unavailable");
  });

  it("marks the render error fallback", () => {
    render(<AppErrorFallback />);
    expect(screen.getByRole("alert")).toHaveAttribute("data-state", "error");
    expect(screen.getByRole("alert")).toHaveAttribute("data-error-kind", "render");
  });
});
