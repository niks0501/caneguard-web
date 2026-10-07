import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../auth/auth.context";
import type { FieldValidationQueueItem } from "../domain/fieldValidation.types";
import type { ReportLifecycle } from "../domain/report.types";
import { addScheduleDays } from "../domain/monitoringSchedule";
import { manilaDateAt } from "../domain/reportingTime";
import { useFieldReporters } from "../hooks/useFieldReporters";
import { useReports, useUpdateReportReview } from "../hooks/useReports";
import { useFieldValidationQueue } from "../hooks/useFieldValidation";
import { FieldOperationsPage } from "./FieldOperationsPage";

vi.mock("../hooks/useFieldReporters", () => ({ useFieldReporters: vi.fn() }));
vi.mock("../hooks/useReports", () => ({ useReports: vi.fn(), useUpdateReportReview: vi.fn() }));
vi.mock("../hooks/useFieldValidation", () => ({ useFieldValidationQueue: vi.fn() }));

const officeDate = manilaDateAt();
const day = (offset: number) => addScheduleDays(officeDate, offset);

const lifecycle = (fieldValidationState: ReportLifecycle["fieldValidationState"], caseState: ReportLifecycle["caseState"] = "open"): ReportLifecycle => ({
  caseState,
  verificationOutcome: "not_determined",
  fieldValidationState,
  referralState: "not_referred",
});

const inspectorOne = { uuid: "inspector-1", name: "Inspector One" };
const inspectorTwo = { uuid: "inspector-2", name: "Inspector Two" };

function queueItem(overrides: Partial<FieldValidationQueueItem> & { uuid: string }): FieldValidationQueueItem {
  return {
    referenceCode: `CG-${overrides.uuid}`,
    barangay: "Balaytigui",
    province: "Batangas",
    municipality: "Nasugbu",
    observedAt: "2026-08-13T10:20:30.000Z",
    submittedAt: "2026-08-13T11:00:00.000Z",
    predictedDisease: "rust",
    confidence: 0.84,
    reviewStatus: "for_field_validation",
    lifecycle: lifecycle("assigned"),
    targetVisitDate: null,
    assignee: null,
    finalLatitude: 14.126,
    finalLongitude: 120.6039,
    locationSource: "gps",
    gpsAccuracy: 8.5,
    affectedAreaHectares: 2.5,
    affectedPortionPercent: 18,
    reviewVersion: 7,
    ...overrides,
  };
}

// FO-SECTION fixture matrix.
const matrix: FieldValidationQueueItem[] = [
  queueItem({ uuid: "A", targetVisitDate: day(-3), assignee: inspectorOne, lifecycle: lifecycle("assigned") }),
  queueItem({ uuid: "B", targetVisitDate: day(-1), assignee: null, lifecycle: lifecycle("unassigned") }),
  queueItem({ uuid: "C", targetVisitDate: day(0), assignee: null, lifecycle: lifecycle("unassigned") }),
  queueItem({ uuid: "D", targetVisitDate: day(1), assignee: null, lifecycle: lifecycle("unassigned") }),
  queueItem({ uuid: "E", targetVisitDate: null, assignee: null, lifecycle: lifecycle("unassigned") }),
  queueItem({ uuid: "F", targetVisitDate: day(0), assignee: inspectorOne, lifecycle: lifecycle("assigned") }),
  queueItem({ uuid: "G", targetVisitDate: day(1), assignee: inspectorOne, lifecycle: lifecycle("assigned") }),
  queueItem({ uuid: "H", targetVisitDate: day(3), assignee: inspectorOne, lifecycle: lifecycle("assigned") }),
  queueItem({ uuid: "I", targetVisitDate: null, assignee: inspectorOne, lifecycle: lifecycle("assigned") }),
  queueItem({ uuid: "J", targetVisitDate: null, assignee: inspectorOne, lifecycle: lifecycle("in_progress") }),
  queueItem({ uuid: "DONE", targetVisitDate: day(-5), assignee: inspectorOne, lifecycle: lifecycle("completed") }),
  queueItem({ uuid: "CLOSED", targetVisitDate: day(-5), assignee: inspectorOne, lifecycle: lifecycle("assigned", "closed") }),
];

function result<T>(data: T, overrides: Record<string, unknown> = {}) {
  return {
    data,
    error: null,
    isError: false,
    isFetching: false,
    isPending: false,
    isRefetchError: false,
    refetch: vi.fn(),
    ...overrides,
  } as never;
}

function sectionEntries(name: string) {
  const heading = screen.getByRole("heading", { name });
  const section = heading.closest("section") as HTMLElement;
  return within(section).queryAllByRole("article").map((article) => article.textContent ?? "");
}

function renderPage(initialEntry = "/monitoring?view=field-operations") {
  return render(
    <AuthContext.Provider value={{ user: { uuid: "inspector-1", name: "Inspector One" } } as never}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <FieldOperationsPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  vi.mocked(useReports).mockReturnValue(result({ reports: [], meta: { total: 0 } }));
  vi.mocked(useFieldValidationQueue).mockReturnValue(result({ queue: "needs_visit", count: matrix.length, total: matrix.length, oldest: null, items: matrix }));
  vi.mocked(useFieldReporters).mockReturnValue(result([inspectorOne, inspectorTwo]));
  vi.mocked(useUpdateReportReview).mockReturnValue(result(undefined, { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }));
});

