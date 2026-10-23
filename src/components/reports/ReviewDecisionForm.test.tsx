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
function mutation(error: ApiError | null = null) {
  return { mutateAsync: save, reset, error, isError: !!error, isPending: false } as unknown as ReturnType<typeof useUpdateReportReview>;
}
function renderForm(report = base, onRefresh = vi.fn()) {
  return render(<MemoryRouter><ReviewDecisionForm report={report} onRefresh={onRefresh} /></MemoryRouter>);
}
async function technical(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: "Provide Advisory or Assistance" }));
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
  it("holds the draft's expectedVersion across background refreshes", async () => {
    const user = userEvent.setup();
    const { rerender } = renderForm();
    await technical(user);
    rerender(<MemoryRouter><ReviewDecisionForm report={{ ...base, reviewVersion: base.reviewVersion! + 7 }} onRefresh={vi.fn()} /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: base.reviewVersion }));
  });

  it("guards a second immediate submit even before mutation state rerenders", async () => {
    const user = userEvent.setup();
    let resolve!: (report: DiseaseReport) => void;
    save.mockReturnValue(new Promise<DiseaseReport>((done) => { resolve = done; }));
    renderForm();
    await technical(user);
    fireEvent.submit(screen.getByRole("form"));
    fireEvent.submit(screen.getByRole("form"));
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ ...base, reviewVersion: base.reviewVersion! + 1 }));
    expect(await screen.findByText(/Review confirmed/)).toBeInTheDocument();
  });

  it("retains classification, notes and action after a recoverable failure, without false success", async () => {
    const user = userEvent.setup();
    save.mockRejectedValueOnce(new Error("Service unavailable"));
    renderForm();
    await technical(user);
    await user.selectOptions(screen.getByLabelText("Staff-Classified Condition"), "rust");
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("textbox")).toHaveValue("Delivered practical field assistance.");
    expect(screen.getByLabelText("Staff-Classified Condition")).toHaveValue("rust");
    expect(screen.getByRole("radio", { name: "Technical Assistance" })).toBeChecked();
    expect(screen.queryByText(/Review confirmed/)).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));

    // The second save is refused, and the draft itself is preserved.
    expect(await screen.findByText(/Another reviewer saved this report/)).toBeInTheDocument();
    expect(await screen.findByRole("table", { name: "Fields that changed on the server" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Review" })).toBeDisabled();
    expect(screen.getByRole("textbox")).toHaveValue("Delivered practical field assistance.");
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
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));

    await user.click(await screen.findByRole("button", { name: "Reload and discard my changes" }));

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
    await user.selectOptions(screen.getByLabelText("Validated advisory"), advisory.uuid);
    await user.type(screen.getByRole("textbox"), "Mine");
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));

    // The support sub-type is part of the action, so it is a visible difference.
    const conflictTable = await screen.findByRole("table", { name: "Fields that changed on the server" });
    expect(within(conflictTable).getByRole("rowheader", { name: "Next action" })).toBeInTheDocument();
    expect(within(conflictTable).getAllByText(/Technical Assistance/).length).toBeGreaterThan(0);
    expect(within(conflictTable).getAllByText(/Validated guidance/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Reload and discard my changes" }));

    expect(screen.getByRole("radio", { name: "Technical Assistance" })).toBeChecked();
    expect(screen.queryByLabelText("Validated advisory")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save.mock.calls[1][0]).toMatchObject({
      expectedVersion: latest.reviewVersion,
      actionTaken: "technical_assistance_provided",
      notes: "Theirs",
    });
    expect(save.mock.calls[1][0]).not.toHaveProperty("advisoryUuid");
  });

  it("treats a failed comparison read as a failed read, never as the latest saved record", async () => {
    const user = userEvent.setup();
    // TanStack refetch() resolves with the cached record when the read fails.
    const onRefresh = vi.fn().mockResolvedValue({ data: base, isError: true });
    save.mockRejectedValueOnce(new ApiError("Conflict", { status: 409 }));
    renderForm(base, onRefresh);
    await technical(user);
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
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(await screen.findByText(/Another reviewer saved this report/)).toBeInTheDocument();
    await user.type(screen.getByRole("textbox"), " More context.");
    expect(screen.getByRole("button", { name: "Confirm Review" })).toBeDisabled();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("preserves Closed for both support types and does not offer a silent reopen", async () => {
    const user = userEvent.setup();
    const closed = { ...base, lifecycle: { ...base.lifecycle!, caseState: "closed" as const } };
    const { unmount } = renderForm(closed);
    await technical(user);
    expect(screen.queryByRole("checkbox", { name: "Reopen this case" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Review Summary" })).getByText("Closed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save.mock.calls[0][0]).not.toHaveProperty("caseState");
    unmount();
    renderForm(closed);
    await user.click(screen.getByRole("radio", { name: "Provide Advisory or Assistance" }));
    await user.selectOptions(screen.getByLabelText("Validated advisory"), advisory.uuid);
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save.mock.calls[1][0]).not.toHaveProperty("caseState");
    expect(save.mock.calls[1][0]).toMatchObject({ actionTaken: "advisory_provided", advisoryUuid: advisory.uuid });
  });

  it("rejects whitespace-only assistance and unable-to-verify notes", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("radio", { name: "Provide Advisory or Assistance" }));
    await user.click(screen.getByRole("radio", { name: "Technical Assistance" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   \n\t" } });
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText("Meaningful Technical Assistance details are required.")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Verification Outcome"), "unable_to_verify");
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText(/Add a note explaining why/)).toBeInTheDocument();
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
      returnTo: "/needs-assessment", filters: {}, remainingIds: [], reviewedIds: [], snapshotOnly: true,
    } } }]}><ReviewDecisionForm report={base} onRefresh={vi.fn()} /></MemoryRouter>);
    await technical(user);
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    await user.click(await screen.findByRole("button", { name: "Review Next Case" }));
    expect(await screen.findByText("No more cases in this queue.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to Queue" })).toHaveAttribute("href", "/needs-assessment");
    expect(reportsRepository.listReports).not.toHaveBeenCalled();
  });

  it("keeps stating the snapshot boundary after Review Next moves to the next loaded case", async () => {
    const user = userEvent.setup();
    const next = { ...base, uuid: "next-case", referenceCode: "CG-NEXT" };
    render(<MemoryRouter initialEntries={[{ pathname: `/reports/${base.uuid}`, state: { reviewQueue: {
      returnTo: "/needs-assessment", filters: {}, remainingIds: [next.uuid], reviewedIds: [],
      snapshotOnly: true, snapshotTruncated: true,
    } } }]}><Routes>
      <Route path={`/reports/${base.uuid}`} element={<ReviewDecisionForm report={base} onRefresh={vi.fn()} />} />
      <Route path={`/reports/${next.uuid}`} element={<ReviewDecisionForm report={next} onRefresh={vi.fn()} />} />
    </Routes></MemoryRouter>);
    await technical(user);
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    await user.click(await screen.findByRole("button", { name: "Review Next Case" }));

    await technical(user);
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

    expect(screen.getByText(/You are back online/)).toBeInTheDocument();
    expect(screen.getByText(/nothing was sent while you were offline/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Review" })).toBeEnabled();
    online.mockRestore();
  });
});
