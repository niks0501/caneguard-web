import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/server";

const baseUrl = "http://localhost:8000";

async function renderAuthPage(path: string) {
  vi.stubEnv("VITE_DATA_SOURCE", "api");
  server.use(
    http.get(`${baseUrl}/api/v1/access-configuration`, () =>
      HttpResponse.json({ data: {
        staff_approver: { label: "To be assigned", placeholder: true },
        pilot_district: { label: "To be assigned", placeholder: true },
        district_enforcement: false,
      } }),
    ),
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
  it("registers a farmer without accepting a client role when explicitly enabled", async () => {
    vi.stubEnv("VITE_CANEGUARD_SELF_REGISTRATION_ENABLED", "true");
    let requestBody: Record<string, unknown> | undefined;
    server.use(
      http.get(`${baseUrl}/sanctum/csrf-cookie`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
      http.post(`${baseUrl}/register`, async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            message: "Account created.",
            code: "REGISTRATION_CREATED",
            user: {
              uuid: "user-1",
              name: "Field Reporter",
              email: "field@example.test",
              role: "farmer",
              email_verified: false,
            },
          },
          { status: 201 },
        );
      }),
    );
    const user = await renderAuthPage("/register");

    await user.type(screen.getByLabelText("Name"), "Field Reporter");
    await user.type(screen.getByLabelText("Email"), "field@example.test");
    await user.type(screen.getByLabelText("Password"), "A field reporter passphrase");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "A field reporter passphrase",
    );
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Account created.")).toBeInTheDocument();
    expect(requestBody).toEqual({
      name: "Field Reporter",
      email: "field@example.test",
      password: "A field reporter passphrase",
      password_confirmation: "A field reporter passphrase",
    });
    expect(requestBody).not.toHaveProperty("role");
    expect(screen.getByText(/Verification does not grant staff access/)).toBeInTheDocument();
    expect(screen.getByText("To be assigned (APPROVER_TBD)")).toBeInTheDocument();
    expect(screen.getByText("To be assigned (DISTRICT_TBD)")).toBeInTheDocument();
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

  it("accepts only the issued invitation with current credentials even when registration is disabled", async () => {
    vi.stubEnv("VITE_CANEGUARD_SELF_REGISTRATION_ENABLED", "false");
    const token = "a".repeat(64);
    let requestBody: unknown;
    server.use(
      http.get(`${baseUrl}/sanctum/csrf-cookie`, () => new HttpResponse(null, { status: 204 })),
      http.post(`${baseUrl}/staff/invitations/accept`, async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ message: "Certified.", code: "STAFF_CERTIFIED" });
      }),
    );
    const user = await renderAuthPage(`/accept-staff-invitation#${token}`);
    expect(window.location.hash).toBe("");
    expect(screen.getByLabelText("Invitation code")).toHaveValue(token);
    expect(await screen.findByText("To be assigned (APPROVER_TBD)")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Verified email"), "staff@example.test");
    await user.type(screen.getByLabelText("Current password"), "A verified staff passphrase");
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByText("Staff account certified. Sign in again to use your approved access.")).toBeInTheDocument();
    expect(requestBody).toEqual({ token, email: "staff@example.test", current_password: "A verified staff passphrase" });
  });

  it("keeps invitation denial actionable and preserves entered credentials", async () => {
    server.use(
      http.get(`${baseUrl}/sanctum/csrf-cookie`, () => new HttpResponse(null, { status: 204 })),
      http.post(`${baseUrl}/staff/invitations/accept`, () =>
        HttpResponse.json({ message: "Denied.", code: "FORBIDDEN" }, { status: 403 })),
    );
    const user = await renderAuthPage(`/accept-staff-invitation#${"b".repeat(64)}`);
    await user.type(screen.getByLabelText("Verified email"), "staff@example.test");
    await user.type(screen.getByLabelText("Current password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByText(/Invitation not accepted/)).toBeInTheDocument();
    expect(screen.getByLabelText("Verified email")).toHaveValue("staff@example.test");
    expect(screen.queryByText(/Staff account certified/)).not.toBeInTheDocument();
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
