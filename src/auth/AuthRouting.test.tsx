import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { paginatedReportsDto } from "../test/fixtures";
import { server } from "../test/server";

const baseUrl = "http://localhost:8000";
const webUser = {
  uuid: "user-1",
  name: "Review User",
  email: "reviewer@example.test",
  role: "reviewer",
};

async function renderApp(path: string) {
  vi.stubEnv("VITE_DATA_SOURCE", "api");
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
});

describe("authenticated routing", () => {
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

    await renderApp("/reports");

    expect(
      await screen.findByRole("link", { name: "Open CG-2026-0001" }),
    ).toBeInTheDocument();
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
        "This account is not authorized for the municipal web workspace.",
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

    expect(
      await screen.findByRole("heading", {
        name: "Sign in to review field reports",
      }),
    ).toBeInTheDocument();
    expect(logoutCalled).toBe(true);
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

    expect(
      await screen.findByText(/You have not been logged out/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry sign out" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/reports");
  });
});
