import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/ApiError";
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

function renderStatus(queryKey: string, queryFn: () => Promise<unknown>) {
  return render(
    <QueryClientProvider client={queryClient()}>
      <QueryProbe queryKey={queryKey} queryFn={queryFn} />
      <ServerStatus />
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

    expect(
      screen.getByRole("status", { name: "Server status: Refreshing" }),
    ).toBeInTheDocument();
    act(() => completeRequest());
    expect(
      await screen.findByRole("status", { name: "Server status: Connected" }),
    ).toBeInTheDocument();
  });

  it("shows unavailable after a transient server failure", async () => {
    renderStatus("unavailable-status", () =>
      Promise.reject(new ApiError("Unavailable", { status: 503 })),
    );

    expect(
      await screen.findByRole("status", {
        name: "Server status: Server unavailable",
      }),
    ).toBeInTheDocument();
  });

  it("keeps a reachable server connected for intentional 403 responses", async () => {
    renderStatus("forbidden-status", () =>
      Promise.reject(new ApiError("Forbidden", { status: 403 })),
    );

    expect(
      await screen.findByRole("status", { name: "Server status: Connected" }),
    ).toBeInTheDocument();
  });
});
