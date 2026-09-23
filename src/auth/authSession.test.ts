import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasAuthSessionHint, setAuthSessionHint } from "./authSession";

function clearSessionHints() {
  window.localStorage.clear();
  document.cookie = "XSRF-TOKEN=; Max-Age=0; path=/";
}

beforeEach(clearSessionHints);
afterEach(clearSessionHints);

describe("auth session hints", () => {
  it("does not suggest a session when no hint or CSRF cookie exists", () => {
    expect(hasAuthSessionHint()).toBe(false);
  });

  it("recognizes an existing Sanctum CSRF cookie", () => {
    document.cookie = "XSRF-TOKEN=existing-session; path=/";

    expect(hasAuthSessionHint()).toBe(true);
  });

  it("lets a logged-out marker override a stale CSRF cookie", () => {
    document.cookie = "XSRF-TOKEN=stale-session; path=/";
    setAuthSessionHint(false);

    expect(hasAuthSessionHint()).toBe(false);
  });

  it("keeps a successful login available for session restoration", () => {
    setAuthSessionHint(true);

    expect(hasAuthSessionHint()).toBe(true);
  });
});
