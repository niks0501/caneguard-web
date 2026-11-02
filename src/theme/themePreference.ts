import { z } from "zod";

/**
 * Appearance memory (QF-11).
 *
 * The operator's theme is a stored preference, not a per-page control: it is
 * versioned so a later palette migrates instead of discarding the choice, and
 * every read is validated, so a truncated, hand-edited or stale payload falls
 * back to the paper default rather than leaving the workspace without a theme.
 *
 * Paper is the default because the printed report is the record, and dark is
 * an explicit choice for screen work. The dark tokens themselves only exist
 * inside `@media screen` (`src/styles/tokens.css`), so printing stays on paper
 * without any per-page work.
 *
 * The applied theme lives on `<html data-theme>`; this module also owns the
 * small store that lets components re-render when the theme changes, because
 * Recharts and MapLibre take literal colours at render time instead of CSS
 * custom properties.
 */

export const THEME_STORAGE_KEY = "caneguard.appearance.preferences";
export const THEME_STORAGE_VERSION = 1;

export const themeValues = ["paper", "dark"] as const;
export type Theme = (typeof themeValues)[number];

export const DEFAULT_THEME: Theme = "paper";

const storedThemeSchema = z.enum(themeValues);

/**
 * Validate one stored payload. The version gate comes first: an unreadable
 * version is the migration seam, where a future release converts an older
 * shape instead of guessing at it.
 */
export function parseThemePreference(value: unknown): Theme {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_THEME;
  }
  const stored = value as Record<string, unknown>;
  if (stored.version !== THEME_STORAGE_VERSION) return DEFAULT_THEME;
  const theme = storedThemeSchema.safeParse(stored.theme);
  return theme.success ? theme.data : DEFAULT_THEME;
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Blocked storage is not a page failure: the workspace still renders and
    // simply forgets the choice between visits.
    return null;
  }
}

export function readThemePreference(
  storage: Storage | null = browserStorage(),
): Theme {
  if (!storage) return DEFAULT_THEME;

  let raw: string | null;
  try {
    raw = storage.getItem(THEME_STORAGE_KEY);
  } catch {
    return DEFAULT_THEME;
  }
  if (!raw) return DEFAULT_THEME;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return DEFAULT_THEME;
  }
  return parseThemePreference(value);
}

export function saveThemePreference(
  theme: Theme,
  storage: Storage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ version: THEME_STORAGE_VERSION, theme }),
    );
  } catch {
    // A full or blocked store leaves the workspace usable without memory.
  }
}

function documentRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.documentElement;
}

/** Paint one theme by naming it on `<html>`; every token block keys off it. */
export function applyTheme(
  theme: Theme,
  root: HTMLElement | null = documentRoot(),
): void {
  if (!root) return;
  root.dataset.theme = theme;
}

let currentTheme: Theme | null = null;
const listeners = new Set<() => void>();

/** The theme in force. First call adopts the stored choice. */
export function getTheme(): Theme {
  if (currentTheme === null) currentTheme = readThemePreference();
  return currentTheme;
}

export function subscribeToTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function commitTheme(theme: Theme): void {
  currentTheme = theme;
  saveThemePreference(theme);
  // Applying before notifying matters: the subscribers re-render and read the
  // new token block, so the document must already name it.
  applyTheme(theme);
  for (const listener of listeners) listener();
}

/** Choose a theme for this browser and repaint immediately. */
export function setTheme(theme: Theme): void {
  if (theme === getTheme()) return;
  commitTheme(theme);
}

/**
 * Adopt the stored theme before the first paint (called from `main.tsx`). The
 * paper default is already in the stylesheet, so a first visit costs nothing.
 */
export function initializeTheme(): Theme {
  const theme = readThemePreference();
  if (theme !== currentTheme) {
    currentTheme = theme;
    applyTheme(theme);
  }
  return theme;
}
