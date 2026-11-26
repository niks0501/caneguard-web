import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/ApiError";
import { mapReportDetail } from "../../data/api/mappers/report.mapper";
import { reportDetailResponseSchema } from "../../data/api/schemas/report.schema";
import type { Advisory, DiseaseReport } from "../../domain/report.types";
import { useFieldReporters } from "../../hooks/useFieldReporters";
import { reportsRepository } from "../../services/reports.service";
import { reportDetailDto } from "../../test/fixtures";
import { ReviewDecisionForm } from "./ReviewDecisionForm";

// The real advisory hooks and query cache run here; only the repository is faked.
vi.mock("../../hooks/useFieldReporters", () => ({ useFieldReporters: vi.fn() }));
vi.mock("../../services/reports.service", () => ({
  reportsRepository: {
    listAdvisories: vi.fn(),
    createAdvisory: vi.fn(),
    updateAdvisory: vi.fn(),
    deleteAdvisory: vi.fn(),
    updateReview: vi.fn(),
    getReportById: vi.fn(),
    listReports: vi.fn(),
  },
}));

const base = mapReportDetail(reportDetailResponseSchema.parse({ data: reportDetailDto }).data);
const guidance: Advisory = { uuid: "adv-1", code: "ADV-GENERAL-001", title: "Document and monitor rows", content: "Mark the rows and revisit them.", status: "validated", category: "general" };
const other: Advisory = { uuid: "adv-2", code: "ADV-RUST-001", title: "Manage rust early", content: "Scout the neighbouring rows.", status: "validated", category: "rust" };

let library: Advisory[];
let used: Set<string>;

function renderForm(report: DiseaseReport = base) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter>
    <ReviewDecisionForm report={report} onRefresh={vi.fn()} />
  </MemoryRouter></QueryClientProvider>);
}

async function openAdvisoryStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: "Provide Advisory or Assistance" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
}

beforeEach(() => {
  library = [guidance, other];
  used = new Set();
  vi.mocked(useFieldReporters).mockReturnValue({ data: [], isError: false } as unknown as ReturnType<typeof useFieldReporters>);
  vi.mocked(reportsRepository.listAdvisories).mockReset().mockImplementation(async () => library.map((item) => ({ ...item })));
  vi.mocked(reportsRepository.createAdvisory).mockReset().mockImplementation(async (input) => {
    const created: Advisory = { uuid: `adv-new-${library.length}`, code: "ADV-MOSAIC-001", title: input.title.trim(), content: input.content.trim(), status: "validated", category: input.category ?? null };
    library = [...library, created];
    return created;
  });
  vi.mocked(reportsRepository.updateAdvisory).mockReset().mockImplementation(async (uuid, input) => {
    const next = { ...library.find((item) => item.uuid === uuid)!, ...(input.title !== undefined ? { title: input.title } : {}) };
    library = library.map((item) => (item.uuid === uuid ? next : item));
    return next;
  });
  vi.mocked(reportsRepository.deleteAdvisory).mockReset().mockImplementation(async (uuid) => {
    library = library.filter((item) => item.uuid !== uuid);
    return { uuid, deleted: used.has(uuid) ? "archived" : "hard" };
  });
  vi.mocked(reportsRepository.updateReview).mockReset().mockImplementation(async () => ({ ...base, reviewVersion: base.reviewVersion! + 1 }));
  vi.mocked(reportsRepository.getReportById).mockReset().mockResolvedValue(base);
});

