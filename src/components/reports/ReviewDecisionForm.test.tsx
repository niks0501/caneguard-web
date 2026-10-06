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

  it("blocks stale retry until an explicit refresh returns a new version; keeps the draft", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn().mockResolvedValue({ data: { ...base, reviewVersion: base.reviewVersion! + 2 } });
    const { rerender } = renderForm(base, onRefresh);
    await technical(user);
    vi.mocked(useUpdateReportReview).mockReturnValue(mutation(new ApiError("Conflict", { status: 409 })));
    rerender(<MemoryRouter><ReviewDecisionForm report={base} onRefresh={onRefresh} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Confirm Review" })).toBeDisabled();
    expect(screen.getByText(/Refresh the case before saving again/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh report" }));
    expect(onRefresh).toHaveBeenCalledOnce();
    vi.mocked(useUpdateReportReview).mockReturnValue(mutation());
    rerender(<MemoryRouter><ReviewDecisionForm report={base} onRefresh={onRefresh} /></MemoryRouter>);
    expect(screen.getByRole("textbox")).toHaveValue("Delivered practical field assistance.");
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: base.reviewVersion! + 2 }));
  });

  it("keeps a stale draft blocked even when its notes are edited", async () => {
    const user = userEvent.setup();
    save.mockRejectedValueOnce(new ApiError("Conflict", { status: 409 }));
    renderForm();
    await technical(user);
    await user.click(screen.getByRole("button", { name: "Confirm Review" }));
    expect(await screen.findByRole("button", { name: "Refresh report" })).toBeInTheDocument();
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
