import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { ApiError } from "../api/ApiError";
import { server } from "../test/server";
import {
  getCurrentUser,
  loginRequest,
  logoutRequest,
  WebRoleError,
} from "./auth.api";

const baseUrl = "http://localhost:8000";

describe("auth API", () => {
  it("requests a CSRF cookie before submitting credentials", async () => {
    const requests: string[] = [];
    server.use(
      http.get(`${baseUrl}/sanctum/csrf-cookie`, () => {
        requests.push("csrf");
        return new HttpResponse(null, { status: 204 });
      }),
      http.post(`${baseUrl}/login`, async ({ request }) => {
        requests.push("login");
        expect(await request.json()).toEqual({
          email: "reviewer@example.test",
          password: "secret",
        });
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await loginRequest({
      email: "reviewer@example.test",
      password: "secret",
    });

    expect(requests).toEqual(["csrf", "login"]);
  });

  it("refreshes the CSRF cookie once and retries login after a 419", async () => {
    const requests: string[] = [];
    let loginAttempts = 0;
    server.use(
      http.get(`${baseUrl}/sanctum/csrf-cookie`, () => {
        requests.push("csrf");
        return new HttpResponse(null, { status: 204 });
      }),
      http.post(`${baseUrl}/login`, () => {
        requests.push("login");
        loginAttempts += 1;
        return loginAttempts === 1
          ? HttpResponse.json({ message: "CSRF token mismatch." }, { status: 419 })
          : new HttpResponse(null, { status: 204 });
      }),
    );

    await loginRequest({ email: "reviewer@example.test", password: "secret" });

    expect(requests).toEqual(["csrf", "login", "csrf", "login"]);
  });

  it("surfaces a second consecutive 419 without retrying again", async () => {
    let loginAttempts = 0;
    server.use(
      http.get(`${baseUrl}/sanctum/csrf-cookie`, () => new HttpResponse(null, { status: 204 })),
      http.post(`${baseUrl}/login`, () => {
        loginAttempts += 1;
        return HttpResponse.json({ message: "CSRF token mismatch." }, { status: 419 });
      }),
    );

    await expect(
      loginRequest({ email: "reviewer@example.test", password: "secret" }),
    ).rejects.toMatchObject({ status: 419 });
    expect(loginAttempts).toBe(2);
  });

  it("loads only reviewer or admin web users", async () => {
    server.use(
      http.get(`${baseUrl}/api/v1/me`, () =>
        HttpResponse.json({
          data: {
            uuid: "user-1",
            name: "Review User",
            email: "reviewer@example.test",
            role: "reviewer",
          },
        }),
      ),
    );

    await expect(getCurrentUser()).resolves.toEqual({
      uuid: "user-1",
      name: "Review User",
      email: "reviewer@example.test",
      role: "reviewer",
      is_active: true,
    });
  });

  it("rejects disabled identities rather than creating an authenticated redirect loop", async () => {
    server.use(http.get(`${baseUrl}/api/v1/me`, () => HttpResponse.json({
      data: { uuid: "user-1", name: "Review User", email: "reviewer@example.test", role: "reviewer", is_active: false },
    })));
    await expect(getCurrentUser()).rejects.toMatchObject({ status: 401, code: "ACCOUNT_DISABLED" });
  });

  it("rejects a field reporter returned during restoration", async () => {
    server.use(
      http.get(`${baseUrl}/api/v1/me`, () =>
        HttpResponse.json({
          data: {
            uuid: "user-2",
            name: "Field User",
            email: "field@example.test",
            role: "field_reporter",
          },
        }),
      ),
    );

    await expect(getCurrentUser()).rejects.toBeInstanceOf(WebRoleError);
  });

  it("surfaces invalid login and calls server logout", async () => {
    let loggedOut = false;
    server.use(
      http.get(`${baseUrl}/sanctum/csrf-cookie`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
      http.post(`${baseUrl}/login`, () =>
        HttpResponse.json(
          {
            message: "The provided credentials are invalid.",
            code: "INVALID_CREDENTIALS",
          },
          { status: 422 },
        ),
      ),
      http.post(`${baseUrl}/logout`, () => {
        loggedOut = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const request = loginRequest({
      email: "reviewer@example.test",
      password: "wrong",
    });
    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.toMatchObject({
      status: 422,
      code: "INVALID_CREDENTIALS",
    });
    await logoutRequest();
    expect(loggedOut).toBe(true);
  });
});
