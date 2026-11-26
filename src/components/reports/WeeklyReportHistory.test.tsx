import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { useAuth } from "../../auth/useAuth";
import { recentManilaIsoWeeks } from "../../domain/reportingTime";
import { server } from "../../test/server";
import { WeeklyReportHistory } from "./WeeklyReportHistory";
import { versionSchema, versionTimeline, weekStatus } from "./weeklyReportHistory";

vi.mock("../../auth/useAuth", () => ({ useAuth: vi.fn() }));
const base = "http://localhost:8000/api/v1/district-reports";
const weeks = recentManilaIsoWeeks(12);
const headline = { cases: 4, confirmed: 1, late_evidence: 0 };
const make = (week: string, version: number, extra: Record<string, unknown> = {}) => versionSchema.parse({
  uuid: `00000000-0000-4000-8000-${String(version).padStart(12, "0")}`, version, content_hash: "a".repeat(64),
  approved_at: null, week, headline, transmissions: [], ...extra,
});

describe("weekStatus", () => {
  it("derives each of the four active weekly states", () => {
    expect(weekStatus([])).toBe("not_prepared");
    expect(weekStatus([make("w", 1)])).toBe("draft");
    expect(weekStatus([make("w", 1, { approved_at: "2026-10-01T04:00:00Z" })])).toBe("approved");
    expect(weekStatus([make("w", 1, { approved_at: "2026-10-01T04:00:00Z", is_current: false, stale_reason: "evidence_changed" })])).toBe("stale");
  });

  it("judges a week by its newest version, not its first row", () => {
    expect(weekStatus([make("w", 1, { approved_at: "x", is_current: false, stale_reason: "newer_version" }), make("w", 2)])).toBe("draft");
  });
});

describe("versionTimeline", () => {
  it("orders newest first with deltas from the previous version", () => {
    const rows = versionTimeline([make("w", 1), make("w", 3, { headline: { cases: 9, confirmed: 3, late_evidence: 2 } }), make("w", 2, { headline: { cases: 6, confirmed: 1, late_evidence: 1 } })]);
    expect(rows.map(row => row.version.version)).toEqual([3, 2, 1]);
    expect(rows[0].deltas).toEqual({ cases: 3, confirmed: 2, late_evidence: 1 });
    expect(rows[2].deltas).toEqual({ cases: null, confirmed: null, late_evidence: null });
  });
});

describe("weekly report history", () => {
  it("shows the 12-week strip and selects a clicked week", async () => {
    vi.mocked(useAuth).mockReturnValue({ status: "authenticated", user: { uuid: "u", name: "A", email: "a@example.test", role: "admin" } } as ReturnType<typeof useAuth>);
    server.use(http.get(base, () => HttpResponse.json({
      data: [make(weeks[0], 2), make(weeks[0], 1, { is_current: false, stale_reason: "newer_version" }), make(weeks[1], 1, { approved_at: "2026-10-01T04:00:00Z" })],
      meta: { email_send_retired: true, send_enabled: false, delivery_gate_open: false, recipients_configured: false },
    })));
    const onSelect = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}><WeeklyReportHistory week={weeks[0]} onSelect={onSelect} /></QueryClientProvider>);
    const strip = await screen.findByRole("list", { name: "Last 12 weeks" });
    expect(await within(strip).findByText("Approved")).toBeInTheDocument();
    expect(within(strip).getAllByRole("button")).toHaveLength(12);
    expect(within(strip).getAllByText("Not generated")).toHaveLength(10);
    const timeline = await screen.findByRole("list", { name: `Versions of ${weeks[0]}` });
    expect(within(timeline).getAllByText(/^Version \d/).map(node => node.textContent)).toEqual(["Version 2", "Version 1"]);
    await userEvent.setup().click(within(strip).getAllByRole("button")[1]);
    expect(onSelect).toHaveBeenCalledWith(weeks[1]);
  });
});
