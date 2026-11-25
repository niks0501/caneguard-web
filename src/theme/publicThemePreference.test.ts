import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PUBLIC_THEME_STORAGE_KEY,
  enterPublicTheme,
  getPublicTheme,
  leavePublicTheme,
  parsePublicThemePreference,
  readPublicThemePreference,
  savePublicThemePreference,
  setPublicTheme,
} from "./publicThemePreference";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  getTheme,
  saveThemePreference,
  setTheme,
} from "./themePreference";

function stored(value: unknown): Storage {
  const store = new Map<string, string>([[PUBLIC_THEME_STORAGE_KEY, JSON.stringify(value)]]);
  return { getItem: (key: string) => store.get(key) ?? null } as unknown as Storage;
}

beforeEach(() => {
  window.localStorage.clear();
  setTheme("paper");
  enterPublicTheme();
  setPublicTheme("paper");
  applyTheme("paper");
});

afterEach(() => {
  window.localStorage.clear();
});

describe("parsePublicThemePreference", () => {
  it("falls back to paper for anything it cannot validate", () => {
    expect(parsePublicThemePreference(null)).toBe("paper");
    expect(parsePublicThemePreference([])).toBe("paper");
    expect(parsePublicThemePreference({ version: 2, theme: "dark" })).toBe("paper");
    expect(parsePublicThemePreference({ version: 1, theme: "sepia" })).toBe("paper");
  });

  it("accepts a valid version 1 payload", () => {
    expect(parsePublicThemePreference({ version: 1, theme: "dark" })).toBe("dark");
  });
});

describe("public theme storage", () => {
  it("reads a stored choice and tolerates blocked or corrupt storage", () => {
    expect(readPublicThemePreference(stored({ version: 1, theme: "dark" }))).toBe("dark");
    expect(readPublicThemePreference(null)).toBe("paper");
    const corrupt = { getItem: () => "{not json" } as unknown as Storage;
    expect(readPublicThemePreference(corrupt)).toBe("paper");
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(readPublicThemePreference(throwing)).toBe("paper");
    expect(() => savePublicThemePreference("dark", throwing)).not.toThrow();
  });
});

describe("independence from the workspace theme", () => {
  it("choosing dark on the public pages writes only the public key", () => {
    saveThemePreference("paper");
    const workspaceBefore = window.localStorage.getItem(THEME_STORAGE_KEY);

    setPublicTheme("dark");

    expect(window.localStorage.getItem(PUBLIC_THEME_STORAGE_KEY)).toBe(
      JSON.stringify({ version: 1, theme: "dark" }),
    );
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(workspaceBefore);
    expect(getTheme()).toBe("paper");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("hands the document back to the workspace theme on leaving", () => {
    setPublicTheme("dark");
    leavePublicTheme();
    expect(document.documentElement.dataset.theme).toBe("paper");

    enterPublicTheme();
    expect(getPublicTheme()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("choosing dark in the workspace does not change the public theme", () => {
    setTheme("dark");
    expect(window.localStorage.getItem(PUBLIC_THEME_STORAGE_KEY)).toBeNull();
    enterPublicTheme();
    expect(getPublicTheme()).toBe("paper");
    expect(document.documentElement.dataset.theme).toBe("paper");
    leavePublicTheme();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
