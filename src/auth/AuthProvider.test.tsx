import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/ApiError";
import { hasAuthSessionHint, setAuthSessionHint } from "./authSession";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./useAuth";

const authApi = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  loginRequest: vi.fn(),
  logoutRequest: vi.fn(),
}));

vi.mock("./auth.api", () => ({
  ...authApi,
  WebRoleError: class WebRoleError extends Error {},
}));

vi.mock("../config/env", () => ({ env: { dataSource: "api" } }));

const user = {
  uuid: "user-1",
  name: "Review User",
  email: "reviewer@example.test",
  role: "reviewer" as const,
};

function AuthStatus() {
  const auth = useAuth();
  return <><span data-testid="auth-status">{auth.status}</span><span data-testid="auth-reason">{auth.reason}</span></>;
}

function renderAuthProvider() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  document.cookie = "XSRF-TOKEN=; Max-Age=0; path=/";
  authApi.getCurrentUser.mockResolvedValue(user);
});

describe("AuthProvider session restoration", () => {
  it("starts logged out without probing /me when there is no session hint", async () => {
    renderAuthProvider();

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent(
        "unauthenticated",
      );
    });
    expect(authApi.getCurrentUser).not.toHaveBeenCalled();
  });

  it("restores a session when a prior login hint exists", async () => {
    setAuthSessionHint(true);

    renderAuthProvider();

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent(
        "authenticated",
      );
    });
    expect(authApi.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(hasAuthSessionHint()).toBe(true);
  });

  it("restores disabled accounts as signed out with a disabled-account notice", async () => {
    setAuthSessionHint(true);
    authApi.getCurrentUser.mockRejectedValue(new ApiError("Disabled", { status: 401, code: "ACCOUNT_DISABLED" }));
    renderAuthProvider();
    await waitFor(() => expect(screen.getByTestId("auth-status")).toHaveTextContent("unauthenticated"));
    expect(screen.getByTestId("auth-reason")).toHaveTextContent("account_disabled");
    expect(hasAuthSessionHint()).toBe(false);
  });

  it("treats a restoration 401 as logged out and clears the stale hint", async () => {
    setAuthSessionHint(true);
    authApi.getCurrentUser.mockRejectedValue(
      new ApiError("Unauthenticated.", { status: 401 }),
    );

    renderAuthProvider();

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent(
        "unauthenticated",
      );
    });
    expect(hasAuthSessionHint()).toBe(false);
  });
});
