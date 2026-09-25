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
  | "--disease-healthy"
  | "--disease-mosaic"
  | "--disease-rust"
  | "--disease-smut"
  | "--kpi-band-1"
  | "--kpi-band-2"
  | "--kpi-band-3"
  | "--kpi-band-4"
  | "--text-body-sm";

export type ChartTokenName = TokenName;

const cache = new Map<TokenName, string>();

function readToken(name: TokenName): string {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;

  let value = "";
  if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
    value = window
      .getComputedStyle(window.document.documentElement)
      .getPropertyValue(name)
      .trim();
  }
  cache.set(name, value);
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

/** Possible-Condition colours stay the token set, keyed by condition. */
export function conditionColor(condition: string): string {
  switch (condition) {
    case "healthy":
      return readToken("--disease-healthy");
    case "mosaic":
      return readToken("--disease-mosaic");
    case "rust":
      return readToken("--disease-rust");
    case "smut":
      return readToken("--disease-smut");
    default:
      return readToken("--color-brand");
  }
}

/** Stable per-barangay fill drawn from the brand family and condition set. */
const BARANGAY_PALETTE_TOKENS: TokenName[] = [
  "--color-brand",
  "--color-brand-hover",
  "--disease-mosaic",
  "--disease-rust",
  "--disease-smut",
  "--disease-healthy",
];

export function barangayColor(index: number): string {
  const token = BARANGAY_PALETTE_TOKENS[index % BARANGAY_PALETTE_TOKENS.length];
  return readToken(token);
}
