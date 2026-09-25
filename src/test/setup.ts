import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./server";

// Keep test defaults independent from a developer's ignored .env.local.
// Individual mock-mode tests can still override this with vi.stubEnv.
vi.stubEnv("VITE_DATA_SOURCE", "api");

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  // Dashboard controls (scope, map layer) and the auth hint persist in local
  // storage, so one test's choice must never leak into the next.
  window.localStorage.clear();
});
afterAll(() => server.close());
