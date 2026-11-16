import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiseaseReport } from "../domain/report.types";
import { useFieldReporters } from "../hooks/useFieldReporters";
import { useReportsQueue, useUpdateReportReview } from "../hooks/useReports";
import { TodoPage } from "./TodoPage";

vi.mock("../hooks/useReports", () => ({ useReportsQueue: vi.fn(), useUpdateReportReview: vi.fn() }));
vi.mock("../hooks/useFieldReporters", () => ({ useFieldReporters: vi.fn() }));

function report(uuid: string, assignee?: { uuid: string; name: string }, targetVisitDate?: string): DiseaseReport {
  return {
    uuid, referenceCode: "CG-" + uuid, barangay: "Mabini", farmReference: "Farm " + uuid, submittedByName: "Inspector",
    submitterRole: "field_reporter", capturedAt: "2026-11-01T00:00:00Z", submittedAt: "2026-11-01T00:00:00Z", predictedDisease: "rust",
    imageStatus: "unavailable", symptoms: [], reviewStatus: "for_field_validation", reviewVersion: 4,
    lifecycle: { caseState: "open", verificationOutcome: "not_determined", fieldValidationState: assignee ? "assigned" : "unassigned", referralState: "not_referred" },
    latestValidation: null,
    ...(assignee ? { fieldValidationAssignment: { assignee, targetVisitDate: targetVisitDate ?? null } as never } : {}),
  };
}

function read(reports: DiseaseReport[], truncated = false) {
  return {
    data: { reports, total: truncated ? reports.length + 40 : reports.length, truncated, loadedPages: 1 },
    error: null, isError: false, isFetching: false, isPending: false, isRefetchError: false,
    dataUpdatedAt: Date.UTC(2026, 10, 16, 4), refetch: vi.fn(),
  } as never;
}

const ana = { uuid: "ana", name: "Ana Reyes" };
const ben = { uuid: "ben", name: "Ben Cruz" };
const mutateAsync = vi.fn();

function setup(options: { truncated?: boolean; inspectors?: { uuid: string; name: string }[] } = {}) {
  const unassigned = report("fresh");
  const waiting = report("waiting", ana, "2026-12-30");
  const late = report("late", ana, "2020-01-01");
  vi.mocked(useReportsQueue).mockImplementation((filters) => {
    if (filters?.queue === "needs_visit") return read([unassigned, waiting], options.truncated);
    if (filters?.queue === "follow_up_due") return read([late]);
    return read([]);
  });
  vi.mocked(useFieldReporters).mockReturnValue({
    data: options.inspectors ?? [ana, ben], isPending: false, isError: false, isSuccess: true,
  } as never);
  mutateAsync.mockReset().mockResolvedValue(undefined);
  vi.mocked(useUpdateReportReview).mockReturnValue({ mutateAsync, isPending: false, isError: false, error: null } as never);
  render(<MemoryRouter initialEntries={["/todo"]}><TodoPage /></MemoryRouter>);
}

describe("Send someone drawer on To do", () => {
  beforeEach(() => window.localStorage.clear());

  // Proves: Send someone opens as a drawer over To do (lanes stay mounted) listing each inspector with open and late visit counts.
  it("opens over the lists and shows each inspector's open and late visits", () => {
    setup();
    const send = screen.getByRole("region", { name: "Send someone" });
    fireEvent.click(within(send).getAllByRole("link", { name: "Send someone" })[0]);
    const drawer = screen.getByRole("dialog", { name: "Send someone" });
    expect(screen.getByRole("region", { name: "Visit overdue" })).toBeInTheDocument();
    expect(within(drawer).getByLabelText(/Ana Reyes/)).toHaveAccessibleName(/2 open, 1 late/);
    expect(within(drawer).getByLabelText(/Ben Cruz/)).toHaveAccessibleName(/0 open, 0 late/);
  });

  // Proves: where the bounded list is truncated, counts say "At least".
  it("words counts as at least when the visit read is truncated", () => {
    setup({ truncated: true });
    fireEvent.click(within(screen.getByRole("region", { name: "Send someone" })).getAllByRole("link", { name: "Send someone" })[0]);
    expect(within(screen.getByRole("dialog")).getByLabelText(/Ana Reyes/)).toHaveAccessibleName(/At least 2 open, 1 late/);
  });

  // Proves: the P3 helper convention and an explicit empty state in the drawer.
  it("explains who appears and states an empty inspector list", () => {
    setup({ inspectors: [] });
    fireEvent.click(within(screen.getByRole("region", { name: "Send someone" })).getAllByRole("link", { name: "Send someone" })[0]);
    const drawer = screen.getByRole("dialog");
    expect(within(drawer).getByText(/No eligible inspectors yet/)).toBeInTheDocument();
    expect(within(drawer).getByRole("group", { name: "Inspector" })).toHaveAccessibleDescription(/Only inspectors who have set their password and are admitted appear here/);
    expect(within(drawer).getByRole("button", { name: "Send visit" })).toBeDisabled();
  });

  // Proves: Reassign on a Visit overdue row opens the same drawer, pre-set to the current inspector, and saves through the unchanged assignment payload.
  it("reassigns from an overdue row with the same assignment payload", async () => {
    setup();
    fireEvent.click(within(screen.getByRole("region", { name: "Visit overdue" })).getByRole("link", { name: "Reassign" }));
    const drawer = screen.getByRole("dialog", { name: "Reassign" });
    expect(within(drawer).getByText(/Now with Ana Reyes/)).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Reassign visit" })).toBeDisabled();
    fireEvent.click(within(drawer).getByLabelText(/Ben Cruz/));
    fireEvent.click(within(drawer).getByRole("button", { name: "Reassign visit" }));
    await screen.findByText("CG-late is now with Ben Cruz.");
    expect(mutateAsync).toHaveBeenCalledWith({
      fieldValidationState: "assigned", fieldValidationAssigneeUuid: "ben",
      fieldValidationTargetDate: "2020-01-01", expectedVersion: 4,
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
