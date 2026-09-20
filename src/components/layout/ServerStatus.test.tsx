import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/ApiError";
import {
  ApiConnectivityContext,
  type ApiConnectivitySnapshot,
} from "../../api/apiConnectivity.context";
import type { ApiHealthResult } from "../../api/apiHealth";
import { ServerStatus } from "./ServerStatus";

function queryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function QueryProbe({
  queryKey,
  queryFn,
}: {
  queryKey: string;
  queryFn: () => Promise<unknown>;
}) {
  useQuery({ queryKey: [queryKey], queryFn });
  return null;
}

const connected: ApiConnectivitySnapshot = {
  networkStatus: "available",
  apiReachability: "reachable",
  checkApiReachability: async (): Promise<ApiHealthResult | null> => null,
};

function renderStatus(
  queryKey: string,
  queryFn: () => Promise<unknown>,
  connectivity: ApiConnectivitySnapshot = connected,
  showOnlyDegraded = false,
) {
  return render(
    <QueryClientProvider client={queryClient()}>
      <ApiConnectivityContext value={connectivity}>
        <QueryProbe queryKey={queryKey} queryFn={queryFn} />
        <ServerStatus showOnlyDegraded={showOnlyDegraded} />
      </ApiConnectivityContext>
    </QueryClientProvider>,
  );
}

describe("ServerStatus", () => {
  it("moves from refreshing to connected after a successful request", async () => {
    let completeRequest!: () => void;
    const request = new Promise((resolve) => {
      completeRequest = () => resolve({ ok: true });
    });
    renderStatus("successful-status", () => request);

    expect(screen.getByText("Checking", { exact: true })).toBeInTheDocument();
    act(() => completeRequest());
    expect(
      await screen.findByText("Connected", { exact: true }),
    ).toBeInTheDocument();
  });

  it("shows unavailable when the health check says the API is unreachable", async () => {
    renderStatus(
      "unavailable-status",
      () => Promise.resolve({ ok: true }),
      { ...connected, apiReachability: "unreachable" },
    );

    expect(
      await screen.findByRole("status", {
        name: "Connectivity: Network Available; CaneGuard server Unavailable",
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Server unavailable", { exact: true }),
    ).toBeInTheDocument();
  });

  it("keeps a reachable server connected when an endpoint returns 503", async () => {
    renderStatus("endpoint-failure-status", () =>
      Promise.reject(new ApiError("Unavailable", { status: 503 })),
    );

    expect(
      await screen.findByRole("status", {
        name: "Connectivity: Network Available; CaneGuard server Connected",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("keeps a reachable server connected for intentional 403 responses", async () => {
    renderStatus("forbidden-status", () =>
      Promise.reject(new ApiError("Forbidden", { status: 403 })),
    );

    expect(
      await screen.findByRole("status", {
        name: "Connectivity: Network Available; CaneGuard server Connected",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("does not report a server connection while the browser is offline", () => {
    renderStatus("offline-status", () => Promise.resolve({ ok: true }), {
      ...connected,
      networkStatus: "unavailable",
      apiReachability: "unreachable",
    });

    expect(
      screen.getByRole("status", {
        name: "Connectivity: Network Unavailable; CaneGuard server Unavailable",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("renders nothing when healthy by default (showOnlyDegraded=true)", () => {
    const { container } = render(
      <QueryClientProvider client={queryClient()}>
        <ApiConnectivityContext value={connected}>
          <ServerStatus />
        </ApiConnectivityContext>
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
