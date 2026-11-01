import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  THEME_STORAGE_VERSION,
  applyTheme,
  getTheme,
  initializeTheme,
  parseThemePreference,
  readThemePreference,
  saveThemePreference,
  setTheme,
  subscribeToTheme,
} from "./themePreference";

/** Small deterministic storage double, so reads are testable without jsdom. */
function memoryStorage(seed?: string): Storage {
  const store = new Map<string, string>();
  if (seed !== undefined) store.set(THEME_STORAGE_KEY, seed);
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  } as Storage;
}

function storedPayload(value: unknown): string {
  return JSON.stringify(value);
}

afterEach(() => {
  // The store keeps the last chosen theme for the life of the module, so put
  // the workspace back on paper between cases.
  setTheme(DEFAULT_THEME);
  applyTheme(DEFAULT_THEME);
  window.localStorage.clear();
});

describe("parseThemePreference", () => {
  it("defaults to paper for anything it cannot validate", () => {
    expect(DEFAULT_THEME).toBe("paper");
    expect(parseThemePreference(null)).toBe("paper");
    expect(parseThemePreference("dark")).toBe("paper");
    expect(parseThemePreference([])).toBe("paper");
    expect(parseThemePreference({})).toBe("paper");
    expect(
      parseThemePreference({ version: THEME_STORAGE_VERSION, theme: "sepia" }),
    ).toBe("paper");
  });

  it("rejects a payload from another version instead of guessing", () => {
    expect(
      parseThemePreference({ version: THEME_STORAGE_VERSION + 1, theme: "dark" }),
    ).toBe("paper");
    expect(
      parseThemePreference({ version: undefined, theme: "dark" }),
    ).toBe("paper");
  });

  it("restores the stored dark choice", () => {
    expect(
      parseThemePreference({ version: THEME_STORAGE_VERSION, theme: "dark" }),
    ).toBe("dark");
  });
});

describe("readThemePreference", () => {
  it("reads a valid payload and ignores a corrupt one", () => {
    expect(
      readThemePreference(
        memoryStorage(storedPayload({ version: THEME_STORAGE_VERSION, theme: "dark" })),
      ),
    ).toBe("dark");

    expect(readThemePreference(memoryStorage("{not json"))).toBe("paper");
    expect(readThemePreference(memoryStorage("null"))).toBe("paper");
    expect(readThemePreference(memoryStorage())).toBe("paper");
    expect(readThemePreference(null)).toBe("paper");
  });

  it("survives a store that refuses reads", () => {
    const throwing = {
      ...memoryStorage(),
      getItem: () => {
        throw new Error("blocked");
      },
    } as Storage;
    expect(readThemePreference(throwing)).toBe("paper");
  });
});

describe("saveThemePreference", () => {
  it("writes a versioned payload the reader accepts", () => {
    const storage = memoryStorage();
    saveThemePreference("dark", storage);

    expect(
      JSON.parse(storage.getItem(THEME_STORAGE_KEY) as string),
    ).toEqual({ version: THEME_STORAGE_VERSION, theme: "dark" });
    expect(readThemePreference(storage)).toBe("dark");
  });

  it("swallows a store that refuses writes", () => {
    const throwing = {
      ...memoryStorage(),
      setItem: () => {
        throw new Error("quota");
      },
    } as Storage;
    expect(() => saveThemePreference("dark", throwing)).not.toThrow();
  });
});

describe("applied theme", () => {
  it("names the theme on the document element", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyTheme("paper");
    expect(document.documentElement.dataset.theme).toBe("paper");
  });

  it("adopts the stored theme and repaints subscribers on a change", () => {
    saveThemePreference("dark");
    initializeTheme();
    expect(getTheme()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    const listener = vi.fn();
    const unsubscribe = subscribeToTheme(listener);
    setTheme("paper");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.theme).toBe("paper");
    expect(readThemePreference()).toBe("paper");

    unsubscribe();
    setTheme("dark");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not repaint when the same theme is chosen twice", () => {
    applyTheme("paper");
    const listener = vi.fn();
    const unsubscribe = subscribeToTheme(listener);
    setTheme("paper");
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });
});
