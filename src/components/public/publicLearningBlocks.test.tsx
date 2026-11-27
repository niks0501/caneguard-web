import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnatomyExplorer } from "./AnatomyExplorer";
import { GrowthStepper } from "./GrowthStepper";
import { PhotoQuiz } from "./PhotoQuiz";

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn(() => ({
      matches,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("PR-3 living learning blocks", () => {
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

  describe("AnatomyExplorer", () => {
    it("auto-tours synchronized pills, SVG zones, reticle, and caption, then pauses 25s on manual click", () => {
      const { container } = render(
        <MemoryRouter>
          <AnatomyExplorer />
        </MemoryRouter>,
      );

      expect(screen.getByText("Auto-tour active")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Lower leaves (underside)" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        container.querySelector('[data-focus-zone="lower"]'),
      ).not.toBeNull();
      expect(
        container.querySelector('[data-zone="lower"]'),
      ).toHaveAttribute("data-active", "true");

      // Auto-advance after 4200ms moves from lower (index 3) to stalk (index 4)
      act(() => {
        vi.advanceTimersByTime(4200);
      });
      expect(
        screen.getByRole("button", { name: "Stalk and internodes" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        container.querySelector('[data-focus-zone="stalk"]'),
      ).not.toBeNull();

      // Clicking a pill immediately switches and starts exact 25s pause
      fireEvent.click(screen.getByRole("button", { name: "Growing point" }));
      expect(
        screen.getByRole("button", { name: "Growing point" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByText(/spindle at the top/)).toBeInTheDocument();
      expect(screen.getByText("Paused · resumes in 25s")).toBeInTheDocument();

      // Countdown ticks down without auto-advancing
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(screen.getByText("Paused · resumes in 15s")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Growing point" }),
      ).toHaveAttribute("aria-pressed", "true");

      // Clicking an SVG zone also switches and resets the 25s pause
      const rootsZone = container.querySelector('[data-zone="roots"]');
      expect(rootsZone).not.toBeNull();
      fireEvent.click(rootsZone!);
      expect(
        screen.getByRole("button", { name: "Roots and stool" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByText("Paused · resumes in 25s")).toBeInTheDocument();

      // Still paused at 24_999ms
      act(() => {
        vi.advanceTimersByTime(24_999);
      });
      expect(screen.getByText("Paused · resumes in 1s")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Roots and stool" }),
      ).toHaveAttribute("aria-pressed", "true");

      // Resumes at exactly 25_000ms
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByText("Auto-tour active")).toBeInTheDocument();

      // Advances 4200ms after resume (wraps from index 6 roots -> index 0 top)
      act(() => {
        vi.advanceTimersByTime(4200);
      });
      expect(
        screen.getByRole("button", { name: "Growing point" }),
      ).toHaveAttribute("aria-pressed", "true");
    });

    it("supports Resume now button and respects prefers-reduced-motion", () => {
      const { unmount } = render(
        <MemoryRouter>
          <AnatomyExplorer />
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Leaf sheath" }));
      expect(screen.getByText("Paused · resumes in 25s")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Resume now" }));
      expect(screen.getByText("Auto-tour active")).toBeInTheDocument();

      unmount();

      // Now render under prefers-reduced-motion: reduce
      stubMatchMedia(true);
      render(
        <MemoryRouter>
          <AnatomyExplorer />
        </MemoryRouter>,
      );

      expect(
        screen.getByText("Manual mode · reduced motion"),
      ).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(20_000);
      });
      expect(
        screen.getByRole("button", { name: "Lower leaves (underside)" }),
      ).toHaveAttribute("aria-pressed", "true");

      fireEvent.click(screen.getByRole("button", { name: "Node and bud" }));
      expect(
        screen.getByRole("button", { name: "Node and bud" }),
      ).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("GrowthStepper", () => {
    it("switches all 4 botanical phenology stages, telemetry, progress rail, and 25s pause/resume", () => {
      const { container } = render(
        <MemoryRouter>
          <GrowthStepper />
        </MemoryRouter>,
      );

      const railFill = container.querySelector(
        ".pub-growth__rail-fill",
      ) as HTMLElement;
      const svg = container.querySelector(".pub-phenology__svg") as SVGElement;

      // Stage 1: Germination
      expect(screen.getByText("Auto-cycling stages")).toBeInTheDocument();
      expect(svg).toHaveAttribute("data-active-stage", "germination");
      expect(railFill.style.width).toBe("25%");
      expect(screen.getByText("0.15 – 0.35 m")).toBeInTheDocument();
      expect(screen.getByText("Fine temporary sett roots")).toBeInTheDocument();

      // Auto-advance after 5400ms -> Stage 2: Tillering
      act(() => {
        vi.advanceTimersByTime(5400);
      });
      expect(svg).toHaveAttribute("data-active-stage", "tillering");
      expect(railFill.style.width).toBe("50%");
      expect(screen.getByText("0.6 – 1.2 m")).toBeInTheDocument();
      expect(
        screen.getByText("Thick permanent shoot roots"),
      ).toBeInTheDocument();

      // Manual select Stage 3: Grand growth
      fireEvent.click(screen.getByRole("button", { name: /3\. Grand growth/ }));
      expect(svg).toHaveAttribute("data-active-stage", "grand-growth");
      expect(railFill.style.width).toBe("75%");
      expect(screen.getByText("2.0 – 3.0 m")).toBeInTheDocument();
      expect(
        screen.getByText("Deep 1–2 m peak root zone"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/the stage where rust and RSSI/),
      ).toBeInTheDocument();
      expect(screen.getByText("Paused · resumes in 25s")).toBeInTheDocument();

      // Manual select Stage 4: Maturity and harvest
      fireEvent.click(
        screen.getByRole("button", { name: /4\. Maturity and harvest/ }),
      );
      expect(svg).toHaveAttribute("data-active-stage", "maturity");
      expect(railFill.style.width).toBe("100%");
      expect(screen.getByText("2.8 – 3.5 m")).toBeInTheDocument();
      expect(
        screen.getByText("Ratoon-ready underground stool"),
      ).toBeInTheDocument();
      expect(
        container.querySelector('[data-stage-layer="maturity"]'),
      ).toHaveClass("pub-pheno__layer--active");

      // After 25s pause completes + 5400ms step, wraps back to Stage 1
      act(() => {
        vi.advanceTimersByTime(25_000);
      });
      expect(screen.getByText("Auto-cycling stages")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(5400);
      });
      expect(svg).toHaveAttribute("data-active-stage", "germination");
      expect(railFill.style.width).toBe("25%");
    });

    it("disables auto-cycling under prefers-reduced-motion: reduce", () => {
      stubMatchMedia(true);
      const { container } = render(
        <MemoryRouter>
          <GrowthStepper />
        </MemoryRouter>,
      );

      const svg = container.querySelector(".pub-phenology__svg") as SVGElement;
      expect(
        screen.getByText("Manual mode · reduced motion"),
      ).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      expect(svg).toHaveAttribute("data-active-stage", "germination");

      fireEvent.click(screen.getByRole("button", { name: /2\. Tillering/ }));
      expect(svg).toHaveAttribute("data-active-stage", "tillering");
    });
  });

  describe("PhotoQuiz", () => {
    it("renders spoiler-free RSSI button without (pest) and updates frosted score badge", () => {
      const { container } = render(
        <MemoryRouter>
          <PhotoQuiz />
        </MemoryRouter>,
      );

      expect(container.querySelector(".pub-quiz.pub-glass--strong")).not.toBeNull();
      expect(screen.getByRole("button", { name: "RSSI" })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /pest/i }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/\(pest\)/i)).not.toBeInTheDocument();
      expect(screen.getByText("Ready to score")).toBeInTheDocument();

      // Answer first question (Healthy) correctly
      fireEvent.click(screen.getByRole("button", { name: "Healthy" }));
      expect(screen.getByText("Correct.")).toBeInTheDocument();
      expect(screen.getByText("1 of 1 correct")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Read the Healthy guide" }),
      ).toHaveAttribute("href", "/guide/healthy");

      // Advance to second question (Mosaic) and answer wrongly with RSSI
      fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
      fireEvent.click(screen.getByRole("button", { name: "RSSI" }));
      expect(
        screen.getByText(/Not quite\. It is Mosaic\./),
      ).toBeInTheDocument();
      expect(screen.getByText("1 of 2 correct")).toBeInTheDocument();
    });
  });
});
