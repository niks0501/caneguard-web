import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { paginatedReportsDto } from "../test/fixtures";
import { server } from "../test/server";
import { setAuthSessionHint } from "./authSession";

const baseUrl = "http://localhost:8000";
const healthyApiResponse = {
  data: {
    status: "ok",
    checks: { database: "ready", storage: "ready" },
  },
};
const webUser = {
  uuid: "user-1",
  name: "Review User",
  email: "reviewer@example.test",
  role: "reviewer",
};

function installApiHealthHandler() {
  server.use(
    http.get(`${baseUrl}/api/health`, () =>
      HttpResponse.json(healthyApiResponse),
    ),
    http.get(`${baseUrl}/api/v1/notifications`, () =>
      HttpResponse.json({
        data: [],
        meta: { unread_count: 0, returned_count: 0 },
      }),
    ),
  );
}

async function renderApp(
  path: string,
  options: { sessionHint?: boolean | null } = {},
) {
  if (options.sessionHint === null) {
    window.localStorage.clear();
  } else {
    setAuthSessionHint(options.sessionHint ?? true);
  }
  vi.stubEnv("VITE_DATA_SOURCE", "api");
  installApiHealthHandler();
  window.history.pushState({}, "", path);
  const [{ AppProviders }, { default: App }] = await Promise.all([
    import("../app/AppProviders"),
    import("../App"),
  ]);
  const user = userEvent.setup();

  render(
    <AppProviders>
      <App />
    </AppProviders>,
  );

  return user;
}

