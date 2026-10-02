import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";

function CrashingPage(): never {
  throw new Error("render failed");
}

describe("AppErrorBoundary", () => {
  it("shows a readable fallback instead of leaving the application blank", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <AppErrorBoundary>
        <CrashingPage />
      </AppErrorBoundary>,
    );

    expect(
      screen.getByRole("heading", { name: "CaneGuard could not display this page" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Refresh the page to try again.");
    vi.restoreAllMocks();
  });
});
