import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../../auth/useAuth";
import { server } from "../../test/server";
import { WeeklyReportApproval } from "./WeeklyReportApproval";

vi.mock("../../auth/useAuth", () => ({ useAuth: vi.fn() }));
const base = "http://localhost:8000/api/v1/district-reports";
const version = {
  uuid: "00000000-0000-4000-8000-000000000010",
  version: 1,
  content_hash: "a".repeat(64),
  approved_at: null as string | null,
};

function auth(role: "reviewer" | "admin", _legacyCapabilities: string[]) {
  void _legacyCapabilities; // Old payload keys never participate in UI authorization.
  vi.mocked(useAuth).mockReturnValue({
    status: "authenticated",
    user: { uuid: "user-1", name: "Office User", email: "office@example.test", role },
    reason: null, login: vi.fn(), logout: vi.fn(), restoreSession: vi.fn(),
  } as ReturnType<typeof useAuth>);
}

function renderApproval() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <WeeklyReportApproval week="2026-W40" />
  </QueryClientProvider>);
}

describe("weekly district approval", () => {
  beforeEach(() => {
    auth("reviewer", []);
    server.use(http.get(base, () => HttpResponse.json({ data: [version], meta: { send_enabled: true } })));
  });

  it("lets reviewers prepare but never shows approval or send, even with malformed grants", async () => {
    auth("reviewer", ["report:approve", "report:send"]);
    renderApproval();
    expect(await screen.findByTitle("Official weekly report version 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prepare district version" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve version" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request send" })).not.toBeInTheDocument();
  });

  it("admins get approval and send controls without named grants", async () => {
    auth("admin", []);
    renderApproval();
    await screen.findByTitle("Official weekly report version 1");
    expect(screen.getByRole("button", { name: "Approve version" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request send" })).toBeInTheDocument();
  });

  it("approves the displayed immutable hash then records an idempotent intent without claiming delivery", async () => {
    auth("admin", ["report:approve", "report:send"]);
    let approved: string | null = null;
    let sendBody: unknown;
    server.use(
      http.get(base, () => HttpResponse.json({ data: [{ ...version, approved_at: approved }], meta: { send_enabled: true } })),
      http.post(`${base}/${version.uuid}/approve`, async ({ request }) => {
        expect(await request.json()).toEqual({ content_hash: version.content_hash });
        approved = "2026-10-01T04:00:00Z";
        return HttpResponse.json({ data: { ...version, approved_at: approved } });
      }),
      http.post(`${base}/${version.uuid}/send`, async ({ request }) => {
        sendBody = await request.json();
        return HttpResponse.json({ data: { state: "pending" } }, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    renderApproval();
    await screen.findByTitle("Official weekly report version 1");
    expect(screen.getByRole("button", { name: "Request send" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Approve version" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Request send" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Request send" }));
    expect(await screen.findByText("Send intent recorded. Delivery is not confirmed.")).toBeInTheDocument();
    expect(sendBody).toEqual({ content_hash: version.content_hash, idempotency_key: expect.stringMatching(/^[a-f0-9-]{36}$/) });
  });

  it("shows an honest SMTP receipt and never calls acceptance inbox delivery", async () => {
    auth("admin", ["report:send"]);
    server.use(http.get(base, () => HttpResponse.json({ data: [{ ...version, approved_at: "2026-10-01T04:00:00Z", prepared_name: "Reviewer Name", approved_name: "Approver Name", approved_title: "District Mill Officer", transmissions: [{
      id: 1, state: "sent", transport_receipt: "provider-id@example.test", failure_reason: null,
      requested_name: "Sender Name", requested_by_id: 1, send_grant_id: 3, send_grant_revision: 2,
      created_at: "2026-10-01T05:00:00Z", completed_at: "2026-10-01T05:01:00Z",
    }] }], meta: { send_enabled: true } })));
    renderApproval();
    expect(await screen.findByText("SMTP provider accepted the report. Inbox delivery is not guaranteed.")).toBeInTheDocument();
    expect(screen.getByText(/Provider message ID: provider-id/)).toBeInTheDocument();
    expect(screen.getByText(/Ordered by Sender Name/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request send" })).toBeDisabled();
  });

  it("filters only the derived view and keeps the approved PDF unfiltered", async () => {
    const user = userEvent.setup();
    renderApproval();
    await screen.findByTitle("Official weekly report version 1");
    await user.selectOptions(screen.getByRole("combobox", { name: "Class view" }), "rssi");
    expect(screen.getByTitle("Official weekly report version 1")).toHaveAttribute("src", `${base}/${version.uuid}/document?disease=rssi`);
    expect(screen.getByRole("link", { name: "Download draft A4 PDF" })).toHaveAttribute("href", `${base}/${version.uuid}/pdf`);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /downy/i })).not.toBeInTheDocument();
  });

  it("blocks all workflow actions offline without queuing a mutation", async () => {
    auth("admin", ["report:approve", "report:send"]);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderApproval();
    expect(screen.getByRole("button", { name: "Prepare district version" })).toBeDisabled();
    expect(screen.getByText(/Preparation, approval and sending are not queued offline/)).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("keeps sending disabled behind the office contract gate", async () => {
    auth("admin", ["report:send"]);
    server.use(http.get(base, () => HttpResponse.json({ data: [{ ...version, approved_at: "2026-10-01T04:00:00Z" }], meta: { send_enabled: false } })));
    renderApproval();
    expect(await screen.findByText("Office delivery gate closed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request send" })).toBeDisabled();
  });

  it("explains stale version conflicts and never declares approval success", async () => {
    auth("admin", ["report:approve"]);
    server.use(http.post(`${base}/${version.uuid}/approve`, () => HttpResponse.json({ code: "CONFLICT" }, { status: 409 })));
    const user = userEvent.setup();
    renderApproval();
    await screen.findByTitle("Official weekly report version 1");
    await user.click(screen.getByRole("button", { name: "Approve version" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Prepare a new version and review it again");
  });
});
