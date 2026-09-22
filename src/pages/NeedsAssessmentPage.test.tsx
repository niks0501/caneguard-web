import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiseaseReport, FollowUpOutcome } from "../domain/report.types";
import { useReports } from "../hooks/useReports";
import { NeedsAssessmentPage } from "./NeedsAssessmentPage";

vi.mock("../hooks/useReports", () => ({ useReports: vi.fn() }));

function report(uuid: string, outcome: FollowUpOutcome | null, state: "completed" | "unassigned"): DiseaseReport {
  return {
    uuid,
    referenceCode: `CG-${uuid}`,
    barangay: "Mabini",
    farmReference: "Farm Alpha",
    submittedByName: "Inspector",
    submitterRole: "field_reporter",
    capturedAt: "2026-09-01T08:00:00Z",
    submittedAt: "2026-09-01T08:00:00Z",
    predictedDisease: "rust",
    imageStatus: "unavailable",
    symptoms: [],
    reviewStatus: state === "completed" ? "submitted_unverified" : "for_field_validation",
    lifecycle: { caseState: "open", verificationOutcome: "not_determined", fieldValidationState: state, referralState: "not_referred" },
    latestValidation: outcome ? {
      visitedAt: "2026-09-02T08:00:00Z",
      fieldObservation: "Observation",
      finding: "Finding",
      actionTaken: "Action",
      followUpOutcome: outcome,
      assignee: { uuid: "inspector", name: "Inspector" },
    } : null,
  };
}

function result(data: DiseaseReport[], overrides: Record<string, unknown> = {}) {
  return {
    data: { reports: data, meta: { total: data.length } },
    error: null,
    isError: false,
    isFetching: false,
    isPending: false,
    isRefetchError: false,
    refetch: vi.fn(),
    ...overrides,
  } as never;
}

describe("NeedsAssessmentPage", () => {
  beforeEach(() => {
    vi.mocked(useReports).mockImplementation((filters) => {
      if (filters?.queue === "follow_up_due") return result([report("overdue", null, "unassigned")]);
      if (filters?.queue === "needs_visit") return result([report("unassigned", null, "unassigned")]);
      return result([
        report("worsened", "worsened", "completed"),
        report("unable", "unable_to_determine", "completed"),
      ]);
    });
  });

  it("separates attention outcomes and overdue visits while handing unassigned work to the planner", () => {
    render(<MemoryRouter initialEntries={["/needs-assessment"]}><NeedsAssessmentPage /></MemoryRouter>);

    expect(screen.queryByText("To check")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Needs assessment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Needs assessment" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Needs attention" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Overdue visits" })).toBeInTheDocument();
    expect(screen.getAllByText("Worsened").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unable to determine").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Assign visit" })[0]).toHaveAttribute(
      "href",
      "/monitoring?view=field-operations&report=unassigned",
    );
    expect(screen.queryByText(/triage/i)).not.toBeInTheDocument();
  });

  it("displays refreshing state on the action button when refetching", () => {
    vi.mocked(useReports).mockImplementation((filters) => {
      if (filters?.queue === "follow_up_due") return result([report("overdue", null, "unassigned")]);
      if (filters?.queue === "needs_visit") return result([report("unassigned", null, "unassigned")]);
      return result(
        [report("worsened", "worsened", "completed")],
        { isFetching: true },
      );
    });

    render(<MemoryRouter initialEntries={["/needs-assessment"]}><NeedsAssessmentPage /></MemoryRouter>);

    expect(screen.getByRole("button", { name: "Refreshing" })).toBeInTheDocument();
    expect(screen.queryByText(/triage/i)).not.toBeInTheDocument();
  });

  it("displays refetch warning when refreshing fails", () => {
    vi.mocked(useReports).mockImplementation((filters) => {
      if (filters?.queue === "follow_up_due") return result([report("overdue", null, "unassigned")]);
      if (filters?.queue === "needs_visit") return result([report("unassigned", null, "unassigned")]);
      return result(
        [report("worsened", "worsened", "completed")],
        { isRefetchError: true },
      );
    });

    render(<MemoryRouter initialEntries={["/needs-assessment"]}><NeedsAssessmentPage /></MemoryRouter>);

    expect(screen.getByText("New updates could not load. Showing the list from before.")).toBeInTheDocument();
    expect(screen.queryByText(/triage/i)).not.toBeInTheDocument();
  });

  it("displays loading state with simplified wording", () => {
    vi.mocked(useReports).mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      isFetching: false,
      isPending: true,
      isRefetchError: false,
      refetch: vi.fn(),
    } as never);

    render(<MemoryRouter initialEntries={["/needs-assessment"]}><NeedsAssessmentPage /></MemoryRouter>);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByText(/triage/i)).not.toBeInTheDocument();
  });

  it("displays error state with simplified wording", () => {
    vi.mocked(useReports).mockReturnValue({
      data: undefined,
      error: new Error("Network error"),
      isError: true,
      isFetching: false,
      isPending: false,
      isRefetchError: false,
      refetch: vi.fn(),
    } as never);

    render(<MemoryRouter initialEntries={["/needs-assessment"]}><NeedsAssessmentPage /></MemoryRouter>);

    expect(screen.getByText("This list could not be loaded. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText(/triage/i)).not.toBeInTheDocument();
  });
});
