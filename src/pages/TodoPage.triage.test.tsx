import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiseaseReport } from "../domain/report.types";
import { useReportsQueue } from "../hooks/useReports";
import { TODO_LAST_LOOK_STORAGE_KEY, readTodoLastLook, waitingLabel } from "./todoLastLook";
import { TodoPage } from "./TodoPage";

vi.mock("../hooks/useReports", () => ({ useReportsQueue: vi.fn() }));

function report(uuid: string, submittedAt: string): DiseaseReport {
  return {
    uuid, referenceCode: "CG-" + uuid, barangay: "Mabini", farmReference: "Farm", submittedByName: "Inspector",
    submitterRole: "field_reporter", capturedAt: submittedAt, submittedAt, predictedDisease: "rust",
    imageStatus: "unavailable", symptoms: [], reviewStatus: "for_field_validation",
    lifecycle: { caseState: "open", verificationOutcome: "not_determined", fieldValidationState: "unassigned", referralState: "not_referred" },
    latestValidation: null,
  };
}

function read(reports: DiseaseReport[]) {
  return {
    data: { reports, total: reports.length, truncated: false, loadedPages: 1 },
    error: null, isError: false, isFetching: false, isPending: false, isRefetchError: false,
    dataUpdatedAt: Date.UTC(2026, 9, 23, 13, 14, 3), refetch: vi.fn(),
  } as never;
}

const NOW = new Date("2026-11-16T04:00:00Z");

describe("To do triage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    window.localStorage.clear();
    vi.mocked(useReportsQueue).mockImplementation((filters) => {
      if (filters?.queue === "follow_up_due") return read([report("late", "2026-11-10T04:00:00Z")]);
      if (filters?.queue === "needs_review") return read([report("old", "2026-11-01T04:00:00Z"), report("new", "2026-11-16T01:00:00Z")]);
      return read([]);
    });
  });
  afterEach(() => vi.useRealTimers());

  // Proves: each row shows how long the case has waited.
  it("words waiting time in whole days", () => {
    expect(waitingLabel("2026-11-16T01:00:00Z", NOW)).toBe("Waiting today");
    expect(waitingLabel("2026-11-15T03:00:00Z", NOW)).toBe("Waiting 1 day");
    expect(waitingLabel("2026-11-01T04:00:00Z", NOW)).toBe("Waiting 15 days");
    expect(waitingLabel("nope", NOW)).toBeNull();
  });

  // Proves: rows show waiting time, one verb button per row, and Reassign only on overdue rows.
  it("shows waiting time on every row and Reassign only on overdue rows", () => {
    render(<MemoryRouter initialEntries={["/todo"]}><TodoPage /></MemoryRouter>);
    const review = screen.getByRole("region", { name: "Review new reports" });
    expect(within(review).getByText("Waiting 15 days")).toBeInTheDocument();
    expect(within(review).queryByRole("link", { name: "Reassign" })).not.toBeInTheDocument();
    const overdue = screen.getByRole("region", { name: "Visit overdue" });
    expect(within(overdue).getByText("Waiting 6 days")).toBeInTheDocument();
    expect(within(overdue).getByRole("link", { name: "Reassign" })).toHaveAttribute("href", "/monitoring?view=field-operations&report=late");
    for (const card of document.querySelectorAll("article")) expect(card.querySelectorAll(".button")).toHaveLength(1);
  });

  // Proves: no dots on a first visit, then a dot only for cases submitted after the last look.
  it("marks cases new since the last look, none on a first visit, and remembers the look", () => {
    const first = render(<MemoryRouter initialEntries={["/todo"]}><TodoPage /></MemoryRouter>);
    expect(screen.queryByRole("img", { name: "New since your last visit" })).not.toBeInTheDocument();
    expect(readTodoLastLook("anonymous")).toBe(NOW.getTime());
    first.unmount();

    window.localStorage.setItem(TODO_LAST_LOOK_STORAGE_KEY, JSON.stringify({ version: 1, viewers: { anonymous: Date.parse("2026-11-12T00:00:00Z") } }));
    render(<MemoryRouter initialEntries={["/todo"]}><TodoPage /></MemoryRouter>);
    const dots = screen.getAllByRole("img", { name: "New since your last visit" });
    expect(dots).toHaveLength(1);
    expect(dots[0].closest("a")).toHaveTextContent("CG-new");
  });
});
