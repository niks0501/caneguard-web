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

  it("removes cached aerial results once the server confirms the check is off", async () => {
    let enabled = true;
    server.use(
      http.get(url, () => HttpResponse.json({ data: { installed: true, enabled } })),
      http.put(url, async ({ request }) => {
        enabled = ((await request.json()) as { enabled: boolean }).enabled;
        return HttpResponse.json({ data: { installed: true, enabled } });
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(reportKeys.detail("case-1"), { id: "case-1", aerialAnalyses: [{ uuid: "a-1" }] });
    client.setQueryData(["aerial-mask", "/masks/a-1"], new Blob(["mask"]));
    client.setQueryData(reportKeys.possibleMatches("case-1"), []);
    const user = userEvent.setup();
    show(client);
    await user.click(await screen.findByRole("button", { name: "Turn off aerial check" }));
    await screen.findByRole("button", { name: "Turn on aerial check" });
    expect(client.getQueryData(reportKeys.detail("case-1"))).toEqual({ id: "case-1", aerialAnalyses: undefined });
    expect(client.getQueryData(["aerial-mask", "/masks/a-1"])).toBeUndefined();
    expect(client.getQueryData(reportKeys.possibleMatches("case-1"))).toEqual([]);
  });

  it("applies the save response without re-reading the settings", async () => {
    let reads = 0;
    server.use(
      http.get(url, () => {
        reads += 1;
        return HttpResponse.json({ data: { installed: true, enabled: false } });
      }),
      http.put(url, () => HttpResponse.json({ data: { installed: true, enabled: true } })),
    );
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Turn on aerial check" }));
    expect(await screen.findByRole("button", { name: "Turn off aerial check" })).toBeInTheDocument();
    expect(reads).toBe(1);
  });

  it("clears cached aerial results when the install gate is off even though the saved switch is on", async () => {
    server.use(http.get(url, () => HttpResponse.json({ data: { installed: false, enabled: true } })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(reportKeys.detail("case-1"), { id: "case-1", aerialAnalyses: [{ uuid: "a-1" }] });
    client.setQueryData(["aerial-mask", "/masks/a-1"], new Blob(["mask"]));
    show(client);
    expect(await screen.findByText("Not installed on this server")).toBeInTheDocument();
    expect(client.getQueryData(reportKeys.detail("case-1"))).toEqual({ id: "case-1", aerialAnalyses: undefined });
    expect(client.getQueryData(["aerial-mask", "/masks/a-1"])).toBeUndefined();
  });

  it("does not let a case read started before the check was turned off repopulate it", async () => {
    server.use(http.get(url, () => HttpResponse.json({ data: { installed: true, enabled: false } })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let finishCaseRead: ((report: unknown) => void) | undefined;
    void client.fetchQuery({
      queryKey: reportKeys.detail("case-1"),
      queryFn: () => new Promise((resolve) => { finishCaseRead = resolve; }),
    }).catch(() => undefined);
    await vi.waitFor(() => expect(finishCaseRead).toBeDefined());
    show(client);
    expect(await screen.findByText("Off")).toBeInTheDocument();
    finishCaseRead?.({ id: "case-1", aerialAnalyses: [{ uuid: "a-1" }] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.getQueryData(reportKeys.detail("case-1"))).toBeUndefined();
  });

  it("keeps an acknowledged save when an earlier settings read lands afterwards", async () => {
    let enabled = false;
    let reads = 0;
    let staleReadStarted: () => void = () => undefined;
    const staleReadCaptured = new Promise<void>((resolve) => { staleReadStarted = resolve; });
    let releaseStaleRead: () => void = () => undefined;
    const staleRead = new Promise<void>((resolve) => { releaseStaleRead = resolve; });
    let staleResponded: () => void = () => undefined;
    const staleReply = new Promise<void>((resolve) => { staleResponded = resolve; });
    server.use(
      http.get(url, async () => {
        const snapshot = enabled;
        reads += 1;
        if (reads === 2) {
          staleReadStarted();
          await staleRead;
          staleResponded();
        }
        return HttpResponse.json({ data: { installed: true, enabled: snapshot } });
      }),
      http.put(url, async ({ request }) => {
        enabled = ((await request.json()) as { enabled: boolean }).enabled;
        return HttpResponse.json({ data: { installed: true, enabled } });
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    show(client);
    await screen.findByRole("button", { name: "Turn on aerial check" });
    void client.invalidateQueries({ queryKey: ["aerial-analysis-settings"] });
    await staleReadCaptured;
    await user.click(screen.getByRole("button", { name: "Turn on aerial check" }));
    expect(await screen.findByRole("button", { name: "Turn off aerial check" })).toBeInTheDocument();
    releaseStaleRead();
    await staleReply;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole("button", { name: "Turn off aerial check" })).toBeInTheDocument();
  });

  it("does not let a delayed save acknowledgment overwrite a newer settings read", async () => {
    let enabled = true;
    let reads = 0;
    let releaseSave: () => void = () => undefined;
    const saveHeld = new Promise<void>((resolve) => { releaseSave = resolve; });
    let putStarted: () => void = () => undefined;
    const putReached = new Promise<void>((resolve) => { putStarted = resolve; });
    server.use(
      http.get(url, () => {
        reads += 1;
        return HttpResponse.json({ data: { installed: true, enabled } });
      }),
      http.put(url, async ({ request }) => {
        enabled = ((await request.json()) as { enabled: boolean }).enabled;
        putStarted();
        await saveHeld;
        return HttpResponse.json({ data: { installed: true, enabled: false } });
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(reportKeys.detail("case-1"), { id: "case-1", aerialAnalyses: [{ uuid: "a-9" }] });
    const user = userEvent.setup();
    show(client);
    await user.click(await screen.findByRole("button", { name: "Turn off aerial check" }));
    await putReached;
    enabled = true;
    void client.invalidateQueries({ queryKey: ["aerial-analysis-settings"] });
    await vi.waitFor(() => expect(client.isFetching({ queryKey: ["aerial-analysis-settings"] })).toBe(0));
    releaseSave();
    await vi.waitFor(() => expect(reads).toBe(3));
    await vi.waitFor(() => expect(client.isFetching({ queryKey: ["aerial-analysis-settings"] })).toBe(0));
    expect(screen.getByRole("button", { name: "Turn off aerial check" })).toBeInTheDocument();
    expect(client.getQueryData(reportKeys.detail("case-1"))).toEqual({ id: "case-1", aerialAnalyses: undefined });
  });

  it("shows neither state when a conflicting settings read cannot be reconciled", async () => {
    let enabled = true;
    let reads = 0;
    let releaseSave: () => void = () => undefined;
    const saveHeld = new Promise<void>((resolve) => { releaseSave = resolve; });
    let putStarted: () => void = () => undefined;
    const putReached = new Promise<void>((resolve) => { putStarted = resolve; });
    server.use(
      http.get(url, () => {
        reads += 1;
        if (reads === 3) return new HttpResponse(null, { status: 500 });
        return HttpResponse.json({ data: { installed: true, enabled } });
      }),
      http.put(url, async ({ request }) => {
        const body = (await request.json()) as { enabled: boolean };
        putStarted();
        await saveHeld;
        enabled = body.enabled;
        return HttpResponse.json({ data: { installed: true, enabled } });
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(reportKeys.detail("case-1"), { id: "case-1", aerialAnalyses: [{ uuid: "a-9" }] });
    const user = userEvent.setup();
    show(client);
    await user.click(await screen.findByRole("button", { name: "Turn off aerial check" }));
    await putReached;
    void client.invalidateQueries({ queryKey: ["aerial-analysis-settings"] });
    await vi.waitFor(() => expect(reads).toBe(2));
    await vi.waitFor(() => expect(client.isFetching({ queryKey: ["aerial-analysis-settings"] })).toBe(0));
    releaseSave();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Turn off aerial check" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Turn on aerial check" })).not.toBeInTheDocument();
    expect(client.getQueryData(reportKeys.detail("case-1"))).toEqual({ id: "case-1", aerialAnalyses: undefined });
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
