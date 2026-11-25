import { useSyncExternalStore } from "react";
import { getPublicTheme, subscribeToPublicTheme } from "./publicThemePreference";
import type { Theme } from "./themePreference";

/** The public pages' theme, re-rendering its caller when the visitor changes it. */
export function usePublicTheme(): Theme {
  return useSyncExternalStore(subscribeToPublicTheme, getPublicTheme, getPublicTheme);
}
