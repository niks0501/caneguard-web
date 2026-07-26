import { describe, expect, it } from "vitest";
import { ApiError } from "../api/ApiError";
import {
  isTransientServerError,
  shouldRetryQuery,
} from "./queryClient";

describe("query retry policy", () => {
  it("retries a transient GET failure exactly once", () => {
    const unavailable = new ApiError("Unavailable", { status: 503 });

    expect(shouldRetryQuery(0, unavailable)).toBe(true);
    expect(shouldRetryQuery(1, unavailable)).toBe(false);
  });

  it("does not retry authorization, validation, rate-limit, or data errors", () => {
    expect(shouldRetryQuery(0, new ApiError("Forbidden", { status: 403 }))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError("Invalid", { status: 422 }))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError("Slow down", { status: 429 }))).toBe(false);
    expect(shouldRetryQuery(0, new Error("Malformed payload"))).toBe(false);
  });

  it("treats network and server responses as unavailable", () => {
    expect(isTransientServerError(new ApiError("Network error"))).toBe(true);
    expect(
      isTransientServerError(new ApiError("Server error", { status: 500 })),
    ).toBe(true);
    expect(
      isTransientServerError(new ApiError("Not found", { status: 404 })),
    ).toBe(false);
  });
});
