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
  void _legacyCapabilities;
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
    server.use(http.get(base, () => HttpResponse.json({ data: [version], meta: { email_send_retired: true, send_enabled: false, delivery_gate_open: false, recipients_configured: false } })));
  });

  it("lets reviewers prepare and never shows approval or retired send controls", async () => {
    auth("reviewer", ["report:approve", "report:send"]);
    renderApproval();
    expect(await screen.findByTitle("Official weekly report version 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prepare district version" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve version" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request send" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Office delivery gate closed/i)).not.toBeInTheDocument();
  });

  it("lets admins approve without named grants and never renders retired send controls", async () => {
    auth("admin", []);
    renderApproval();
    await screen.findByTitle("Official weekly report version 1");
    expect(screen.getByRole("button", { name: "Approve version" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request send" })).not.toBeInTheDocument();
  });

  it("confirms approval in a dialog: Cancel posts nothing, Confirm approves once and unlocks approved PDF", async () => {
    auth("admin", []);
    let approved: string | null = null;
    let posts = 0;
    server.use(
      http.get(base, () => HttpResponse.json({ data: [{ ...version, approved_at: approved }], meta: { email_send_retired: true, send_enabled: false, delivery_gate_open: false, recipients_configured: false } })),
      http.post(`${base}/${version.uuid}/approve`, async ({ request }) => {
        expect(await request.json()).toEqual({ content_hash: version.content_hash });
        posts += 1;
        approved = "2026-10-01T04:00:00Z";
        return HttpResponse.json({ data: { ...version, approved_at: approved } });
      }),
    );

    const user = userEvent.setup();
    renderApproval();
    await screen.findByTitle("Official weekly report version 1");
    await user.click(screen.getByRole("button", { name: "Approve version" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("2026-W40");
    expect(dialog).toHaveTextContent("aaaaaaaaaaaa");
    expect(dialog).toHaveTextContent(/cannot be undone/);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(posts).toBe(0);

    await user.click(screen.getByRole("button", { name: "Approve version" }));
    await user.click(screen.getByRole("button", { name: "Confirm approval" }));
    await waitFor(() => expect(posts).toBe(1));
    expect(await screen.findByRole("link", { name: "Download approved A4 PDF" })).toBeInTheDocument();
  });

  it("reports a stale version conflict clearly on 409", async () => {
    auth("admin", []);
    server.use(
      http.get(base, () => HttpResponse.json({ data: [{ ...version, is_current: false, stale_reason: "evidence_changed" }], meta: { email_send_retired: true, send_enabled: false, delivery_gate_open: false, recipients_configured: false } })),
      http.post(`${base}/${version.uuid}/approve`, () => HttpResponse.json({ message: "Conflict" }, { status: 409 })),
    );
    const user = userEvent.setup();
    renderApproval();
    await screen.findByTitle("Official weekly report version 1");
    await user.click(screen.getByRole("button", { name: "Approve version" }));
    await user.click(screen.getByRole("button", { name: "Confirm approval" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Evidence changed after this version was prepared/);
  });
});
