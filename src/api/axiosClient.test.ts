import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../test/server";
import { ApiError } from "./ApiError";
import { createAxiosClient } from "./axiosClient";

describe("createAxiosClient", () => {
  it("sets the Laravel API defaults", () => {
    const client = createAxiosClient({ apiBaseUrl: "https://api.test" });

    expect(client.defaults.baseURL).toBe("https://api.test");
    expect(client.defaults.withCredentials).toBe(true);
    expect(client.defaults.withXSRFToken).toBe(true);
    expect(client.defaults.headers.common.Accept).toBe("application/json");
  });

  it("normalizes Laravel validation errors", async () => {
    server.use(
      http.get("https://api.test/api/v1/reports", () =>
        HttpResponse.json(
          {
            message: "The given data was invalid.",
            code: "VALIDATION_ERROR",
            errors: { status: ["The selected status is invalid."] },
          },
          { status: 422 },
        ),
      ),
    );
    const client = createAxiosClient({ apiBaseUrl: "https://api.test" });

    const request = client.get("/api/v1/reports");

    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      code: "VALIDATION_ERROR",
      errors: { status: ["The selected status is invalid."] },
    });
  });
});
