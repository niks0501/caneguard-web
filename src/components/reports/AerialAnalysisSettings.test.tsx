import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { reportKeys } from "../../hooks/reportQueries";
import { server } from "../../test/server";
import { AerialAnalysisSettings } from "./AerialAnalysisSettings";

const url = "http://localhost:8000/api/v1/admin/aerial-analysis";
function show(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(<QueryClientProvider client={client}><AerialAnalysisSettings /></QueryClientProvider>);
}

describe("aerial canopy check admin switch", () => {
  it("shows a closed gate with no control when the server has not installed it", async () => {
    server.use(http.get(url, () => HttpResponse.json({ data: { installed: false, enabled: false } })));
    show();
    expect(await screen.findByText("Not installed on this server")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("turns the installed check on and off", async () => {
    let enabled = false;
    const bodies: unknown[] = [];
    server.use(
      http.get(url, () => HttpResponse.json({ data: { installed: true, enabled } })),
      http.put(url, async ({ request }) => {
        const body = (await request.json()) as { enabled: boolean };
        bodies.push(body);
        enabled = body.enabled;
        return HttpResponse.json({ data: { installed: true, enabled } });
      }),
    );
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Turn on aerial check" }));
    await user.click(await screen.findByRole("button", { name: "Turn off aerial check" }));
    expect(await screen.findByRole("button", { name: "Turn on aerial check" })).toBeInTheDocument();
    expect(bodies).toEqual([{ enabled: true }, { enabled: false }]);
  });

  it("rejects a save made offline instead of sending it when the connection returns", async () => {
    let enabled = false;
    const bodies: unknown[] = [];
    server.use(
      http.get(url, () => HttpResponse.json({ data: { installed: true, enabled } })),
      http.put(url, async ({ request }) => {
        const body = (await request.json()) as { enabled: boolean };
        bodies.push(body);
        enabled = body.enabled;
        return HttpResponse.json({ data: { installed: true, enabled } });
      }),
    );
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Turn on aerial check" }));
    expect(bodies).toEqual([{ enabled: true }]);

    online.mockReturnValue(false);
    window.dispatchEvent(new Event("offline"));
    await user.click(await screen.findByRole("button", { name: "Turn off aerial check" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved");

    online.mockReturnValue(true);
    window.dispatchEvent(new Event("online"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(bodies).toEqual([{ enabled: true }]);
    online.mockRestore();
  });

  it("drops cached case details after a save so the case stops showing the aerial check", async () => {
    let enabled = true;
    server.use(
      http.get(url, () => HttpResponse.json({ data: { installed: true, enabled } })),
      http.put(url, async ({ request }) => {
        enabled = ((await request.json()) as { enabled: boolean }).enabled;
        return HttpResponse.json({ data: { installed: true, enabled } });
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(reportKeys.detail("case-1"), { id: "case-1" });
    const user = userEvent.setup();
    show(client);
    await user.click(await screen.findByRole("button", { name: "Turn off aerial check" }));
    await screen.findByRole("button", { name: "Turn on aerial check" });
    expect(client.getQueryState(reportKeys.detail("case-1"))?.isInvalidated).toBe(true);
  });

  it("reports a failed save", async () => {
    server.use(
      http.get(url, () => HttpResponse.json({ data: { installed: true, enabled: false } })),
      http.put(url, () => HttpResponse.json({ message: "no" }, { status: 409 })),
    );
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Turn on aerial check" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
