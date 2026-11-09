import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../../auth/useAuth";
import { server } from "../../test/server";
import { OfficialRecipients } from "./OfficialRecipients";
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
    server.use(http.get(base, () => HttpResponse.json({ data: [version], meta: { send_enabled: true, delivery_gate_open: true, recipients_configured: true } })));
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
      http.get(base, () => HttpResponse.json({ data: [{ ...version, approved_at: approved }], meta: { send_enabled: true, delivery_gate_open: true, recipients_configured: true } })),
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
    await user.click(screen.getByRole("button", { name: "Confirm approval" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Request send" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Request send" }));
    await user.click(screen.getByRole("button", { name: "Confirm send" }));
    expect(await screen.findByText("Send intent recorded. Delivery is not confirmed.")).toBeInTheDocument();
    expect(sendBody).toEqual({ content_hash: version.content_hash, idempotency_key: expect.stringMatching(/^[a-f0-9-]{36}$/) });
  });

  it.each([
    ["approve", "Approve version", "Confirm approval", null, /cannot be undone/],
    ["send", "Request send", "Confirm send", "2026-10-01T04:00:00Z", /emails the signed PDF.*cannot be undone/],
  ] as const)("confirms %s in a dialog: Cancel posts nothing, Confirm posts once", async (kind, trigger, confirmLabel, approvedAt, sentence) => {
    auth("admin", []);
    let posts = 0;
    server.use(
      http.get(base, () => HttpResponse.json({ data: [{ ...version, approved_at: approvedAt }], meta: { send_enabled: true, delivery_gate_open: true, recipients_configured: true, recipient_count: 3 } })),
      http.post(`${base}/${version.uuid}/${kind}`, () => { posts += 1; return HttpResponse.json({ data: { state: "pending" } }, { status: 202 }); }),
    );
    const user = userEvent.setup();
    renderApproval();
    await screen.findByTitle("Official weekly report version 1");
    await user.click(screen.getByRole("button", { name: trigger }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("2026-W40");
    expect(dialog).toHaveTextContent("1");
    expect(dialog).toHaveTextContent("aaaaaaaaaaaa");
    expect(dialog).toHaveTextContent("Recipients3");
    expect(dialog).toHaveTextContent(sentence);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(posts).toBe(0);
    await user.click(screen.getByRole("button", { name: trigger }));
    await user.dblClick(screen.getByRole("button", { name: confirmLabel }));
    await waitFor(() => expect(posts).toBe(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows an honest SMTP receipt and never calls acceptance inbox delivery", async () => {
    auth("admin", ["report:send"]);
    server.use(http.get(base, () => HttpResponse.json({ data: [{ ...version, approved_at: "2026-10-01T04:00:00Z", prepared_name: "Reviewer Name", approved_name: "Approver Name", approved_title: "District Mill Officer", transmissions: [{
      id: 1, state: "sent", transport_receipt: "provider-id@example.test", failure_reason: null,
      requested_name: "Sender Name", requested_by_id: 1, send_grant_id: 3, send_grant_revision: 2,
      created_at: "2026-10-01T05:00:00Z", completed_at: "2026-10-01T05:01:00Z",
    }] }], meta: { send_enabled: true, delivery_gate_open: true, recipients_configured: true } })));
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

  it("hides sending behind the office contract gate", async () => {
    auth("admin", ["report:send"]);
    server.use(http.get(base, () => HttpResponse.json({ data: [{ ...version, approved_at: "2026-10-01T04:00:00Z" }], meta: { send_enabled: false, delivery_gate_open: false, recipients_configured: false } })));
    renderApproval();
    expect(await screen.findByText("Office delivery gate closed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request send" })).not.toBeInTheDocument();
  });

  it("says recipients are missing, not the gate, when the gate is open", async () => {
    auth("admin", ["report:send"]);
    server.use(http.get(base, () => HttpResponse.json({ data: [{ ...version, approved_at: "2026-10-01T04:00:00Z" }], meta: { send_enabled: false, delivery_gate_open: true, recipients_configured: false } })));
    renderApproval();
    expect(await screen.findByText(/No official recipients configured/)).toBeInTheDocument();
    expect(screen.queryByText("Office delivery gate closed.")).not.toBeInTheDocument();
  });

  it("says the gate is closed even when recipients exist", async () => {
    auth("admin", ["report:send"]);
    server.use(http.get(base, () => HttpResponse.json({ data: [{ ...version, approved_at: "2026-10-01T04:00:00Z" }], meta: { send_enabled: false, delivery_gate_open: false, recipients_configured: true } })));
    renderApproval();
    expect(await screen.findByText("Office delivery gate closed.")).toBeInTheDocument();
  });

  it("offers sending again after an admin replaces recipients in another panel", async () => {
    auth("admin", []);
    const recipientsUrl = "http://localhost:8000/api/v1/district-recipient-sets";
    let configured = false;
    const meta = () => ({ send_enabled: configured, delivery_gate_open: true, recipients_configured: configured });
    server.use(
      http.get(base, () => HttpResponse.json({ data: [{ ...version, approved_at: "2026-10-01T04:00:00Z" }], meta: meta() })),
      http.get(recipientsUrl, () => HttpResponse.json({ data: [] })),
      http.post(`${recipientsUrl}/replace`, () => { configured = true; return HttpResponse.json({ data: [] }); }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } } });
    const approval = render(<QueryClientProvider client={client}><WeeklyReportApproval week="2026-W40" /></QueryClientProvider>);
    expect(await screen.findByText(/No official recipients configured\. Add them in Admin Settings\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request send" })).not.toBeInTheDocument();
    approval.unmount();
    const settings = render(<QueryClientProvider client={client}><OfficialRecipients /></QueryClientProvider>);
    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox", { name: "Recipient emails" }), "a@example.test");
    await user.type(screen.getByRole("textbox", { name: "Office decision reference" }), "ref-1");
    await user.type(screen.getByLabelText("Current password"), "synthetic-password");
    await user.click(screen.getByRole("button", { name: "Replace recipients" }));
    expect(await screen.findByText("Recipients replaced. The previous set is revoked.")).toBeInTheDocument();
    settings.unmount();
    render(<QueryClientProvider client={client}><WeeklyReportApproval week="2026-W40" /></QueryClientProvider>);
    expect(await screen.findByRole("button", { name: "Request send" })).toBeInTheDocument();
    expect(screen.queryByText(/No official recipients configured/)).not.toBeInTheDocument();
  });

  it("explains stale version conflicts and never declares approval success", async () => {
    auth("admin", ["report:approve"]);
    server.use(http.post(`${base}/${version.uuid}/approve`, () => HttpResponse.json({ code: "CONFLICT" }, { status: 409 })));
    const user = userEvent.setup();
    renderApproval();
    await screen.findByTitle("Official weekly report version 1");
    await user.click(screen.getByRole("button", { name: "Approve version" }));
    await user.click(screen.getByRole("button", { name: "Confirm approval" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Prepare a new version and review it again");
  });

  it("names the real cause of a conflict from the refreshed version state", async () => {
    auth("admin", []);
    const cases = [
      [{ stale_reason: "newer_version", is_current: false }, "Approve version", "Confirm approval", /newer version of this week/],
      [{ stale_reason: "evidence_changed", is_current: false }, "Approve version", "Confirm approval", /Evidence changed/],
      [{}, "Request send", "Confirm send", /not approved yet/],
    ] as const;
    for (const [patch, button, confirm, expected] of cases) {
      let approved: string | null = button === "Request send" ? "2026-10-01T04:00:00Z" : null;
      server.use(
        http.get(base, () => HttpResponse.json({ data: [{ ...version, approved_at: approved, ...patch }], meta: { send_enabled: true, delivery_gate_open: true, recipients_configured: true } })),
        http.post(`${base}/${version.uuid}/approve`, () => HttpResponse.json({ code: "CONFLICT" }, { status: 409 })),
        http.post(`${base}/${version.uuid}/send`, () => { approved = null; return HttpResponse.json({ code: "CONFLICT" }, { status: 409 }); }),
      );
      const user = userEvent.setup();
      const view = renderApproval();
      await screen.findByTitle("Official weekly report version 1");
      await user.click(screen.getByRole("button", { name: button }));
      await user.click(screen.getByRole("button", { name: confirm }));
      expect(await screen.findByRole("alert")).toHaveTextContent(expected);
      view.unmount();
    }
  });
});
