import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./server";

// Keep test defaults independent from a developer's ignored .env.local.
// Individual mock-mode tests can still override this with vi.stubEnv.
vi.stubEnv("VITE_DATA_SOURCE", "api");

// jsdom does not implement scrolling; the public pages scroll to a section or
// to the top on navigation, so give them a harmless no-op.
window.scrollTo = () => undefined;
Element.prototype.scrollIntoView = () => undefined;

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  // Dashboard controls (scope, map layer) and the auth hint persist in local
  // storage, so one test's choice must never leak into the next.
  window.localStorage.clear();
});
afterAll(() => server.close());
