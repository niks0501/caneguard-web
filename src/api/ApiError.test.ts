import { AxiosError } from "axios";
import { describe, expect, it } from "vitest";
import { ApiError, isApiConnectionError, toApiError } from "./ApiError";

describe("isApiConnectionError", () => {
  it("identifies raw or wrapped Axios failures with no HTTP response", () => {
    const networkError = new AxiosError("Network Error");

    expect(isApiConnectionError(networkError)).toBe(true);
    expect(isApiConnectionError(toApiError(networkError))).toBe(true);
  });

  it("does not confuse HTTP or application errors with connection failures", () => {
    expect(isApiConnectionError(new ApiError("Unavailable", { status: 503 }))).toBe(false);
    expect(isApiConnectionError(new Error("Unexpected failure"))).toBe(false);
  });
});
