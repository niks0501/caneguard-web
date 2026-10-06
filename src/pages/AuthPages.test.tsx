import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/server";

const baseUrl = "http://localhost:8000";

async function renderAuthPage(path: string) {
  vi.stubEnv("VITE_DATA_SOURCE", "api");
  server.use(
    http.get(`${baseUrl}/api/v1/me`, () =>
      HttpResponse.json(
        { message: "Unauthenticated.", code: "UNAUTHENTICATED" },
        { status: 401 },
      ),
    ),
  );
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

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("public authentication pages", () => {
  it("keeps farmer registration hidden even when the retired client flag is enabled", async () => {
    vi.stubEnv("VITE_CANEGUARD_SELF_REGISTRATION_ENABLED", "true");
    let called = false;
    server.use(http.post(`${baseUrl}/register`, () => {
      called = true;
      return HttpResponse.json({ code: "REGISTRATION_DISABLED" }, { status: 403 });
    }));
    await renderAuthPage("/register");
    expect(await screen.findByRole("heading", { name: "Sign in to review field reports" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/login");
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create an account" })).not.toBeInTheDocument();
    expect(called).toBe(false);
  });

  it("does not expose registration when public self-registration is disabled", async () => {
    vi.stubEnv("VITE_CANEGUARD_SELF_REGISTRATION_ENABLED", "false");
    await renderAuthPage("/register");

    expect(
      await screen.findByRole("heading", { name: "Sign in to review field reports" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/login");
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create an account" })).not.toBeInTheDocument();
  });

  it("keeps forgot-password feedback generic", async () => {
    server.use(
      http.get(`${baseUrl}/sanctum/csrf-cookie`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
      http.post(`${baseUrl}/forgot-password`, () =>
        HttpResponse.json(
          {
            message: "If an account matches, a password recovery link will be sent.",
            code: "PASSWORD_RESET_LINK_SENT",
          },
          { status: 202 },
        ),
      ),
    );
    const user = await renderAuthPage("/forgot-password");

    await user.type(screen.getByLabelText("Email"), "unknown@example.test");
    await user.click(screen.getByRole("button", { name: "Send recovery link" }));

    expect(await screen.findByText("Check your email.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "If an account matches, a password recovery link will be sent. The link expires in one hour.",
      ),
    ).toBeInTheDocument();
  });

  it("verifies an email link through the Laravel endpoint", async () => {
    server.use(
      http.get(`${baseUrl}/email/verify/42/email-hash`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("expires")).toBe("9999999999");
        expect(url.searchParams.get("signature")).toBe("signature");
        return HttpResponse.json({
          message: "Email address verified.",
          code: "EMAIL_VERIFIED",
        });
      }),
    );
    await renderAuthPage(
      "/verify-email?id=42&hash=email-hash&expires=9999999999&signature=signature",
    );

    expect(await screen.findByText("Your email is verified.")).toBeInTheDocument();
  });

  it("resets a password without logging in", async () => {
    let requestBody: Record<string, unknown> | undefined;
    server.use(
      http.get(`${baseUrl}/sanctum/csrf-cookie`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
      http.post(`${baseUrl}/reset-password`, async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          message: "Password updated.",
          code: "PASSWORD_RESET",
        });
      }),
    );
    const user = await renderAuthPage(
      "/reset-password?email=reviewer%40example.test&token=one-time-token",
    );

    await user.type(screen.getByLabelText("New password"), "A replacement passphrase");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "A replacement passphrase",
    );
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByText("Password updated.")).toBeInTheDocument();
    expect(requestBody).toEqual({
      email: "reviewer@example.test",
      token: "one-time-token",
      password: "A replacement passphrase",
      password_confirmation: "A replacement passphrase",
    });
  });
});
