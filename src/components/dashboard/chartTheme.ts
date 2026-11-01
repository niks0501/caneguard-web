/**
 * Chart theme bridge for the design spine.
 *
 * Recharts takes literal presentation props, so every colour and text size
 * here is read from `src/styles/tokens.css` at runtime — never hardcoded.
 * The module reads lazily (and caches) so server-side or jsdom renders that
 * have no computed styles still mount; Recharts then falls back to its own
 * defaults instead of receiving an invented palette.
 */

import { kpiBandForIndex, kpiBandFillToken, type KpiBand } from "./kpiBandEncoding";

type TokenName =
  | "--color-brand"
  | "--color-brand-hover"
  | "--color-primary"
  | "--color-primary-dark"
  | "--color-primary-light"
  | "--color-muted"
  | "--color-border-strong"
  | "--color-danger"
  | "--color-text"
  | "--color-secondary-text"
  | "--color-border"
  | "--color-surface"
  | "--color-surface-soft"
  | "--color-surface-tint"
  | "--kpi-band-1"
  | "--kpi-band-2"
  | "--kpi-band-3"
  | "--kpi-band-4"
  | "--radius-md"
  | "--text-body-sm";

export type ChartTokenName = TokenName;

const cache = new Map<string, string>();

/** The appearance the document currently carries; it selects the token block. */
function appliedTheme(): string {
  if (typeof document === "undefined") return "paper";
  return document.documentElement.dataset.theme || "paper";
}

function readToken(name: TokenName): string {
  // Keyed by appearance: the dark block redeclares the same custom property
  // names, so a value cached for paper must never be served to a dark render.
  const key = `${appliedTheme()}:${name}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let value = "";
  if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
    value = window
      .getComputedStyle(window.document.documentElement)
      .getPropertyValue(name)
      .trim();
  }
  cache.set(key, value);
  return value;
}

/** For tests: drop cached token reads so each render starts clean. */
export function resetChartThemeCache(): void {
  cache.clear();
}

export const chartTheme = {
  get brand(): string {
    return readToken("--color-brand");
  },
  get brandHover(): string {
    return readToken("--color-brand-hover");
  },
  get primaryDark(): string {
    return readToken("--color-primary-dark");
  },
  get primaryLight(): string {
    return readToken("--color-primary-light");
  },
  get danger(): string {
    return readToken("--color-danger");
  },
  get muted(): string {
    return readToken("--color-muted");
  },
  get borderStrong(): string {
    return readToken("--color-border-strong");
  },
  get text(): string {
    return readToken("--color-text");
  },
  get secondaryText(): string {
    return readToken("--color-secondary-text");
  },
  get border(): string {
    return readToken("--color-border");
  },
  get surface(): string {
    return readToken("--color-surface");
  },
  /** Axis, tick and legend text: the 16px floor, never the machine scale. */
  get tickFontSize(): number {
    const raw = readToken("--text-body-sm");
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 16;
  },
  /** The tooltip panel's own radius, so it matches every other small panel. */
  get radius(): string {
    return readToken("--radius-md");
  },
};

/**
 * The shared solid band ramp, read as a real colour value for Recharts.
 *
 * Every dashboard series fill resolves through here, so a chart mark and its
 * legend swatch can never disagree about which `--kpi-band-<N>` solid they
 * use. There are no pattern or texture fills left on the dashboard.
 */
export function bandColor(band: KpiBand): string {
  return readToken(kpiBandFillToken(band) as TokenName);
}

/** The band ramp slot for a zero-based series index. */
export function seriesColor(index: number): string {
  return bandColor(kpiBandForIndex(index));
}

/**
 * Tooltip paints, read from the same tokens as the card it floats over.
 *
 * Recharts' default tooltip is a white box with a thin grey border, which on
 * the dark surface leaves the panel white and its text — inherited from the
 * light ink — unreadable. Passing these on every `<Tooltip>` keeps the panel on
 * the surface token and its text on the ink token in both themes. The item text
 * is set to ink rather than the series colour, because a pale band fill is a
 * fill and never a text colour.
 */
export function chartTooltipProps() {
  return {
    contentStyle: {
      background: chartTheme.surface,
      border: `1px solid ${chartTheme.border}`,
      borderRadius: chartTheme.radius,
      color: chartTheme.text,
      fontSize: `${chartTheme.tickFontSize}px`,
    },
    labelStyle: { color: chartTheme.text, fontWeight: 600 },
    itemStyle: { color: chartTheme.text },
  };
}

/** Stable per-barangay fill drawn from the brand family and the paper band ramp. */
const BARANGAY_PALETTE_TOKENS: TokenName[] = [
  "--color-brand",
  "--color-brand-hover",
  "--kpi-band-1",
  "--kpi-band-2",
  "--kpi-band-3",
  "--kpi-band-4",
];

export function barangayColor(index: number): string {
  const token = BARANGAY_PALETTE_TOKENS[index % BARANGAY_PALETTE_TOKENS.length];
  return readToken(token);
}
