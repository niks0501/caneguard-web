import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/ApiError";
import { mapReportDetail } from "../../data/api/mappers/report.mapper";
import { reportDetailResponseSchema } from "../../data/api/schemas/report.schema";
import { reportDetailDto } from "../../test/fixtures";
import { useAdvisories, useUpdateReportReview } from "../../hooks/useReports";
import { useFieldReporters } from "../../hooks/useFieldReporters";
import { reportsRepository } from "../../services/reports.service";
import { ReviewDecisionForm } from "./ReviewDecisionForm";
import { ReportTable } from "./ReportTable";
import type { DiseaseReport } from "../../domain/report.types";

vi.mock("../../hooks/useReports", () => ({ useAdvisories: vi.fn(), useUpdateReportReview: vi.fn() }));
vi.mock("../../hooks/useFieldReporters", () => ({ useFieldReporters: vi.fn() }));
vi.mock("../../services/reports.service", () => ({ reportsRepository: { listReports: vi.fn() } }));
const base = mapReportDetail(reportDetailResponseSchema.parse({ data: reportDetailDto }).data);
const advisory = { uuid: "advisory-1", code: "ADV-1", title: "Validated guidance", content: "Guidance", status: "validated" as const };
const save = vi.fn();
const reset = vi.fn();
function mutation(error: ApiError | null = null, isPending = false) {
  return { mutateAsync: save, reset, error, isError: !!error, isPending } as unknown as ReturnType<typeof useUpdateReportReview>;
}
function renderForm(report = base, onRefresh = vi.fn()) {
  return render(<MemoryRouter><ReviewDecisionForm report={report} onRefresh={onRefresh} /></MemoryRouter>);
}
async function technical(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: "Provide Advisory or Assistance" }));
  await user.click(screen.getByRole("button", { name: "Next step" }));
  await user.click(screen.getByRole("radio", { name: "Technical Assistance" }));
  await user.clear(screen.getByRole("textbox"));
  await user.type(screen.getByRole("textbox"), "Delivered practical field assistance.");
}
function Destination() {
  const location = useLocation();
  return <><p>Next case</p><output data-testid="queue-context">{JSON.stringify(location.state)}</output></>;
}

beforeEach(() => {
  save.mockReset().mockResolvedValue({ ...base, reviewVersion: base.reviewVersion! + 1 });
  reset.mockClear();
  vi.mocked(useUpdateReportReview).mockReturnValue(mutation());
  vi.mocked(useAdvisories).mockReturnValue({ data: [advisory], isError: false } as unknown as ReturnType<typeof useAdvisories>);
  vi.mocked(useFieldReporters).mockReturnValue({ data: [{ uuid: "inspector-1", name: "Inspector" }], isError: false } as unknown as ReturnType<typeof useFieldReporters>);
  vi.mocked(reportsRepository.listReports).mockReset();
});

