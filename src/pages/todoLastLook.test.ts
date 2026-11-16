import { beforeEach, describe, expect, it } from "vitest";
import {
  TODO_LAST_LOOK_STORAGE_KEY,
  isNewSinceLastLook,
  readTodoLastLook,
  saveTodoLastLook,
} from "./todoLastLook";

describe("todoLastLook", () => {
  beforeEach(() => window.localStorage.clear());

  it("remembers the last look per viewer", () => {
    saveTodoLastLook("a", 1000);
    saveTodoLastLook("b", 2000);
    expect(readTodoLastLook("a")).toBe(1000);
    expect(readTodoLastLook("b")).toBe(2000);
    expect(readTodoLastLook("c")).toBeNull();
  });

  it("falls back to no previous look for corrupt or stale values", () => {
    for (const raw of ["{not json", "[]", JSON.stringify({ version: 99, viewers: { a: 1 } }), JSON.stringify({ version: 1, viewers: { a: "x" } })]) {
      window.localStorage.setItem(TODO_LAST_LOOK_STORAGE_KEY, raw);
      expect(readTodoLastLook("a")).toBeNull();
    }
  });

  it("marks only cases submitted after the last look, and none on a first visit", () => {
    const lastLook = Date.parse("2026-09-02T00:00:00Z");
    expect(isNewSinceLastLook("2026-09-03T00:00:00Z", lastLook)).toBe(true);
    expect(isNewSinceLastLook("2026-09-01T00:00:00Z", lastLook)).toBe(false);
    expect(isNewSinceLastLook("2026-09-03T00:00:00Z", null)).toBe(false);
    expect(isNewSinceLastLook("garbage", lastLook)).toBe(false);
  });
});
