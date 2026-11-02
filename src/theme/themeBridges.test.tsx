import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  chartTheme,
  chartTooltipProps,
  resetChartThemeCache,
} from "../components/dashboard/chartTheme";
import { useMapPaint } from "./mapTheme";
import { applyTheme, setTheme } from "./themePreference";

/**
 * The chart and map bridges (QF-11) cannot read CSS custom properties, so they
 * read the tokens at render time instead. These cases stand a token block up on
 * `<html>` the way `[data-theme="dark"]` does and assert the bridges follow the
 * appearance choice — including that a colour cached for paper is never served
 * to a dark render.
 */
const PAPER_TOKENS: Record<string, string> = {
  "--color-text": "#1d2720",
  "--color-surface": "#ffffff",
  "--color-warning": "#8a4a06",
  "--color-primary": "#2d6b40",
  "--color-primary-dark": "#1e452a",
  "--color-accent-dark": "#b8ad73",
};

const DARK_TOKENS: Record<string, string> = {
  "--color-text": "#ede9df",
  "--color-surface": "#20241f",
  "--color-warning": "#e9c46a",
  "--color-primary": "#b9dcc0",
  "--color-primary-dark": "#b9dcc0",
  "--color-accent-dark": "#b8ad73",
};

function seedTokens(tokens: Record<string, string>) {
  for (const [name, value] of Object.entries(tokens)) {
    document.documentElement.style.setProperty(name, value);
  }
}

function clearTokens() {
  for (const name of Object.keys(PAPER_TOKENS)) {
    document.documentElement.style.removeProperty(name);
  }
}

function PaintProbe() {
  const paint = useMapPaint();
  return (
    <dl>
      <dd data-testid="pin-ink">{paint.ink}</dd>
      <dd data-testid="pin-note">{paint.note}</dd>
      <dd data-testid="pin-glyph">{paint.onPin}</dd>
    </dl>
  );
}

afterEach(() => {
  act(() => setTheme("paper"));
  applyTheme("paper");
  clearTokens();
  resetChartThemeCache();
  window.localStorage.clear();
});

describe("chart theme bridge", () => {
  it("serves dark chart colours after an appearance change, never the paper cache", () => {
    seedTokens(PAPER_TOKENS);
    expect(chartTheme.text).toBe(PAPER_TOKENS["--color-text"]);
    expect(chartTheme.surface).toBe(PAPER_TOKENS["--color-surface"]);

    act(() => setTheme("dark"));
    seedTokens(DARK_TOKENS);

    expect(chartTheme.text).toBe(DARK_TOKENS["--color-text"]);
    expect(chartTheme.surface).toBe(DARK_TOKENS["--color-surface"]);
    // The tooltip panel rides the same tokens, so it stops being a white box.
    expect(chartTooltipProps().contentStyle.background).toBe(
      DARK_TOKENS["--color-surface"],
    );
    expect(chartTooltipProps().itemStyle.color).toBe(DARK_TOKENS["--color-text"]);

    act(() => setTheme("paper"));
    seedTokens(PAPER_TOKENS);
    expect(chartTheme.text).toBe(PAPER_TOKENS["--color-text"]);
  });
});

describe("map paint bridge", () => {
  it("repaints pins from the dark tokens when the operator picks dark", () => {
    seedTokens(PAPER_TOKENS);
    render(<PaintProbe />);
    expect(screen.getByTestId("pin-ink")).toHaveTextContent(
      PAPER_TOKENS["--color-text"],
    );

    act(() => {
      setTheme("dark");
      seedTokens(DARK_TOKENS);
    });

    expect(screen.getByTestId("pin-ink")).toHaveTextContent(
      DARK_TOKENS["--color-text"],
    );
    expect(screen.getByTestId("pin-note")).toHaveTextContent(
      DARK_TOKENS["--color-warning"],
    );
    // The glyph inside a pin stays on the surface token, so it keeps contrast
    // against the pale ink in dark exactly as it did against ink on paper.
    expect(screen.getByTestId("pin-glyph")).toHaveTextContent(
      DARK_TOKENS["--color-surface"],
    );
  });
});