describe("FieldOperationsPage default workload", () => {
  it("separates Overdue, Unassigned, and Upcoming with each active visit in at most one section", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Overdue" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Unassigned" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upcoming" })).toBeInTheDocument();

    const overdue = sectionEntries("Overdue");
    const unassigned = sectionEntries("Unassigned");
    const upcoming = sectionEntries("Upcoming");
    expect(overdue.some((row) => row.includes("CG-A"))).toBe(true);
    expect(overdue.some((row) => row.includes("CG-B"))).toBe(true);
    // Overdue unassigned work appears only in Overdue.
    expect(unassigned.some((row) => row.includes("CG-B"))).toBe(false);
    expect(unassigned.some((row) => row.includes("CG-E"))).toBe(true);
    expect(upcoming.some((row) => row.includes("CG-I"))).toBe(true);

    const union = [...overdue, ...unassigned, ...upcoming];
    const identities = matrix
      .filter((item) => item.uuid !== "DONE" && item.uuid !== "CLOSED")
      .map((item) => `CG-${item.uuid}`);
    for (const identity of identities) {
      expect(union.filter((row) => row.includes(identity))).toHaveLength(1);
    }
    expect(union.some((row) => row.includes("CG-DONE"))).toBe(false);
    expect(union.some((row) => row.includes("CG-CLOSED"))).toBe(false);
  });

  it("shows concise Overdue, Unassigned, Upcoming, and Assigned workload counts", () => {
    renderPage();
    const summary = screen.getByRole("list", { name: "Field Operations workload summary" });
    expect(within(summary).getByText("Overdue").closest("li")).toHaveTextContent("2");
    expect(within(summary).getByText("Unassigned").closest("li")).toHaveTextContent("3");
    expect(within(summary).getByText("Upcoming").closest("li")).toHaveTextContent("5");
    expect(within(summary).getByText("Assigned").closest("li")).toHaveTextContent("6");
  });

  it("shows relative timing and Not scheduled without inventing timing for undated work", () => {
    renderPage();
    const overdue = sectionEntries("Overdue").join(" ");
    expect(overdue).toContain("3 days overdue");
    expect(overdue).toContain("1 day overdue");
    const unassigned = sectionEntries("Unassigned").join(" ");
    expect(unassigned).toContain("Due today");
    expect(unassigned).toContain("Due tomorrow");
    const upcoming = sectionEntries("Upcoming").join(" ");
    expect(upcoming).toContain("In 3 days");
    // The undated row says Not scheduled and carries no relative timing.
    const undated = sectionEntries("Upcoming").find((row) => row.includes("CG-I")) ?? "";
    expect(undated).toContain("Not scheduled");
    expect(undated).not.toContain("overdue");
    expect(undated).not.toContain("Due ");
  });

  it("exposes the approved Overdue/Unassigned/Upcoming sections regardless of quick filters", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Unassigned" }));
    expect(screen.getByRole("heading", { name: "Overdue" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Unassigned" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upcoming" })).toBeInTheDocument();
    expect(sectionEntries("Overdue")).toHaveLength(0);
    expect(sectionEntries("Unassigned").some((row) => row.includes("CG-E"))).toBe(true);
  });
});

