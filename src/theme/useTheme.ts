import { useSyncExternalStore } from "react";
import { getTheme, subscribeToTheme, type Theme } from "./themePreference";

/**
 * The theme in force, re-rendering its caller when the operator changes it.
 *
 * CSS custom properties follow `<html data-theme>` on their own; this hook is
 * for the few surfaces that take literal colours in JavaScript — Recharts
 * props and MapLibre paint expressions — and have to repaint.
 */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribeToTheme, getTheme, getTheme);
}
