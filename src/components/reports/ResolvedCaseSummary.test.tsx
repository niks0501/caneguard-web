import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mapReportDetail } from "../../data/api/mappers/report.mapper";
import { reportDetailResponseSchema } from "../../data/api/schemas/report.schema";
import { reportDetailDto } from "../../test/fixtures";
import { ResolvedCaseSummary } from "./ResolvedCaseSummary";

const base = mapReportDetail(reportDetailResponseSchema.parse({ data: reportDetailDto }).data);

describe("ResolvedCaseSummary", () => {
  // Proves: outcome banner with who and when in 12-hour Manila time, 4-line timeline.
  it("shows who and when in 12-hour Manila time and a four-line timeline", () => {
    const report = { ...base, reviewedBy: "Ana Reyes", reviewedAt: "2026-11-16T05:30:00Z", actionTaken: "no_further_action_required" as const };
    render(<ResolvedCaseSummary report={report} onReopen={vi.fn()} />);
    expect(screen.getByText(/Ana Reyes · .*1:30 PM/)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Case timeline" })).getAllByRole("listitem")).toHaveLength(4);
  });

  // Proves: Reopen is the single action and Print is offered; no state change here.
  it("offers Print and Reopen, and Reopen only calls the handler", async () => {
    const onReopen = vi.fn();
    render(<ResolvedCaseSummary report={base} onReopen={onReopen} />);
    await userEvent.click(screen.getByRole("button", { name: /Reopen/ }));
    expect(onReopen).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /Print/ })).toBeInTheDocument();
  });
});
