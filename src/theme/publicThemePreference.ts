import { z } from "zod";
import {
  DEFAULT_THEME,
  applyTheme,
  getTheme,
  themeValues,
  type Theme,
} from "./themePreference";

/**
 * Appearance memory for the public pages (`/`, `/guide`).
 *
 * The landing page and Field Guide keep their own stored choice, apart from
 * the signed-in workspace theme in `themePreference.ts`. Both areas paint the
 * same `<html data-theme>`, so the rule is: the public area paints its own
 * theme while `PublicLayout` is mounted and hands the document back to the
 * workspace theme when it unmounts. Neither store ever writes the other.
 *
 * Paper is the default and the OS colour scheme is not followed, matching the
 * workspace. Keep the key, version and values in step with the boot script in
 * `index.html`.
 */

export const PUBLIC_THEME_STORAGE_KEY = "caneguard.public.appearance";
export const PUBLIC_THEME_STORAGE_VERSION = 1;

const storedThemeSchema = z.enum(themeValues);

/** Validate one stored payload; anything unreadable falls back to paper. */
export function parsePublicThemePreference(value: unknown): Theme {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_THEME;
  }
  const stored = value as Record<string, unknown>;
  if (stored.version !== PUBLIC_THEME_STORAGE_VERSION) return DEFAULT_THEME;
  const theme = storedThemeSchema.safeParse(stored.theme);
  return theme.success ? theme.data : DEFAULT_THEME;
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readPublicThemePreference(
  storage: Storage | null = browserStorage(),
): Theme {
  if (!storage) return DEFAULT_THEME;
  try {
    const raw = storage.getItem(PUBLIC_THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME;
    return parsePublicThemePreference(JSON.parse(raw));
  } catch {
    return DEFAULT_THEME;
  }
}

export function savePublicThemePreference(
  theme: Theme,
  storage: Storage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      PUBLIC_THEME_STORAGE_KEY,
      JSON.stringify({ version: PUBLIC_THEME_STORAGE_VERSION, theme }),
    );
  } catch {
    // A full or blocked store leaves the page usable without memory.
  }
}

let currentPublicTheme: Theme | null = null;
const listeners = new Set<() => void>();

/** The public theme in force. First call adopts the stored choice. */
export function getPublicTheme(): Theme {
  if (currentPublicTheme === null) currentPublicTheme = readPublicThemePreference();
  return currentPublicTheme;
}

export function subscribeToPublicTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Choose the public theme, remember it and repaint the document at once. */
export function setPublicTheme(theme: Theme): void {
  if (theme === getPublicTheme()) return;
  currentPublicTheme = theme;
  savePublicThemePreference(theme);
  applyTheme(theme);
  for (const listener of listeners) listener();
}

/** Paint the public theme; called when `PublicLayout` mounts. */
export function enterPublicTheme(): void {
  currentPublicTheme = readPublicThemePreference();
  applyTheme(currentPublicTheme);
  for (const listener of listeners) listener();
}

/** Hand the document back to the workspace theme when leaving the public area. */
export function leavePublicTheme(): void {
  applyTheme(getTheme());
}
