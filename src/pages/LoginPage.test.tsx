import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/ApiError";
import { WebRoleError } from "../auth/auth.api";
import { AuthContext, type AuthContextValue } from "../auth/auth.context";
import type { AppUser } from "../auth/auth.types";
import { LoginPage } from "./LoginPage";

const mockUser: AppUser = {
  uuid: "user-1",
  name: "Reviewer Staff",
  email: "staff@example.test",
  role: "reviewer",
};

function renderLoginPage(
  authOverrides: Partial<AuthContextValue> = {},
  initialEntries: string[] | { pathname: string; state?: unknown }[] = ["/login"],
) {
  const loginMock = vi.fn().mockResolvedValue(mockUser);
  const logoutMock = vi.fn().mockResolvedValue(undefined);
  const restoreSessionMock = vi.fn().mockResolvedValue(undefined);

  const authValue: AuthContextValue = {
    status: "unauthenticated",
    user: null,
    reason: null,
    login: loginMock,
    logout: logoutMock,
    restoreSession: restoreSessionMock,
    ...authOverrides,
  };

  const result = render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div data-testid="dashboard-view">Dashboard</div>} />
          <Route path="/reports/detail" element={<div data-testid="detail-view">Detail View</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );

  return { ...result, loginMock, logoutMock };
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the hero CaneGuard branding and deliberate operational telemetry", () => {
    renderLoginPage();

    // Check brand hero elements in the visual aside
    const visualAside = screen.getByLabelText("CaneGuard decision support");
    expect(visualAside).toBeInTheDocument();

    // Check institutional badge and jurisdiction
    expect(screen.getByText("SRA Don Pedro Mill District")).toBeInTheDocument();
    expect(screen.getByText("District 04 • Western Batangas")).toBeInTheDocument();

    // Check CaneGuard hero logos (both dark-field hero and brand-mark lockup)
    const logos = screen.getAllByAltText("CaneGuard");
    expect(logos.length).toBeGreaterThanOrEqual(2);

    // Check hero tagline and mission
    expect(screen.getByText("Sugarcane monitoring & field verification")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Official operational portal for field inspection review, disease triage, and grower case validation.",
      ),
    ).toBeInTheDocument();

    // Check deliberate telemetry pillars
    expect(screen.getByLabelText("Operational jurisdiction and status")).toBeInTheDocument();
    expect(screen.getByText("Don Pedro Mill District")).toBeInTheDocument();
    expect(screen.getByText("Active Season 2026")).toBeInTheDocument();
    expect(screen.getByText("Role-Governed Access")).toBeInTheDocument();
  });

  it("renders the login form elements, badge, and links", () => {
    renderLoginPage();

    expect(screen.getByText("Staff Portal")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Sign in to review field reports" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sign in with your SRA Don Pedro staff account."),
    ).toBeInTheDocument();

    expect(screen.getByLabelText(/^Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/register",
    );
  });

  it("toggles password visibility when clicking the eye button", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    const passwordInput = screen.getByLabelText(/^Password/i);
    expect(passwordInput).toHaveAttribute("type", "password");

    const toggleButton = screen.getByRole("button", { name: "Show password" });
    await user.click(toggleButton);

    expect(passwordInput).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("successfully submits credentials and routes to default destination", async () => {
    const user = userEvent.setup();
    const { loginMock } = renderLoginPage();

    await user.type(screen.getByLabelText(/^Email/i), "staff@sradonpedro.gov.ph");
    await user.type(screen.getByLabelText(/^Password/i), "CaneGuard2026!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(loginMock).toHaveBeenCalledWith({
      email: "staff@sradonpedro.gov.ph",
      password: "CaneGuard2026!",
    });

    expect(await screen.findByTestId("dashboard-view")).toBeInTheDocument();
  });

  it("routes to safe referrer destination after login", async () => {
    const user = userEvent.setup();
    const { loginMock } = renderLoginPage({}, [
      { pathname: "/login", state: { from: "/reports/detail" } },
    ]);

    await user.type(screen.getByLabelText(/^Email/i), "staff@sradonpedro.gov.ph");
    await user.type(screen.getByLabelText(/^Password/i), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(loginMock).toHaveBeenCalled();
    expect(await screen.findByTestId("detail-view")).toBeInTheDocument();
  });

  it("surfaces invalid credential error (422)", async () => {
    const user = userEvent.setup();
    const loginMock = vi.fn().mockRejectedValue(
      new ApiError("Invalid", { status: 422, code: "INVALID_CREDENTIALS" }),
    );
    renderLoginPage({ login: loginMock });

    await user.type(screen.getByLabelText(/^Email/i), "staff@sradonpedro.gov.ph");
    await user.type(screen.getByLabelText(/^Password/i), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The email or password is incorrect.",
    );
  });

  it("surfaces rate limit error (429)", async () => {
    const user = userEvent.setup();
    const loginMock = vi.fn().mockRejectedValue(
      new ApiError("Too Many Attempts", { status: 429, code: "RATE_LIMITED" }),
    );
    renderLoginPage({ login: loginMock });

    await user.type(screen.getByLabelText(/^Email/i), "staff@sradonpedro.gov.ph");
    await user.type(screen.getByLabelText(/^Password/i), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many sign-in attempts. Wait a minute before trying again.",
    );
  });

  it("surfaces unverified email error with resend link", async () => {
    const user = userEvent.setup();
    const loginMock = vi.fn().mockRejectedValue(
      new ApiError("Unverified", { status: 403, code: "EMAIL_NOT_VERIFIED" }),
    );
    renderLoginPage({ login: loginMock });

    await user.type(screen.getByLabelText(/^Email/i), "staff@sradonpedro.gov.ph");
    await user.type(screen.getByLabelText(/^Password/i), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Verify your email address before signing in.",
    );
    expect(screen.getByRole("link", { name: "Resend verification email" })).toHaveAttribute(
      "href",
      "/verify-email",
    );
  });

  it("surfaces web role unauthorized error (WebRoleError)", async () => {
    const user = userEvent.setup();
    const loginMock = vi.fn().mockRejectedValue(
      new WebRoleError(),
    );
    renderLoginPage({ login: loginMock });

    await user.type(screen.getByLabelText(/^Email/i), "field@sradonpedro.gov.ph");
    await user.type(screen.getByLabelText(/^Password/i), "pass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This account cannot access the web workspace.",
    );
  });

  it("surfaces route state reason for session expired", () => {
    renderLoginPage({}, [
      { pathname: "/login", state: { reason: "session_expired" } },
    ]);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Your session expired. Sign in again to continue where you left off.",
    );
  });

  it("surfaces route state reason for access denied", () => {
    renderLoginPage({}, [
      { pathname: "/login", state: { reason: "access_denied" } },
    ]);

    expect(screen.getByRole("status")).toHaveTextContent(
      "This account is not authorized for the SRA Don Pedro Web workspace.",
    );
  });

  it("displays service error notice when auth status is service_error", () => {
    renderLoginPage({ status: "service_error" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "CaneGuard could not confirm an existing session. You may retry sign-in.",
    );
  });

  it("shows loading screen while checking existing session", () => {
    renderLoginPage({ status: "loading" });

    expect(screen.getByText("Checking your CaneGuard session...")).toBeInTheDocument();
  });

  it("redirects immediately when already authenticated", () => {
    renderLoginPage({ status: "authenticated", user: mockUser });

    expect(screen.getByTestId("dashboard-view")).toBeInTheDocument();
  });
});
