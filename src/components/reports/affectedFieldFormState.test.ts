import { describe, expect, it } from "vitest";
import { affectedFieldFormState } from "./affectedFieldFormState";

const clean = { saved: false, online: true, conflict: false, saving: false, failed: false, dirty: false };

describe("affectedFieldFormState", () => {
  it("names every state of the affected-boundary form", () => {
    expect(affectedFieldFormState(clean)).toBe("idle");
    expect(affectedFieldFormState({ ...clean, dirty: true })).toBe("dirty");
    expect(affectedFieldFormState({ ...clean, dirty: true, saving: true })).toBe("saving");
    expect(affectedFieldFormState({ ...clean, saved: true })).toBe("saved");
    expect(affectedFieldFormState({ ...clean, dirty: true, online: false })).toBe("offline");
    expect(affectedFieldFormState({ ...clean, dirty: true, conflict: true, failed: true })).toBe("conflict");
    expect(affectedFieldFormState({ ...clean, dirty: true, failed: true })).toBe("error");
  });

  it("does not call a clean form offline", () => {
    expect(affectedFieldFormState({ ...clean, online: false })).toBe("idle");
  });
});
