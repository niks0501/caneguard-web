import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../../auth/useAuth";
import { server } from "../../test/server";
import { WeeklyReportsHub } from "./WeeklyReportsHub";

vi.mock("../../auth/useAuth", () => ({ useAuth: vi.fn() }));

const fiveDiseaseUrl = "http://localhost:8000/api/v1/district-reports";
const rssiUrl = "http://localhost:8000/api/v1/district-rssi-reports";

const sampleFiveDisease = {
  uuid: "00000000-0000-4000-8000-000000000101",
  version: 1,
  content_hash: "a".repeat(64),
  approved_at: null as string | null,
  prepared_source: "scheduled" as const,
  prepared_name: "Automated weekly scheduler",
  created_at: "2026-11-22T22:00:00Z",
  week: "2026-W47",
  is_current: true,
  stale_reason: null as "newer_version" | "evidence_changed" | null,
  headline: { cases: 14, confirmed: 9, late_evidence: 1 },
  disease_counts: { healthy: 4, rssi: 3, mosaic: 3, rust: 2, smut: 2 },
  transmissions: [],
};

const sampleRssi = {
  uuid: "00000000-0000-4000-8000-000000000201",
  version: 1,
  content_hash: "b".repeat(64),
  prepared_source: "scheduled" as const,
  prepared_name: "Automated weekly scheduler",
  created_at: "2026-11-22T22:00:00Z",
  week: "2026-W47",
  is_current: true,
  stale_reason: null as "newer_version" | "evidence_changed" | null,
  headline: { validated: 2, suspected: 1 },
};

function mockRole(role: "admin" | "reviewer") {
  vi.mocked(useAuth).mockReturnValue({
    status: "authenticated",
    user: { uuid: "user-1", name: "Maria Santos", email: "maria@sra.gov.ph", role },
    reason: null,
    login: vi.fn(),
    logout: vi.fn(),
    restoreSession: vi.fn(),
  } as ReturnType<typeof useAuth>);
}

function renderHub() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <MemoryRouter>
        <WeeklyReportsHub initialWeek="2026-W47" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("WeeklyReportsHub", () => {
  beforeEach(() => {
    mockRole("admin");
    server.use(
      http.get(fiveDiseaseUrl, () => HttpResponse.json({
        data: [sampleFiveDisease],
        meta: {
          send_enabled: false,
          delivery_gate_open: false,
          recipients_configured: false,
          recipient_count: 0,
          email_send_retired: true,
          appendix_allowed: false,
          automation: {
            enabled: true,
            day: 1,
            time: "06:00",
            timezone: "Asia/Manila",
            last_run_at: "2026-11-22T22:00:00Z",
            last_status: "success",
            last_week: "2026-W47",
            last_error: null,
            next_run_at: "2026-11-29T22:00:00Z",
          },
        },
      })),
      http.get(rssiUrl, () => HttpResponse.json({ data: [sampleRssi] })),
    );
  });

  it("renders automation health pill (R-02), 12-week strip, bundle ZIP bar (R-04), inline RSSI preview (R-01), and zero email send UI", async () => {
    const user = userEvent.setup();
    renderHub();

    expect(await screen.findByText(/Weekly bundle for Gmail \(2026-W47\)/)).toBeInTheDocument();
    expect(screen.getByText(/Auto-build: Mon 6:00 AM PHT · Last run:/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download Weekly Bundle (.zip)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve & seal report" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download RSSI PDF" })).toHaveAttribute(
      "href",
      `${rssiUrl}/${sampleRssi.uuid}/pdf`,
    );
    expect(screen.getByRole("link", { name: "Download RSSI CSV" })).toHaveAttribute(
      "href",
      `${rssiUrl}/${sampleRssi.uuid}/csv`,
    );

    // Zero retired in-app email UI.
    expect(screen.queryByRole("button", { name: /Request send/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Office delivery gate closed/i)).not.toBeInTheDocument();

    // R-01: Inline RSSI preview toggle opens iframe to /document.
    await user.click(screen.getByRole("button", { name: "Preview report" }));
    expect(screen.getByTitle("Weekly RSSI report version 1")).toHaveAttribute(
      "src",
      `${rssiUrl}/${sampleRssi.uuid}/document`,
    );
  });

  it("lets Admins approve in 1 click after confirmation and hides approval from Reviewers", async () => {
    let approved: string | null = null;
    server.use(
      http.get(fiveDiseaseUrl, () => HttpResponse.json({
        data: [{ ...sampleFiveDisease, approved_at: approved, approved_name: approved ? "Maria Santos" : null, approved_title: approved ? "District Mill Officer" : null }],
        meta: { email_send_retired: true, send_enabled: false, delivery_gate_open: false, recipients_configured: false, recipient_count: 0, appendix_allowed: false },
      })),
      http.post(`${fiveDiseaseUrl}/${sampleFiveDisease.uuid}/approve`, () => {
        approved = "2026-11-23T01:00:00Z";
        return HttpResponse.json({ data: { ...sampleFiveDisease, approved_at: approved } });
      }),
    );

    const user = userEvent.setup();
    const { unmount } = renderHub();

    await user.click(await screen.findByRole("button", { name: "Approve & seal report" }));
    await user.click(screen.getByRole("button", { name: "Confirm approval" }));
    expect(await screen.findByRole("link", { name: "Download approved A4 PDF" })).toBeInTheDocument();

    unmount();
    approved = null;
    mockRole("reviewer");
    renderHub();
    expect(await screen.findByRole("link", { name: "Download draft PDF" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve & seal report" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Weekly schedule settings" })).not.toBeInTheDocument();
  });

  it("shows Needs refresh banner when evidence changed and rebuilds both snapshots on click", async () => {
    let refreshedFive = false;
    let refreshedRssi = false;
    server.use(
      http.get(fiveDiseaseUrl, () => HttpResponse.json({
        data: [{ ...sampleFiveDisease, is_current: refreshedFive, stale_reason: refreshedFive ? null : "evidence_changed" }],
        meta: { email_send_retired: true, send_enabled: false, delivery_gate_open: false, recipients_configured: false, recipient_count: 0, appendix_allowed: false },
      })),
      http.post(fiveDiseaseUrl, () => {
        refreshedFive = true;
        return HttpResponse.json({ data: { ...sampleFiveDisease, version: 2 } }, { status: 201 });
      }),
      http.post(rssiUrl, () => {
        refreshedRssi = true;
        return HttpResponse.json({ data: { ...sampleRssi, version: 2 } }, { status: 201 });
      }),
    );

    const user = userEvent.setup();
    renderHub();

    const refreshBtn = await screen.findByRole("button", { name: "Refresh weekly reports" });
    await user.click(refreshBtn);
    await waitFor(() => {
      expect(refreshedFive).toBe(true);
      expect(refreshedRssi).toBe(true);
    });
  });
});
