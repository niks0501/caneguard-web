import { useTheme } from "./useTheme";

/**
 * Map paint bridge for the dark choice (QF-11).
 *
 * MapLibre paint expressions and layer props take literal colours and cannot
 * read CSS custom properties, so every map colour is read from
 * `src/styles/tokens.css` here at render time. The reader subscribes to the
 * theme, which matters because a token read happens once per render: the
 * palette is recomputed whenever the operator switches appearance.
 *
 * The fallbacks are the paper values, used only where no computed style
 * exists (jsdom renders, server-side mounts). They are deliberately the same
 * literals the components shipped with, not a second palette.
 *
 * The glyph inside a pin is always `--color-surface`: on paper that is white
 * on ink and on the amber note, and on the dark set it is the dark surface on
 * the light ink and on the amber note, so one rule keeps both themes legible.
 */
export interface MapPaint {
  /** Case pin and cluster fill: ink. */
  ink: string;
  /** Note pin fill: a case a person should look at first. */
  note: string;
  /** Glyph and count label inside a pin or cluster. */
  onPin: string;
  /** Halo around pins and clusters, so neighbours stay separate. */
  halo: string;
  /** Place labels drawn on the basemap. */
  label: string;
  boundaryFill: string;
  boundaryLine: string;
  boundarySelected: string;
}

type PaintToken =
  | "--color-text"
  | "--color-warning"
  | "--color-surface"
  | "--color-primary"
  | "--color-primary-dark"
  | "--color-accent-dark";

const FALLBACKS: Record<PaintToken, string> = {
  "--color-text": "#1d2720",
  "--color-warning": "#8a4a06",
  "--color-surface": "#ffffff",
  "--color-primary": "#2d6b40",
  "--color-primary-dark": "#1e452a",
  "--color-accent-dark": "#b8ad73",
};

function readToken(name: PaintToken): string {
  if (typeof window === "undefined" || typeof window.getComputedStyle !== "function") {
    return FALLBACKS[name];
  }
  const value = window
    .getComputedStyle(window.document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || FALLBACKS[name];
}

export function readMapPaint(): MapPaint {
  return {
    ink: readToken("--color-text"),
    note: readToken("--color-warning"),
    onPin: readToken("--color-surface"),
    halo: readToken("--color-surface"),
    label: readToken("--color-text"),
    boundaryFill: readToken("--color-primary"),
    boundaryLine: readToken("--color-primary-dark"),
    boundarySelected: readToken("--color-accent-dark"),
  };
}

export function useMapPaint(): MapPaint {
  // The hook call is what repaints: it subscribes this map to the appearance
  // choice, and the token reads below are cheap (nine computed-style reads) and
  // only run on a render that already had to happen.
  useTheme();
  return readMapPaint();
}