describe("Progressive review resilience", () => {
  // Proposal (UX-02): proves a "Send someone" entry opens the decision with Send-someone preselected, and a plain entry does not.
  it("preselects Needs Field Validation only when the entry asks for it", () => {
    const { unmount } = render(<MemoryRouter initialEntries={[{ pathname: "/reports/x", state: { preselectAction: "field" } }]}><ReviewDecisionForm report={base} onRefresh={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole("radio", { name: "Needs Field Validation" })).toBeChecked();
    unmount();
    renderForm();
    expect(screen.getByRole("radio", { name: "Needs Field Validation" })).not.toBeChecked();
  });

  it("scrolls to the decision form for its fragment without preselecting an action", () => {
    const scrollIntoView = vi.fn();
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    const view = render(<MemoryRouter initialEntries={[`/reports/${base.uuid}#review-decision`]}><ReviewDecisionForm report={base} onRefresh={vi.fn()} /></MemoryRouter>);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(screen.getByRole("radio", { name: "Needs Field Validation" })).not.toBeChecked();
    view.unmount();
    if (original) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", original);
    else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  });

  it("holds the draft's expectedVersion across background refreshes", async () => {
    const user = userEvent.setup();
    const { rerender } = renderForm();
    await technical(user);
    rerender(<MemoryRouter><ReviewDecisionForm report={{ ...base, reviewVersion: base.reviewVersion! + 7 }} onRefresh={vi.fn()} /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: base.reviewVersion }));
  });

  it("follows a sibling save when the decision draft is still clean", async () => {
    const user = userEvent.setup();
    const { rerender } = renderForm();
    rerender(<MemoryRouter><ReviewDecisionForm report={{ ...base, reviewVersion: base.reviewVersion! + 1 }} onRefresh={vi.fn()} /></MemoryRouter>);
    await technical(user);
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: base.reviewVersion! + 1 }));
  });

  it("guards a second immediate submit even before mutation state rerenders", async () => {
    const user = userEvent.setup();
    let resolve!: (report: DiseaseReport) => void;
    save.mockReturnValue(new Promise<DiseaseReport>((done) => { resolve = done; }));
    renderForm();
    await technical(user);
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    fireEvent.submit(screen.getByRole("form"));
    fireEvent.submit(screen.getByRole("form"));
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ ...base, reviewVersion: base.reviewVersion! + 1 }));
    expect(await screen.findByText(/Review confirmed/)).toBeInTheDocument();
  });

  it("does not rewind after its own write when a stale sibling refresh arrives", async () => {
    const user = userEvent.setup();
    const { rerender } = renderForm();
    await technical(user);
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save.mock.calls[0][0]).toMatchObject({ expectedVersion: base.reviewVersion });

    rerender(<MemoryRouter><ReviewDecisionForm report={base} onRefresh={vi.fn()} /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.type(screen.getByRole("textbox"), " Follow-up");
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save.mock.calls[1][0]).toMatchObject({ expectedVersion: base.reviewVersion! + 1 });
  });

  it("retains classification, notes and action after a recoverable failure, without false success", async () => {
    const user = userEvent.setup();
    save.mockRejectedValueOnce(new Error("Service unavailable"));
    renderForm();
    await technical(user);
    await user.selectOptions(screen.getByLabelText("Staff-Classified Condition"), "rust");
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("textbox")).toHaveValue("Delivered practical field assistance.");
    expect(screen.getByLabelText("Staff-Classified Condition")).toHaveValue("rust");
    expect(screen.getByRole("radio", { name: "Technical Assistance" })).toBeChecked();
    expect(screen.queryByText(/Review confirmed/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
  });

  it("reconciles a stale draft field by field and never refreshes only the version", async () => {
    const user = userEvent.setup();
    const latest = { ...base, reviewVersion: base.reviewVersion! + 2, reviewNotes: "Updated by the other reviewer." };
    const onRefresh = vi.fn().mockResolvedValue({ data: latest });
    save.mockRejectedValueOnce(new ApiError("Conflict", { status: 409 }));
    renderForm(base, onRefresh);
    await technical(user);
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));

    // The second save is refused, and the draft itself is preserved.
    expect(await screen.findByText(/Another reviewer saved this report/)).toBeInTheDocument();
    expect(await screen.findByRole("table", { name: "Fields that changed on the server" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Review" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("textbox")).toHaveValue("Delivered practical field assistance.");
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    expect(save).toHaveBeenCalledTimes(1);

    // Latest saved and local values are distinguishable before reconciliation.
    const conflictTable = screen.getByRole("table", { name: "Fields that changed on the server" });
    expect(within(conflictTable).getByText("Updated by the other reviewer.")).toBeInTheDocument();
    expect(within(conflictTable).getByText("Delivered practical field assistance.")).toBeInTheDocument();
    expect(within(conflictTable).getByText("No action selected")).toBeInTheDocument();

    // Keep the reviewer's notes and action; take nothing else from the server.
    await user.click(within(conflictTable).getAllByRole("radio", { name: "Mine" })[0]);
    await user.click(within(conflictTable).getAllByRole("radio", { name: "Mine" })[1]);
    await user.click(screen.getByRole("button", { name: "Apply these choices" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));

    // The retained changes submit against the latest version, not the old one.
    expect(save.mock.calls[1][0]).toMatchObject({
      expectedVersion: base.reviewVersion! + 2,
      notes: "Delivered practical field assistance.",
      actionTaken: "technical_assistance_provided",
    });
  });

  it("reloads every field when the reviewer discards the draft after a conflict", async () => {
    const user = userEvent.setup();
    const latest = { ...base, reviewVersion: base.reviewVersion! + 3, reviewNotes: "Updated by the other reviewer." };
    const onRefresh = vi.fn().mockResolvedValue({ data: latest });
    save.mockRejectedValueOnce(new ApiError("Conflict", { status: 409 }));
    renderForm(base, onRefresh);
    await technical(user);
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));

    await user.click(await screen.findByRole("button", { name: "Reload and discard my changes" }));
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("textbox")).toHaveValue("Updated by the other reviewer.");
    expect(screen.queryByRole("radio", { name: "Technical Assistance" })).not.toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("discards the draft support sub-type and advisory when reloading the latest record", async () => {
    const user = userEvent.setup();
    const latest = {
      ...base,
      reviewVersion: base.reviewVersion! + 2,
      actionTaken: "technical_assistance_provided" as const,
      reviewNotes: "Theirs",
    };
    const onRefresh = vi.fn().mockResolvedValue({ data: latest });
    save.mockRejectedValueOnce(new ApiError("Conflict", { status: 409 }));
    renderForm(base, onRefresh);
    await user.click(screen.getByRole("radio", { name: "Provide Advisory or Assistance" }));
    await user.click(screen.getByRole("button", { name: "Next step" }));
    await user.selectOptions(screen.getByLabelText("Validated advisory"), advisory.uuid);
    await user.type(screen.getByRole("textbox"), "Mine");
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));

    // The support sub-type is part of the action, so it is a visible difference.
    const conflictTable = await screen.findByRole("table", { name: "Fields that changed on the server" });
    expect(within(conflictTable).getByRole("rowheader", { name: "Next action" })).toBeInTheDocument();
    expect(within(conflictTable).getAllByText(/Technical Assistance/).length).toBeGreaterThan(0);
    expect(within(conflictTable).getAllByText(/Validated guidance/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Reload and discard my changes" }));
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("radio", { name: "Technical Assistance" })).toBeChecked();
    expect(screen.queryByLabelText("Validated advisory")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save.mock.calls[1][0]).toMatchObject({
      expectedVersion: latest.reviewVersion,
      actionTaken: "technical_assistance_provided",
      notes: "Theirs",
    });
    expect(save.mock.calls[1][0]).not.toHaveProperty("advisoryUuid");
  });

  // Which side keeps each field must survive a trip back to the draft.
  it("keeps the reconciliation choices across step navigation", async () => {
    const user = userEvent.setup();
    const latest = { ...base, reviewVersion: base.reviewVersion! + 2, reviewNotes: "Updated by the other reviewer." };
    const onRefresh = vi.fn().mockResolvedValue({ data: latest });
    save.mockRejectedValueOnce(new ApiError("Conflict", { status: 409 }));
    renderForm(base, onRefresh);
    await technical(user);
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));

    const table = await screen.findByRole("table", { name: "Fields that changed on the server" });
    const notesRow = within(table).getByRole("row", { name: /Review notes/i });
    await user.click(within(notesRow).getByRole("radio", { name: "Mine" }));
    expect(within(notesRow).getByRole("radio", { name: "Mine" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Review decision" }));

    const restored = within(await screen.findByRole("table", { name: "Fields that changed on the server" }))
      .getByRole("row", { name: /Review notes/i });
    expect(within(restored).getByRole("radio", { name: "Mine" })).toBeChecked();
  });

  it("treats a failed comparison read as a failed read, never as the latest saved record", async () => {
    const user = userEvent.setup();
    // TanStack refetch() resolves with the cached record when the read fails.
    const onRefresh = vi.fn().mockResolvedValue({ data: base, isError: true });
    save.mockRejectedValueOnce(new ApiError("Conflict", { status: 409 }));
    renderForm(base, onRefresh);
    await technical(user);
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));

    expect(await screen.findByText(/The latest saved version could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText(/already matches the latest saved values/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Review" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Try loading the latest version again" }));
    expect(onRefresh).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("keeps a stale draft blocked even when its notes are edited", async () => {
    const user = userEvent.setup();
    save.mockRejectedValueOnce(new ApiError("Conflict", { status: 409 }));
    renderForm();
    await technical(user);
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(await screen.findByText(/Another reviewer saved this report/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.type(screen.getByRole("textbox"), " More context.");
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    expect(screen.getByRole("button", { name: "Confirm Review" })).toBeDisabled();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("preserves Closed for both support types and does not offer a silent reopen", async () => {
    const user = userEvent.setup();
    const closed = { ...base, lifecycle: { ...base.lifecycle!, caseState: "closed" as const } };
    const { unmount } = renderForm(closed);
    await technical(user);
    expect(screen.queryByRole("checkbox", { name: "Reopen this case" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    expect(within(screen.getByRole("region", { name: "Review Summary" })).getByText(/the case stays closed/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save.mock.calls[0][0]).not.toHaveProperty("caseState");
    unmount();
    renderForm(closed);
    await user.click(screen.getByRole("radio", { name: "Provide Advisory or Assistance" }));
    await user.click(screen.getByRole("button", { name: "Next step" }));
    await user.selectOptions(screen.getByLabelText("Validated advisory"), advisory.uuid);
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save.mock.calls[1][0]).not.toHaveProperty("caseState");
    expect(save.mock.calls[1][0]).toMatchObject({ actionTaken: "advisory_provided", advisoryUuid: advisory.uuid });
  });

  it("rejects whitespace-only assistance and unable-to-verify notes", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("radio", { name: "Provide Advisory or Assistance" }));
    await user.click(screen.getByRole("button", { name: "Next step" }));
    await user.click(screen.getByRole("radio", { name: "Technical Assistance" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   \n\t" } });
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    expect(screen.queryByText("Meaningful Technical Assistance details are required.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText("Meaningful Technical Assistance details are required.")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Verification Outcome"), "unable_to_verify");
    expect(screen.getByText("Meaningful Technical Assistance details are required.")).toBeInTheDocument();
    expect(screen.queryByText(/Add a note explaining why/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText(/Add a note explaining why/)).toBeInTheDocument();
  });

  // Every error from the failed save stays visible on its step until that error itself is resolved.
  it("keeps each failed-save error until the error itself is resolved", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("radio", { name: "Provide Advisory or Assistance" }));
    await user.click(screen.getByRole("button", { name: "Next step" }));
    await user.selectOptions(screen.getByLabelText("Verification Outcome"), "verified");
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(screen.getByText("Select a validated advisory for Advisory Guidance.")).toBeInTheDocument();
    expect(screen.getByText("Staff-Classified Condition is required for Verified.")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Validated advisory"), advisory.uuid);
    expect(screen.queryByText("Select a validated advisory for Advisory Guidance.")).not.toBeInTheDocument();
    expect(screen.getByText("Staff-Classified Condition is required for Verified.")).toBeInTheDocument();
  });

  // A resolved failed-save error must not come back until the draft is saved again.
  it("does not re-show a resolved failed-save error before the next save", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("radio", { name: "Provide Advisory or Assistance" }));
    await user.click(screen.getByRole("button", { name: "Next step" }));
    await user.selectOptions(screen.getByLabelText("Verification Outcome"), "verified");
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(screen.getByText("Staff-Classified Condition is required for Verified.")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Staff-Classified Condition"), "smut");
    await user.selectOptions(screen.getByLabelText("Staff-Classified Condition"), "");
    expect(screen.queryByText("Staff-Classified Condition is required for Verified.")).not.toBeInTheDocument();
    expect(screen.getByText("Select a validated advisory for Advisory Guidance.")).toBeInTheDocument();
  });

  // The success and server-error outcomes live on the confirmation step, so pending keeps it.
  it("keeps the confirmation step and its outcome visible while the save is in flight", async () => {
    const user = userEvent.setup();
    const { rerender } = renderForm();
    await technical(user);
    await user.click(screen.getByRole("button", { name: "Review decision" }));

    vi.mocked(useUpdateReportReview).mockReturnValue(mutation(null, true));
    rerender(<MemoryRouter><ReviewDecisionForm report={base} onRefresh={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Confirming review..." })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("region", { name: "Review Summary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirming review..." })).toBeInTheDocument();
  });

  it("keeps successful confirmation visible instead of navigating back to the draft", async () => {
    const user = userEvent.setup();
    renderForm();
    await technical(user);
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));

    const success = await screen.findByText(`${base.referenceCode} — Review confirmed.`);
    const back = screen.getByRole("button", { name: "Back" });
    expect(back).toBeDisabled();
    await user.click(back);
    expect(screen.getByRole("heading", { name: "Review Summary" })).toBeInTheDocument();
    expect(success).toBeInTheDocument();
  });

  it("does not present completed field validation as a future visit after conflict resolution", async () => {
    const user = userEvent.setup();
    const latest = {
      ...base,
      reviewVersion: base.reviewVersion! + 7,
      actionTaken: "referred_for_expert_validation" as const,
      lifecycle: { ...base.lifecycle!, fieldValidationState: "completed" as const },
      fieldValidationAssignment: {
        uuid: "assignment-1",
        assignee: { uuid: "inspector-2", name: "Past Inspector" },
        assignedBy: { uuid: "reviewer-1", name: "Reviewer" },
        targetVisitDate: "2026-10-01",
        activatedAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-10-02T00:00:00.000Z",
      },
    };
    const onRefresh = vi.fn().mockResolvedValue({ data: latest });
    save.mockRejectedValueOnce(new ApiError("Conflict", { status: 409 }));
    renderForm(base, onRefresh);
    await technical(user);
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    await user.click(await screen.findByRole("button", { name: "Reload and discard my changes" }));

    const summary = screen.getByRole("region", { name: "Review Summary" });
    expect(summary).toHaveTextContent(/field validation is already complete, so no new visit will be assigned/i);
    expect(summary).not.toHaveTextContent("Past Inspector");
    expect(summary).not.toHaveTextContent("2026-10-01");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("status")).toHaveTextContent("Field validation is already complete; no new visit will be assigned.");
    expect(screen.queryByLabelText("Field Inspector assignee")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Target visit date (optional)")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save.mock.calls[1][0]).not.toHaveProperty("fieldValidationAssigneeUuid");
    expect(save.mock.calls[1][0]).not.toHaveProperty("fieldValidationTargetDate");
  });

  // An active assignment survives confirmation, so the consequence must name it, not the draft.
  it("names the assignment the confirmation preserves", async () => {
    const user = userEvent.setup();
    const assigned = {
      ...base,
      reviewVersion: base.reviewVersion! + 6,
      lifecycle: { ...base.lifecycle!, fieldValidationState: "assigned" as const },
      fieldValidationAssignment: {
        uuid: "assignment-1",
        assignee: { uuid: "inspector-2", name: "Assigned Inspector" },
        assignedBy: { uuid: "reviewer-1", name: "Reviewer" },
        targetVisitDate: "2026-12-01",
        activatedAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
      },
    };
    const { rerender } = renderForm();
    await user.click(screen.getByRole("radio", { name: "Needs Field Validation" }));
    await user.click(screen.getByRole("button", { name: "Next step" }));
    await user.selectOptions(screen.getByLabelText("Field Inspector assignee"), "inspector-1");
    rerender(<MemoryRouter><ReviewDecisionForm report={assigned} onRefresh={vi.fn()} /></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: "Review decision" }));
    const summary = screen.getByRole("region", { name: "Review Summary" });
    expect(summary).toHaveTextContent(/Assigned Inspector/);
    expect(summary).toHaveTextContent(/on 2026-12-01/);

    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save.mock.calls[0][0]).toMatchObject({ caseState: "open" });
    expect(save.mock.calls[0][0]).not.toHaveProperty("fieldValidationAssigneeUuid");
  });

  it("does not offer conflicting draft assignment values over an active assignment", async () => {
    const user = userEvent.setup();
    const assigned = {
      ...base,
      reviewVersion: base.reviewVersion! + 4,
      reviewNotes: "Updated by the other reviewer.",
      lifecycle: { ...base.lifecycle!, fieldValidationState: "assigned" as const },
      fieldValidationAssignment: {
        uuid: "assignment-1",
        assignee: { uuid: "inspector-2", name: "Assigned Inspector" },
        assignedBy: { uuid: "reviewer-1", name: "Reviewer" },
        targetVisitDate: "2026-12-01",
        activatedAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
      },
    };
    const onRefresh = vi.fn().mockResolvedValue({ data: assigned });
    save.mockRejectedValueOnce(new ApiError("Conflict", { status: 409 }));
    const { rerender } = renderForm(base, onRefresh);
    await user.click(screen.getByRole("radio", { name: "Needs Field Validation" }));
    await user.click(screen.getByRole("button", { name: "Next step" }));
    await user.selectOptions(screen.getByLabelText("Field Inspector assignee"), "inspector-1");
    fireEvent.change(screen.getByLabelText("Target visit date (optional)"), { target: { value: "2026-11-20" } });
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));

    await screen.findByRole("table", { name: "Fields that changed on the server" });
    rerender(<MemoryRouter><ReviewDecisionForm report={assigned} onRefresh={onRefresh} /></MemoryRouter>);
    const table = screen.getByRole("table", { name: "Fields that changed on the server" });
    expect(within(table).queryByRole("row", { name: /Field Inspector/i })).not.toBeInTheDocument();
    expect(within(table).queryByRole("row", { name: /Visit by/i })).not.toBeInTheDocument();
    const notesRow = within(table).getByRole("row", { name: /Review notes/i });
    await user.click(within(notesRow).getByRole("radio", { name: "Mine" }));
    await user.click(screen.getByRole("button", { name: "Apply these choices" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    expect(screen.getByRole("region", { name: "Review Summary" })).toHaveTextContent(/Assigned Inspector/);
    expect(screen.getByRole("region", { name: "Review Summary" })).toHaveTextContent(/2026-12-01/);

    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save.mock.calls[1][0]).not.toHaveProperty("fieldValidationAssigneeUuid");
    expect(save.mock.calls[1][0]).not.toHaveProperty("fieldValidationTargetDate");
  });

  it("shows one decision sentence and keeps review notes verbatim in a separate quote", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("radio", { name: "Provide Advisory or Assistance" }));
    await user.click(screen.getByRole("button", { name: "Next step" }));
    await user.selectOptions(screen.getByLabelText("Validated advisory"), advisory.uuid);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "First line.\n  Indented second line." },
    });
    await user.click(screen.getByRole("button", { name: "Review decision" }));

    const summary = screen.getByRole("region", { name: "Review Summary" });
    const sentence = summary.querySelector("p.review-consequence");
    expect(sentence).toHaveTextContent(/Provide Advisory or Assistance.*Validated guidance.*Staff finding:.*AI Possible Condition/);
    expect(sentence?.textContent?.match(/[.!?]/g)).toEqual(["."]);
    expect(within(summary).getByText("Review notes")).toBeInTheDocument();
    expect(within(summary).getByRole("blockquote").textContent).toBe("First line.\n  Indented second line.");
  });

  // A failed save flags only the step it failed on; advancing must not reveal new errors.
  it("holds validation feedback to the step and draft that failed to save", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Next step" }));
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(screen.getByText("Choose what should happen next.")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();

    await user.click(screen.getByRole("radio", { name: "Provide Advisory or Assistance" }));
    await user.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.queryByText("Choose what should happen next.")).not.toBeInTheDocument();
    expect(screen.queryByText("Select a validated advisory for Advisory Guidance.")).not.toBeInTheDocument();
  });

  // A field-validation action always saves Not Determined, so the summary must say so too.
  it("states the verification outcome that confirmation will send", async () => {
    const user = userEvent.setup();
    const latest = {
      ...base,
      reviewVersion: base.reviewVersion! + 5,
      actionTaken: "referred_for_expert_validation" as const,
      lifecycle: { ...base.lifecycle!, verificationOutcome: "verified" as const },
    };
    const onRefresh = vi.fn().mockResolvedValue({ data: latest });
    save.mockRejectedValueOnce(new ApiError("Conflict", { status: 409 }));
    renderForm(base, onRefresh);
    await user.click(screen.getByRole("radio", { name: "Needs Field Validation" }));
    await user.click(screen.getByRole("button", { name: "Next step" }));
    await user.selectOptions(screen.getByLabelText("Field Inspector assignee"), "inspector-1");
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    await user.click(await screen.findByRole("button", { name: "Reload and discard my changes" }));

    const summary = screen.getByRole("region", { name: "Review Summary" });
    expect(summary).toHaveTextContent(/not determined/i);
    expect(summary).not.toHaveTextContent(/verified/i);

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Verification Outcome")).toHaveValue("not_determined");
    await user.selectOptions(screen.getByLabelText("Field Inspector assignee"), "inspector-1");
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save.mock.calls[1][0]).toMatchObject({
      expectedVersion: latest.reviewVersion,
      verificationOutcome: "not_determined",
      caseState: "open",
      fieldValidationState: "assigned",
      fieldValidationAssigneeUuid: "inspector-1",
    });
  });

  it("keeps conflict verification aligned with the effective field-validation outcome", async () => {
    const user = userEvent.setup();
    const firstLatest = {
      ...base,
      reviewVersion: base.reviewVersion! + 5,
      actionTaken: "advisory_provided" as const,
      lifecycle: { ...base.lifecycle!, verificationOutcome: "verified" as const },
    };
    const secondLatest = {
      ...base,
      reviewVersion: base.reviewVersion! + 6,
      actionTaken: "referred_for_expert_validation" as const,
      reviewNotes: "Updated again by another reviewer.",
      lifecycle: { ...base.lifecycle!, verificationOutcome: "not_determined" as const },
    };
    const onRefresh = vi.fn()
      .mockResolvedValueOnce({ data: firstLatest })
      .mockResolvedValueOnce({ data: secondLatest });
    save.mockRejectedValueOnce(new ApiError("Conflict", { status: 409 }))
      .mockRejectedValueOnce(new ApiError("Conflict", { status: 409 }));
    renderForm(base, onRefresh);
    await user.click(screen.getByRole("radio", { name: "Needs Field Validation" }));
    await user.click(screen.getByRole("button", { name: "Next step" }));
    await user.selectOptions(screen.getByLabelText("Field Inspector assignee"), "inspector-1");
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));

    const firstTable = await screen.findByRole("table", { name: "Fields that changed on the server" });
    await user.click(within(within(firstTable).getByRole("row", { name: /Next action/i })).getByRole("radio", { name: "Mine" }));
    await user.click(within(within(firstTable).getByRole("row", { name: /Verification Outcome/i })).getByRole("radio", { name: "Latest" }));
    await user.click(screen.getByRole("button", { name: "Apply these choices" }));
    expect(screen.getByRole("region", { name: "Review Summary" })).toHaveTextContent(/not determined/i);

    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    const secondTable = await screen.findByRole("table", { name: "Fields that changed on the server" });
    expect(within(secondTable).queryByRole("row", { name: /Verification Outcome/i })).not.toBeInTheDocument();
    expect(within(secondTable).getByRole("row", { name: /Review notes/i })).toBeInTheDocument();
  });

  // Conflict resolution can land the saved closure choice on the review screen with
  // its confirmation unticked; a failed confirmation must expose that field.
  it("routes a failed confirmation back to the step that holds the invalid choice", async () => {
    const user = userEvent.setup();
    const latest = {
      ...base,
      reviewVersion: base.reviewVersion! + 4,
      actionTaken: "no_further_action_required" as const,
    };
    const onRefresh = vi.fn().mockResolvedValue({ data: latest });
    save.mockRejectedValueOnce(new ApiError("Conflict", { status: 409 }));
    renderForm(base, onRefresh);
    await technical(user);
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    await user.click(await screen.findByRole("button", { name: "Reload and discard my changes" }));

    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save).toHaveBeenCalledTimes(1);
    const closeConfirmation = screen.getByRole("checkbox", { name: "Close this case" });
    expect(closeConfirmation).not.toBeChecked();
    expect(screen.getByText("Confirm that you want to close this case.")).toBeInTheDocument();

    await user.click(closeConfirmation);
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save.mock.calls[1][0]).toMatchObject({
      expectedVersion: latest.reviewVersion,
      actionTaken: "no_further_action_required",
      caseState: "closed",
    });
  });

  it("takes the next case in the original filtered/sorted queue snapshot and returns to the exact URL", async () => {
    const user = userEvent.setup();
    const queue = "/reports?queue=needs_review&barangay=Balaytigui&sort=oldest&page=2";
    const next = { ...base, uuid: "next-case", referenceCode: "CG-NEXT" };
    render(<MemoryRouter initialEntries={[queue]}><Routes>
      <Route path="/reports" element={<ReportTable reports={[base, next]} />} />
      <Route path={`/reports/${base.uuid}`} element={<ReviewDecisionForm report={base} onRefresh={vi.fn()} />} />
      <Route path="/reports/next-case" element={<Destination />} />
    </Routes></MemoryRouter>);
    await user.click(screen.getByRole("link", { name: `Open ${base.referenceCode}` }));
    await technical(user);
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(await screen.findByRole("link", { name: "Return to Queue" })).toHaveAttribute("href", queue);
    await user.click(screen.getByRole("button", { name: "Review Next Case" }));
    expect(await screen.findByText("Next case")).toBeInTheDocument();
    expect(screen.getByTestId("queue-context")).toHaveTextContent('"queue":"needs_review"');
    expect(screen.getByTestId("queue-context")).toHaveTextContent('"sort":"oldest"');
    expect(reportsRepository.listReports).not.toHaveBeenCalled();
  });

  it("does not escape a calendar or assessment snapshot into an unrelated report queue", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={[{ pathname: `/reports/${base.uuid}`, state: { reviewQueue: {
      returnTo: "/todo", filters: {}, remainingIds: [], reviewedIds: [], snapshotOnly: true,
    } } }]}><ReviewDecisionForm report={base} onRefresh={vi.fn()} /></MemoryRouter>);
    await technical(user);
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    await user.click(await screen.findByRole("button", { name: "Review Next Case" }));
    expect(await screen.findByText("No more cases in this queue.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to Queue" })).toHaveAttribute("href", "/todo");
    expect(reportsRepository.listReports).not.toHaveBeenCalled();
  });

  it("keeps stating the snapshot boundary after Review Next moves to the next loaded case", async () => {
    const user = userEvent.setup();
    const next = { ...base, uuid: "next-case", referenceCode: "CG-NEXT" };
    render(<MemoryRouter initialEntries={[{ pathname: `/reports/${base.uuid}`, state: { reviewQueue: {
      returnTo: "/todo", filters: {}, remainingIds: [next.uuid], reviewedIds: [],
      snapshotOnly: true, snapshotTruncated: true,
    } } }]}><Routes>
      <Route path={`/reports/${base.uuid}`} element={<ReviewDecisionForm report={base} onRefresh={vi.fn()} />} />
      <Route path={`/reports/${next.uuid}`} element={<ReviewDecisionForm report={next} onRefresh={vi.fn()} />} />
    </Routes></MemoryRouter>);
    await technical(user);
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    await user.click(await screen.findByRole("button", { name: "Review Next Case" }));

    await technical(user);
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    await user.click(await screen.findByRole("button", { name: "Review Next Case" }));
    expect(await screen.findByText(/Review Next covers this section's loaded cases only/)).toBeInTheDocument();
    expect(screen.queryByText("No more cases in this queue.")).not.toBeInTheDocument();
    expect(reportsRepository.listReports).not.toHaveBeenCalled();
  });

  it("rescans only the same context at a page boundary, skipping already reviewed cases", async () => {
    const user = userEvent.setup();
    const context = { returnTo: "/monitoring?queue=upcoming&sort=due_soonest", filters: { queue: "upcoming", sort: "due_soonest" }, remainingIds: [], reviewedIds: [] };
    vi.mocked(reportsRepository.listReports).mockResolvedValue({ reports: [base, { ...base, uuid: "next-case" }], meta: { currentPage: 1, lastPage: 1, perPage: 15, total: 2, from: 1, to: 2 } });
    render(<MemoryRouter initialEntries={[{ pathname: `/reports/${base.uuid}`, state: { reviewQueue: context } }]}><Routes>
      <Route path={`/reports/${base.uuid}`} element={<ReviewDecisionForm report={base} onRefresh={vi.fn()} />} />
      <Route path="/reports/next-case" element={<Destination />} />
    </Routes></MemoryRouter>);
    await technical(user);
    await user.click(screen.getByRole("button", { name: "Review decision" }));
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    await user.click(await screen.findByRole("button", { name: "Review Next Case" }));
    expect(reportsRepository.listReports).toHaveBeenCalledWith({ ...context.filters, page: 1 });
    expect(await screen.findByText("Next case")).toBeInTheDocument();
  });
});

describe("online-only review writes", () => {
  it("refuses to confirm an offline review and never claims a saved draft", async () => {
    const user = userEvent.setup();
    const online = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    renderForm();

    await technical(user);
    await user.click(screen.getByRole("button", { name: "Review decision" }));

    expect(screen.getByText(/CaneGuard is offline/)).toBeInTheDocument();
    expect(screen.getByText(/not queued to send later/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Review" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByText(/Review confirmed/)).not.toBeInTheDocument();
    online.mockRestore();
  });

  it("asks the reviewer to check the latest evidence after reconnecting", async () => {
    const online = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    const user = userEvent.setup();
    renderForm();

    await technical(user);
    online.mockReturnValue(false);
    act(() => { window.dispatchEvent(new Event("offline")); });
    online.mockReturnValue(true);
    act(() => { window.dispatchEvent(new Event("online")); });
    await user.click(screen.getByRole("button", { name: "Review decision" }));

    expect(screen.getByText(/You are back online/)).toBeInTheDocument();
    expect(screen.getByText(/nothing was sent while you were offline/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Review" })).toBeEnabled();
    online.mockRestore();
  });
});
