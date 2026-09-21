import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../auth/auth.context";
import type { AuthContextValue } from "../auth/auth.context";
import type { AuthStatus } from "../auth/auth.types";
import { ApiConnectivityProvider } from "./ApiConnectivityProvider";
import { useApiConnectivity } from "./apiConnectivity.context";
import type { ApiHealthResult } from "./apiHealth";

const user = {
  uuid: "user-1",
  name: "Maria Santos",
  email: "mao@caneguard.test",
  role: "reviewer" as const,
};

function authValue(status: AuthStatus): AuthContextValue {
  return {
    status,
    user: status === "authenticated" ? user : null,
    reason: null,
    login: vi.fn(),
    logout: vi.fn(),
    restoreSession: vi.fn(),
  };
}

function Probe() {
  const { networkStatus, apiReachability } = useApiConnectivity();
  return <output>{`${networkStatus}:${apiReachability}`}</output>;
}

function renderProvider(
  healthCheck: () => Promise<ApiHealthResult>,
  status: AuthStatus = "authenticated",
) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthContext value={authValue(status)}>
        <ApiConnectivityProvider healthCheck={healthCheck}>
          <Probe />
        </ApiConnectivityProvider>
      </AuthContext>
    </QueryClientProvider>,
  );
}

describe("ApiConnectivityProvider", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  it("keeps network availability separate from a reachable API", async () => {
    const healthCheck = vi.fn().mockResolvedValue({
      reachability: "reachable",
      checks: { database: "ready", storage: "ready" },
    } satisfies ApiHealthResult);

    renderProvider(healthCheck);

    await waitFor(() =>
      expect(screen.getByText("available:reachable")).toBeInTheDocument(),
    );
    expect(healthCheck).toHaveBeenCalledOnce();
  });

  it("reports an online browser with an unreachable API", async () => {
    const healthCheck = vi.fn().mockResolvedValue({
      reachability: "unreachable",
      reason: "timeout",
    } satisfies ApiHealthResult);

    renderProvider(healthCheck);

    await waitFor(() =>
      expect(screen.getByText("available:unreachable")).toBeInTheDocument(),
    );
  });

  it("reports an online browser with a degraded API when health check returns unhealthy reason", async () => {
    const healthCheck = vi.fn().mockResolvedValue({
      reachability: "unreachable",
      reason: "unhealthy",
    } satisfies ApiHealthResult);

    renderProvider(healthCheck);

    await waitFor(() =>
      expect(screen.getByText("available:degraded")).toBeInTheDocument(),
    );
  });

  it("reports an online browser with a degraded API when health check returns degraded reachability", async () => {
    const healthCheck = vi.fn().mockResolvedValue({
      reachability: "degraded",
      checks: { database: "unavailable", storage: "ready" },
    } satisfies ApiHealthResult);

    renderProvider(healthCheck);

    await waitFor(() =>
      expect(screen.getByText("available:degraded")).toBeInTheDocument(),
    );
  });

  it("does not crash when the health client rejects unexpectedly", async () => {
    const healthCheck = vi.fn().mockRejectedValue(new Error("request failed"));

    renderProvider(healthCheck);

    await waitFor(() =>
      expect(screen.getByText("available:unreachable")).toBeInTheDocument(),
    );
  });

  it("does not check or report the API as reachable while offline", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    const healthCheck = vi.fn();

    renderProvider(healthCheck);

    expect(screen.getByText("unavailable:unreachable")).toBeInTheDocument();
    expect(healthCheck).not.toHaveBeenCalled();
  });

  it("clears an in-flight reachability result when the session changes", async () => {
    let resolveHealth!: (result: ApiHealthResult) => void;
    const healthCheck = vi.fn(
      () =>
        new Promise<ApiHealthResult>((resolve) => {
          resolveHealth = resolve;
        }),
    );
    function SessionHarness() {
      const [status, setStatus] = useState<AuthStatus>("authenticated");
      return (
        <AuthContext value={authValue(status)}>
          <button type="button" onClick={() => setStatus("unauthenticated")}>
            Sign out
          </button>
          <ApiConnectivityProvider healthCheck={healthCheck}>
            <Probe />
          </ApiConnectivityProvider>
        </AuthContext>
      );
    }

    render(
      <QueryClientProvider client={new QueryClient()}>
        <SessionHarness />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(healthCheck).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.getByText("available:unknown")).toBeInTheDocument();

    act(() =>
      resolveHealth({
        reachability: "reachable",
        checks: { database: "ready", storage: "ready" },
      }),
    );
    await waitFor(() =>
      expect(screen.getByText("available:unknown")).toBeInTheDocument(),
    );
  });
});