describe("Advisory library inside the case decision", () => {
  it("lets a reviewer add the first advisory from an empty library, send it and confirm the decision", async () => {
    const user = userEvent.setup();
    library = [];
    renderForm();
    await openAdvisoryStep(user);

    expect(await screen.findByText("No advisories yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New advisory" }));
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Rogue out mosaic plants");
    await user.selectOptions(screen.getByLabelText("Topic"), "mosaic");
    await user.type(screen.getByLabelText("Guidance"), "Remove mottled plants early.");
    await user.click(screen.getByRole("button", { name: "Save & select" }));

    expect(await screen.findByRole("radio", { name: /Rogue out mosaic plants/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Advice")).toBeInTheDocument();
    expect(screen.getByText(/ADV-MOSAIC-001 - Rogue out mosaic plants/, { selector: "span" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm decision" }));

    await waitFor(() => expect(reportsRepository.updateReview).toHaveBeenCalledTimes(1));
    expect(vi.mocked(reportsRepository.updateReview).mock.calls[0][1]).toMatchObject({
      actionTaken: "advisory_provided", advisoryUuid: "adv-new-0",
    });
  });

  it("keeps the selection when the advisory is reworded", async () => {
    const user = userEvent.setup();
    renderForm();
    await openAdvisoryStep(user);
    await user.click(await screen.findByRole("radio", { name: /Document and monitor rows/ }));
    await user.click(screen.getByRole("button", { name: "Edit Document and monitor rows" }));
    await user.clear(screen.getByRole("textbox", { name: "Title" }));
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Monitor rows weekly");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("radio", { name: /Monitor rows weekly/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Confirm decision" }));
    await waitFor(() => expect(reportsRepository.updateReview).toHaveBeenCalled());
    expect(vi.mocked(reportsRepository.updateReview).mock.calls[0][1]).toMatchObject({ advisoryUuid: "adv-1" });
  });

  it("clears the picked advisory when it is deleted and then asks for another before moving on", async () => {
    const user = userEvent.setup();
    renderForm();
    await openAdvisoryStep(user);
    await user.click(await screen.findByRole("radio", { name: /Document and monitor rows/ }));
    await user.click(screen.getByRole("button", { name: "Delete Document and monitor rows" }));
    await user.click(screen.getByRole("button", { name: "Delete advisory" }));
    expect(await screen.findByText("Advisory removed.")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Document and monitor rows/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Confirm decision" }));
    expect(screen.getByText("Pick an advisory to send.")).toBeInTheDocument();
    expect(reportsRepository.updateReview).not.toHaveBeenCalled();
  });

  it("tells the reviewer a used advisory was archived", async () => {
    const user = userEvent.setup();
    used.add("adv-2");
    renderForm();
    await openAdvisoryStep(user);
    await user.click(await screen.findByRole("radio", { name: /Manage rust early/ }));
    await user.click(screen.getByRole("button", { name: "Delete Manage rust early" }));
    await user.click(screen.getByRole("button", { name: "Delete advisory" }));
    expect(await screen.findByText("Advisory archived. Past cases keep their wording.")).toBeInTheDocument();
  });

  it("pre-selects the advisory a revisited case already carries and sends it without re-picking", async () => {
    const user = userEvent.setup();
    renderForm({ ...base, actionTaken: "advisory_provided", advisory: { ...other, selectedAt: "2026-10-01T02:00:00.000Z", deliveryState: "pending" } });
    await openAdvisoryStep(user);
    expect(await screen.findByRole("radio", { name: /Manage rust early/ })).toBeChecked();
    expect(screen.getByRole("region", { name: "Selected advisory" })).toHaveTextContent("Scout the neighbouring rows.");

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Confirm decision" }));
    await waitFor(() => expect(reportsRepository.updateReview).toHaveBeenCalled());
    expect(vi.mocked(reportsRepository.updateReview).mock.calls[0][1]).toMatchObject({ advisoryUuid: "adv-2" });
  });

  it("shows the removed-from-library refusal on the picker, reloads the list and clears the stale pick", async () => {
    const user = userEvent.setup();
    const message = "This advisory was removed from the office library. Pick another one.";
    renderForm();
    await openAdvisoryStep(user);
    await user.click(await screen.findByRole("radio", { name: /Document and monitor rows/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    // Another reviewer deletes it before this reviewer confirms.
    library = library.filter((item) => item.uuid !== "adv-1");
    vi.mocked(reportsRepository.updateReview).mockRejectedValueOnce(
      new ApiError("The given data was invalid.", { status: 422, code: "VALIDATION_ERROR", errors: { advisory_uuid: [message] } }),
    );
    const listCalls = vi.mocked(reportsRepository.listAdvisories).mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Confirm decision" }));

    const alert = await screen.findByText(message);
    expect(alert.closest(".advisory-picker")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Action details" })).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(reportsRepository.listAdvisories).mock.calls.length).toBeGreaterThan(listCalls));
    await waitFor(() => expect(screen.queryByRole("radio", { name: /Document and monitor rows/ })).not.toBeInTheDocument());
    expect(screen.getByRole("radio", { name: /Manage rust early/ })).not.toBeChecked();

    await user.click(screen.getByRole("radio", { name: /Manage rust early/ }));
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Confirm decision" }));
    await waitFor(() => expect(reportsRepository.updateReview).toHaveBeenCalledTimes(2));
    expect(vi.mocked(reportsRepository.updateReview).mock.calls[1][1]).toMatchObject({ advisoryUuid: "adv-2" });
  });

  it("keeps the library error and its retry inside the picker", async () => {
    const user = userEvent.setup();
    vi.mocked(reportsRepository.listAdvisories).mockRejectedValueOnce(new Error("offline"));
    renderForm();
    await openAdvisoryStep(user);
    expect(await screen.findByText("The advisory library could not be loaded.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry advisories" }));
    expect(await screen.findByRole("radio", { name: /Document and monitor rows/ })).toBeInTheDocument();
  });
});