function useSuccessfulLoginHandlers() {
  server.use(
    http.get(`${baseUrl}/sanctum/csrf-cookie`, () =>
      new HttpResponse(null, { status: 204 }),
    ),
    http.post(`${baseUrl}/login`, () =>
      new HttpResponse(null, { status: 204 }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  window.localStorage.clear();
  document.cookie = "XSRF-TOKEN=; Max-Age=0; path=/";
});

describe("authenticated routing", () => {
  it("does not request /me on boot without a session hint or CSRF cookie", async () => {
    let meRequestCount = 0;
    server.use(
      http.get(`${baseUrl}/api/v1/me`, () => {
        meRequestCount += 1;
        return HttpResponse.json(
          { message: "Unauthenticated.", code: "UNAUTHENTICATED" },
          { status: 401 },
        );
      }),
    );

    await renderApp("/reports", { sessionHint: null });

    expect(
      await screen.findByRole("heading", {
        name: "Sign in to review field reports",
      }),
    ).toBeInTheDocument();
    expect(meRequestCount).toBe(0);
  });

  it("redirects a protected route and restores the full destination after login", async () => {
    let meRequestCount = 0;
    server.use(
      http.get(`${baseUrl}/api/v1/me`, () => {
        meRequestCount += 1;
        return meRequestCount === 1
          ? HttpResponse.json(
              { message: "Unauthenticated.", code: "UNAUTHENTICATED" },
              { status: 401 },
            )
          : HttpResponse.json({ data: webUser });
      }),
      http.get(`${baseUrl}/api/v1/reports`, () =>
        HttpResponse.json(paginatedReportsDto),
      ),
    );
    useSuccessfulLoginHandlers();
    const user = await renderApp("/reports?status=submitted_unverified");

    expect(
      await screen.findByRole("heading", {
        name: "Sign in to review field reports",
      }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Email"), webUser.email);
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByRole("heading", { name: "Recent submissions" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/reports");
    expect(window.location.search).toBe("?status=submitted_unverified");
  });

  it("restores an existing session after a browser refresh", async () => {
    server.use(
      http.get(`${baseUrl}/api/v1/me`, () =>
        HttpResponse.json({ data: webUser }),
      ),
      http.get(`${baseUrl}/api/v1/reports`, () =>
        HttpResponse.json(paginatedReportsDto),
      ),
    );
    document.cookie = "XSRF-TOKEN=existing-session; path=/";

    await renderApp("/reports", { sessionHint: null });

    expect(
      await screen.findByRole("link", { name: "Open CG-2026-0001" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("status", {
        name: "Connectivity: Network Available; CaneGuard server Connected",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Review User")).toHaveTextContent("RU");
  });

  it("does not treat a restoration network failure as confirmed logout", async () => {
    server.use(
      http.get(`${baseUrl}/api/v1/me`, () => HttpResponse.error()),
    );

    await renderApp("/reports");

    expect(
      await screen.findByText(/You have not been logged out/),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/reports");
  });

  it("blocks a non-web role during session restoration", async () => {
    server.use(
      http.get(`${baseUrl}/api/v1/me`, () =>
        HttpResponse.json({
          data: {
            ...webUser,
            role: "field_reporter",
          },
        }),
      ),
    );

    await renderApp("/reports");

    expect(
      await screen.findByText(
        "This account is not authorized for the SRA Don Pedro Web workspace. Ask your district office administrator to request office access from the CaneGuard operator.",
      ),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/login");
  });

  it.each([401, 419])(
    "redirects once with an expiration notice when an API session returns %s",
    async (status) => {
      server.use(
        http.get(`${baseUrl}/api/v1/me`, () =>
          HttpResponse.json({ data: webUser }),
        ),
        http.get(`${baseUrl}/api/v1/reports`, () =>
          HttpResponse.json(
            { message: "Unauthenticated.", code: "UNAUTHENTICATED" },
            { status },
          ),
        ),
      );

      await renderApp("/reports");

      expect(
        await screen.findByText(
          "Your session expired. Sign in again to continue where you left off.",
        ),
      ).toBeInTheDocument();
      expect(window.location.pathname).toBe("/login");
      expect(
        screen.getAllByText(
          "Your session expired. Sign in again to continue where you left off.",
        ),
      ).toHaveLength(1);
    },
  );

  it("shows invalid credentials and logs out through Laravel", async () => {
    let logoutCalled = false;
    let authenticated = false;
    server.use(
      http.get(`${baseUrl}/api/v1/me`, () =>
        authenticated
          ? HttpResponse.json({ data: webUser })
          : HttpResponse.json(
              { message: "Unauthenticated.", code: "UNAUTHENTICATED" },
              { status: 401 },
            ),
      ),
      http.get(`${baseUrl}/sanctum/csrf-cookie`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
      http.post(`${baseUrl}/login`, async ({ request }) => {
        const body = (await request.json()) as { password?: string };
        if (body.password !== "secret") {
          return HttpResponse.json(
            {
              message: "The provided credentials are invalid.",
              code: "INVALID_CREDENTIALS",
            },
            { status: 422 },
          );
        }
        authenticated = true;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(`${baseUrl}/api/v1/reports`, () =>
        HttpResponse.json(paginatedReportsDto),
      ),
      http.post(`${baseUrl}/logout`, () => {
        authenticated = false;
        logoutCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = await renderApp("/reports");

    await screen.findByRole("heading", {
      name: "Sign in to review field reports",
    });
    await user.type(screen.getByLabelText("Email"), webUser.email);
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(
      await screen.findByText("The email or password is incorrect."),
    ).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Password"));
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByRole("link", { name: "Open CG-2026-0001" });
    await user.click(screen.getByRole("button", { name: /Sign out/ }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Sign out?" })).getByRole("button", {
        name: "Sign out",
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Sign in to review field reports",
      }),
    ).toBeInTheDocument();
    expect(logoutCalled).toBe(true);
  });

  it("asks before signing out and keeps the session when cancelled", async () => {
    let logoutCalled = false;
    server.use(
      http.get(`${baseUrl}/api/v1/me`, () => HttpResponse.json({ data: webUser })),
      http.get(`${baseUrl}/api/v1/reports`, () =>
        HttpResponse.json(paginatedReportsDto),
      ),
      http.post(`${baseUrl}/logout`, () => {
        logoutCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = await renderApp("/reports");

    await screen.findByRole("link", { name: "Open CG-2026-0001" });
    await user.click(screen.getByRole("button", { name: /Sign out/ }));
    const dialog = await screen.findByRole("dialog", { name: "Sign out?" });
    expect(logoutCalled).toBe(false);

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(logoutCalled).toBe(false);
    expect(window.location.pathname).toBe("/reports");
  });

  it("explains login throttling without reporting a false outage", async () => {
    server.use(
      http.get(`${baseUrl}/api/v1/me`, () =>
        HttpResponse.json(
          { message: "Unauthenticated.", code: "UNAUTHENTICATED" },
          { status: 401 },
        ),
      ),
      http.get(`${baseUrl}/sanctum/csrf-cookie`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
      http.post(`${baseUrl}/login`, () =>
        HttpResponse.json(
          { message: "Too many requests.", code: "RATE_LIMITED" },
          { status: 429 },
        ),
      ),
    );
    const user = await renderApp("/reports");

    await screen.findByRole("heading", {
      name: "Sign in to review field reports",
    });
    await user.type(screen.getByLabelText("Email"), webUser.email);
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText(
        "Too many sign-in attempts. Wait a minute before trying again.",
      ),
    ).toBeInTheDocument();
  });

  it("blocks in a retry state when server logout is unconfirmed", async () => {
    server.use(
      http.get(`${baseUrl}/api/v1/me`, () =>
        HttpResponse.json({ data: webUser }),
      ),
      http.get(`${baseUrl}/api/v1/reports`, () =>
        HttpResponse.json(paginatedReportsDto),
      ),
      http.post(`${baseUrl}/logout`, () => HttpResponse.error()),
    );
    const user = await renderApp("/reports");

    await screen.findByRole("link", { name: "Open CG-2026-0001" });
    await user.click(screen.getByRole("button", { name: /Sign out/ }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Sign out?" })).getByRole("button", {
        name: "Sign out",
      }),
    );

    expect(
      await screen.findByText(/You have not been logged out/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry sign out" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/reports");
  });
});
