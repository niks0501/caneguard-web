import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../auth/useAuth";
import { env } from "../config/env";
import { dashboardKeys } from "./useDashboard";
import { notificationsKeys } from "./notificationQueries";
import { reportKeys } from "./reportQueries";
import { createEchoClient } from "../realtime/echo";
import { useRealtimeInvalidation } from "./useRealtimeInvalidation";

vi.mock("../auth/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../config/env", () => ({
  env: {
    apiBaseUrl: "https://api.caneguard.test",
    dataSource: "api",
    reportRefreshMs: 600_000,
    mapTilerKey: "",
    realtimeEnabled: true,
    reverbAppKey: "test-key",
    reverbHost: "localhost",
    reverbPort: 8080,
    reverbScheme: "http",
  },
}));

vi.mock("../realtime/echo", () => ({
  createEchoClient: vi.fn(),
}));

function Probe() {
  const { status } = useRealtimeInvalidation();
  return (
    <>
      <span data-testid="realtime-status">{status}</span>
      <h1>Overview</h1>
    </>
  );
}

function renderProbe(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
}

describe("useRealtimeInvalidation", () => {
  let channel: {
    listen: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let connectionChange: ((status: string) => void) | undefined;
  let connectionError: (() => void) | undefined;
  let echo: {
    private: ReturnType<typeof vi.fn>;
    connector: {
      onConnectionChange: ReturnType<typeof vi.fn>;
      pusher: {
        connection: {
          bind: ReturnType<typeof vi.fn>;
          unbind: ReturnType<typeof vi.fn>;
        };
      };
    };
    leave: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    env.realtimeEnabled = true;
    env.reverbAppKey = "test-key";
    connectionError = undefined;
    vi.mocked(useAuth).mockReturnValue({
      status: "authenticated",
      user: {
        uuid: "user-1",
        name: "Reviewer",
        email: "reviewer@example.test",
        role: "reviewer",
      },
      reason: null,
      login: vi.fn(),
      logout: vi.fn(),
      restoreSession: vi.fn(),
    });
    channel = {
      listen: vi.fn().mockReturnThis(),
      error: vi.fn().mockReturnThis(),
    };
    echo = {
      private: vi.fn().mockReturnValue(channel),
      connector: {
        onConnectionChange: vi.fn((callback: (status: string) => void) => {
          connectionChange = callback;
          return vi.fn();
        }),
        pusher: {
          connection: {
            bind: vi.fn((_event: string, callback: () => void) => {
              connectionError = callback;
            }),
            unbind: vi.fn(),
          },
        },
      },
      leave: vi.fn(),
      disconnect: vi.fn(),
    };
    vi.mocked(createEchoClient).mockReturnValue(echo as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not create Echo when the app key is empty", () => {
    env.reverbAppKey = "";

    renderProbe(new QueryClient());

    expect(screen.getByTestId("realtime-status")).toHaveTextContent("disabled");
    expect(createEchoClient).not.toHaveBeenCalled();
  });

  it("does not create Echo when realtime is explicitly disabled", () => {
    env.realtimeEnabled = false;

    renderProbe(new QueryClient());

    expect(screen.getByTestId("realtime-status")).toHaveTextContent("disabled");
    expect(createEchoClient).not.toHaveBeenCalled();
  });

  it("authorizes the user's private channel and invalidates canonical queries", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(reportKeys.list({}), { reports: [] });
    client.setQueryData(dashboardKeys.summary(), { totalSubmitted: 0 });
    client.setQueryData(notificationsKeys.feed(), { notifications: [] });

    const { unmount } = renderProbe(client);

    expect(echo.private).toHaveBeenCalledWith("users.user-1");
    expect(channel.listen).toHaveBeenCalledWith(
      ".case.submitted",
      expect.any(Function),
    );
    expect(channel.listen).toHaveBeenCalledWith(
      ".case.attention_changed",
      expect.any(Function),
    );
    act(() => connectionChange?.("connected"));
    expect(screen.getByTestId("realtime-status")).toHaveTextContent("connected");

    const eventHandler = channel.listen.mock.calls[0][1] as (
      payload: unknown,
    ) => void;
    act(() => eventHandler({ domains: ["reports", "notifications"] }));

    await waitFor(() => {
      expect(client.getQueryState(reportKeys.list({}))?.isInvalidated).toBe(true);
      expect(client.getQueryState(notificationsKeys.feed())?.isInvalidated).toBe(
        true,
      );
    });

    unmount();
    expect(echo.leave).toHaveBeenCalledWith("users.user-1");
    expect(echo.disconnect).toHaveBeenCalled();
  });

  it("keeps dashboard content rendered when the socket connection is refused", async () => {
    renderProbe(new QueryClient());

    act(() => connectionChange?.("failed"));

    await waitFor(() => {
      expect(screen.getByTestId("realtime-status")).toHaveTextContent("degraded");
    });
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
  });

  it("disconnects after one connection error and logs one debug note", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

    renderProbe(new QueryClient());

    expect(connectionError).toBeDefined();
    act(() => connectionError?.());
    await waitFor(() => {
      expect(echo.disconnect).toHaveBeenCalledTimes(1);
    });

    act(() => connectionError?.());
    expect(screen.getByTestId("realtime-status")).toHaveTextContent("degraded");
    expect(echo.disconnect).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledTimes(1);
  });

  it("keeps the workspace in refresh mode when Echo cannot be created", async () => {
    vi.mocked(createEchoClient).mockImplementation(() => {
      throw new Error("Reverb is unavailable");
    });

    renderProbe(new QueryClient());

    await waitFor(() => {
      expect(screen.getByTestId("realtime-status")).toHaveTextContent("degraded");
    });
  });
});