describe("FieldOperationsPage read-first rows and focused editor", () => {
  it("does not permanently repeat assignment controls in visit rows", () => {
    renderPage();
    expect(screen.getByText("CG-A")).toBeInTheDocument();
    expect(screen.queryByLabelText("Inspector")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Target visit date")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Inspector" })).not.toBeInTheDocument();
  });

  it("opens focused Assign / Edit Visit controls only for the selected visit and saves through the review mutation", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useUpdateReportReview).mockReturnValue(result(undefined, { mutateAsync, isPending: false }));
    renderPage();

    const overdueRow = screen.getByRole("heading", { name: "Overdue" }).closest("section") as HTMLElement;
    const buttons = within(overdueRow).getAllByRole("button", { name: "Assign / Edit visit" });
    await user.click(buttons[0]);

    expect(screen.getByRole("heading", { name: "Assign / Edit Visit" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Inspector"), "inspector-2");
    await user.click(screen.getByRole("button", { name: /Assign visit|Update visit/ }));

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      fieldValidationState: "assigned",
      fieldValidationAssigneeUuid: "inspector-2",
      expectedVersion: 7,
    }));
    expect(screen.getByText("Assignment saved to the authoritative review record.")).toBeInTheDocument();
  });

  it("keeps the reviewer's draft and reports an understandable error when a save fails", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockRejectedValue(new Error("network"));
    vi.mocked(useUpdateReportReview).mockReturnValue(result(undefined, { mutateAsync, isPending: false, isError: true, error: new Error("network") }));
    renderPage();

    const overdueRow = screen.getByRole("heading", { name: "Overdue" }).closest("section") as HTMLElement;
    await user.click(within(overdueRow).getAllByRole("button", { name: "Assign / Edit visit" })[0]);
    await user.selectOptions(screen.getByLabelText("Inspector"), "inspector-2");
    await user.click(screen.getByRole("button", { name: /Assign visit|Update visit/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be saved. Your draft is preserved/i);
    expect(screen.getByLabelText("Inspector")).toHaveValue("inspector-2");
  });

  it("offers View on Map only when a usable report location exists", async () => {
    const user = userEvent.setup();
    vi.mocked(useFieldValidationQueue).mockReturnValue(result({
      queue: "needs_visit",
      count: 2,
      total: 2,
      oldest: null,
      items: [
        queueItem({ uuid: "LOCATED", targetVisitDate: day(2), assignee: inspectorOne }),
        queueItem({ uuid: "UNLOCATED", targetVisitDate: day(2), assignee: inspectorOne, finalLatitude: null, finalLongitude: null, locationSource: "unavailable" }),
      ],
    }));
    renderPage();

    const unlocatedRow = screen.getByText("CG-UNLOCATED").closest("article") as HTMLElement;
    expect(within(unlocatedRow).queryByRole("link", { name: /View on Map/ })).not.toBeInTheDocument();
    expect(within(unlocatedRow).getByText("No usable location")).toBeInTheDocument();

    const locatedRow = screen.getByText("CG-LOCATED").closest("article") as HTMLElement;
    expect(within(locatedRow).getByRole("link", { name: /View on Map/ })).toHaveAttribute(
      "href",
      "/monitoring?view=map&report=LOCATED",
    );

    await user.click(within(locatedRow).getByRole("button", { name: "Assign / Edit visit" }));
    const editor = screen.getByRole("heading", { name: "Assign / Edit Visit" }).closest("aside") as HTMLElement;
    expect(within(editor).getByRole("link", { name: /View on Map/ })).toBeInTheDocument();
  });
});

describe("FieldOperationsPage search, grouping, and completeness", () => {
  it("finds an authorized matching visit supplied by the complete workload read, not just the first report page", async () => {
    const user = userEvent.setup();
    vi.mocked(useReports).mockReturnValue(result({ reports: [], meta: { total: 200 } }));
    renderPage(undefined as never);
    await user.type(screen.getByPlaceholderText(/Search reference, farm, barangay, inspector/i), "CG-H");
    expect(screen.getByText("CG-H")).toBeInTheDocument();
    expect(screen.queryByText("CG-A")).not.toBeInTheDocument();
  });

  it("treats a partial workload read honestly and warns about completeness", () => {
    vi.mocked(useFieldValidationQueue).mockReturnValue(result(undefined, {
      isError: true,
      error: new Error("boom"),
    }));
    vi.mocked(useReports).mockReturnValue(result({ reports: [], meta: { total: 240 } }));
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent(/complete workload read failed/i);
  });

  it("groups by Barangay as a presentation change without duplicating identities or mutating rows", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Group by Barangay" }));
    // Exactly one heading per default section, even when grouped.
    expect(screen.getAllByRole("heading", { name: "Overdue" })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { name: "Unassigned" })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { name: "Upcoming" })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { name: "Barangay Balaytigui" }).length).toBeGreaterThan(0);
    expect(sectionEntries("Overdue").some((row) => row.includes("CG-A"))).toBe(true);
  });

  it("distinguishes an empty active workload from filter-empty results", async () => {
    const user = userEvent.setup();
    vi.mocked(useFieldValidationQueue).mockReturnValue(result({ queue: "needs_visit", count: 0, total: 0, oldest: null, items: [] }));
    vi.mocked(useReports).mockReturnValue(result({ reports: [], meta: { total: 0 } }));
    const { unmount } = renderPage();
    expect(screen.getByRole("heading", { name: "No active visits" })).toBeInTheDocument();
    unmount();

    vi.mocked(useFieldValidationQueue).mockReturnValue(result({ queue: "needs_visit", count: matrix.length, total: matrix.length, oldest: null, items: matrix }));
    renderPage();
    const search = screen.getByPlaceholderText(/Search reference, farm, barangay, inspector/i);
    await user.type(search, "no-such-visit");
    expect(screen.getByRole("heading", { name: "No visits match the current filters" })).toBeInTheDocument();
  });
});

describe("FieldOperationsPage failure and deep-link behavior", () => {
  it("shows an explicit retry state when the workload cannot load", () => {
    vi.mocked(useReports).mockReturnValue(result(undefined, { isError: true, error: new Error("boom") }));
    vi.mocked(useFieldValidationQueue).mockReturnValue(result(undefined, { isError: true, error: new Error("boom") }));
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent(/could not be loaded/i);
  });

  it("focuses a case supplied through the stable deep link", () => {
    renderPage("/monitoring?view=field-operations&report=F");
    expect(screen.getAllByText("CG-F").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Assign / Edit Visit" })).toBeInTheDocument();
  });
});
