import { render, screen, within } from "@testing-library/react";
import { AxiosError } from "axios";
import { MemoryRouter } from "react-router";
import { ApiError } from "../api/ApiError";
import { env } from "../config/env";
import { apiEndpointDetail } from "../lib/serviceMessages";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiseaseReport, FollowUpOutcome } from "../domain/report.types";
import type { BoundedQueueRead } from "../hooks/reportQueries";
import { useReportsQueue } from "../hooks/useReports";
import { NeedsAssessmentPage } from "./NeedsAssessmentPage";

vi.mock("../hooks/useReports", () => ({ useReportsQueue: vi.fn() }));

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

function result(
  data: DiseaseReport[],
  overrides: Record<string, unknown> = {},
  meta: { total?: number; truncated?: boolean } = {},
) {
  return {
    data: {
      reports: data,
      total: meta.total ?? data.length,
      truncated: meta.truncated ?? false,
      loadedPages: 1,
    } satisfies BoundedQueueRead,
    error: null,
    isError: false,
    isFetching: false,
    isPending: false,
    isRefetchError: false,
    dataUpdatedAt: Date.UTC(2026, 9, 23, 13, 14, 3),
    refetch: vi.fn(),
    ...overrides,
  } as never;
}

describe("NeedsAssessmentPage", () => {
  beforeEach(() => {
    vi.mocked(useReportsQueue).mockImplementation((filters) => {
      if (filters?.queue === "follow_up_due") return result([report("overdue", null, "unassigned")]);
      if (filters?.queue === "needs_visit") return result([report("unassigned", null, "unassigned")]);
      return result([
        report("worsened", "worsened", "completed"),
        report("unable", "unable_to_determine", "completed"),
        report("fresh", null, "unassigned"),
      ]);
    });
  });

  it("separates completed visits, unvisited observations, attention, unassigned and overdue work", () => {
    render(<MemoryRouter initialEntries={["/needs-assessment"]}><NeedsAssessmentPage /></MemoryRouter>);

    expect(screen.queryByText("To check")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Needs assessment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Visits awaiting a decision" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Needs attention" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "New observations" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Unassigned visits" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Overdue visits" })).toBeInTheDocument();
    expect(screen.getAllByText("Worsened").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unable to determine").length).toBeGreaterThan(0);

    // A never-visited observation is not described as a completed visit.
    const newObservations = screen.getByRole("region", { name: "New observations" });
    expect(within(newObservations).getByText("CG-fresh")).toBeInTheDocument();
    expect(within(newObservations).getByText("Not visited")).toBeInTheDocument();
    expect(within(newObservations).getByText(/No field visit has been recorded/)).toBeInTheDocument();
    expect(within(newObservations).queryByText(/Field evidence is ready/)).not.toBeInTheDocument();
    expect(within(newObservations).queryByText("Outcome not recorded")).not.toBeInTheDocument();
    const awaiting = screen.getByRole("region", { name: "Visits awaiting a decision" });
    expect(within(awaiting).queryByText("CG-fresh")).not.toBeInTheDocument();
    expect(within(awaiting).queryByText("Not visited")).not.toBeInTheDocument();

    const unassigned = screen.getByRole("region", { name: "Unassigned visits" });
    expect(within(unassigned).getByRole("link", { name: "Assign visit" })).toHaveAttribute(
      "href",
      "/monitoring?view=field-operations&report=unassigned",
    );
    expect(screen.queryByText(/triage/i)).not.toBeInTheDocument();
  });

  it("attributes a truncated read to its queue instead of pairing a section count with the queue total", () => {
    vi.mocked(useReportsQueue).mockImplementation((filters) => {
      if (filters?.queue === "follow_up_due") return result([report("overdue", null, "unassigned")]);
      if (filters?.queue === "needs_visit") return result([report("unassigned", null, "unassigned")]);
      return result(
        [report("worsened", "worsened", "completed"), report("fresh", null, "unassigned")],
        {},
        { total: 137, truncated: true },
      );
    });

    render(<MemoryRouter initialEntries={["/needs-assessment"]}><NeedsAssessmentPage /></MemoryRouter>);

    const awaiting = screen.getByRole("region", { name: "Visits awaiting a decision" });
    expect(within(awaiting).getByText("1", { selector: ".needs-assessment-count" })).toBeInTheDocument();
    expect(within(awaiting).queryByText(/1 of 137/)).not.toBeInTheDocument();
    expect(
      within(awaiting).getByText(/This queue has 137 matching cases and only the first 2 are loaded/),
    ).toBeInTheDocument();
    // A subset of a subset is never given the queue's denominator.
    const attention = screen.getByRole("region", { name: "Needs attention" });
    expect(within(attention).getByText("1", { selector: ".needs-assessment-count" })).toBeInTheDocument();
    expect(within(attention).queryByText(/1 of 137/)).not.toBeInTheDocument();
  });

  it("does not report an unavailable queue as zero work", () => {
    vi.mocked(useReportsQueue).mockImplementation((filters) => {
      if (filters?.queue === "needs_review") {
        return result([], { isError: true, data: undefined }, { total: 0 });
      }
      return result([report("unassigned", null, "unassigned")]);
    });

    render(<MemoryRouter initialEntries={["/needs-assessment"]}><NeedsAssessmentPage /></MemoryRouter>);

    const summary = screen.getByLabelText("Needs assessment summary");
    expect(within(summary).getAllByText("Unavailable")).toHaveLength(2);
    expect(within(summary).queryByText("0")).not.toBeInTheDocument();
    expect(within(summary).getAllByText("1")).toHaveLength(2);
  });

  it("shows the oldest queue read as the workspace freshness stamp", () => {
    vi.mocked(useReportsQueue).mockImplementation((filters) => {
      if (filters?.queue === "follow_up_due") return result([report("overdue", null, "unassigned")], { dataUpdatedAt: Date.UTC(2026, 9, 23, 13, 20, 0) });
      if (filters?.queue === "needs_visit") return result([report("unassigned", null, "unassigned")], { dataUpdatedAt: Date.UTC(2026, 9, 23, 13, 18, 0) });
      return result([report("worsened", "worsened", "completed")], { dataUpdatedAt: Date.UTC(2026, 9, 23, 13, 14, 3) });
    });

    render(<MemoryRouter initialEntries={["/needs-assessment"]}><NeedsAssessmentPage /></MemoryRouter>);

    const freshness = screen.getByText("Last updated").closest("p") as HTMLElement;
    // 13:14:03 UTC is 9:14:03 PM in Asia/Manila.
    expect(within(freshness).getByText("9:14:03 PM")).toBeInTheDocument();
  });

  it("displays refreshing state on the action button when refetching", () => {
    vi.mocked(useReportsQueue).mockImplementation((filters) => {
      if (filters?.queue === "follow_up_due") return result([report("overdue", null, "unassigned")]);
      if (filters?.queue === "needs_visit") return result([report("unassigned", null, "unassigned")]);
      return result([report("worsened", "worsened", "completed")], { isFetching: true });
    });

    render(<MemoryRouter initialEntries={["/needs-assessment"]}><NeedsAssessmentPage /></MemoryRouter>);

    expect(screen.getByRole("button", { name: "Refreshing" })).toBeInTheDocument();
    expect(screen.queryByText(/triage/i)).not.toBeInTheDocument();
  });

  it("displays refetch warning when refreshing fails", () => {
    vi.mocked(useReportsQueue).mockImplementation((filters) => {
      if (filters?.queue === "follow_up_due") return result([report("overdue", null, "unassigned")]);
      if (filters?.queue === "needs_visit") return result([report("unassigned", null, "unassigned")]);
      return result([report("worsened", "worsened", "completed")], { isRefetchError: true });
    });

    render(<MemoryRouter initialEntries={["/needs-assessment"]}><NeedsAssessmentPage /></MemoryRouter>);

    expect(screen.getByText("New updates could not load. Showing the list from before.")).toBeInTheDocument();
    expect(screen.queryByText(/triage/i)).not.toBeInTheDocument();
  });

  it("displays loading state with simplified wording", () => {
    vi.mocked(useReportsQueue).mockReturnValue({
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
    const summary = screen.getByLabelText("Needs assessment summary");
    expect(within(summary).getAllByText("—").length).toBeGreaterThan(0);
    expect(within(summary).queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText(/triage/i)).not.toBeInTheDocument();
  });

  it("uses staff-facing connection guidance and collapsed endpoint detail on first-read failure", () => {
    const error = new ApiError("Network Error", { cause: new AxiosError("Network Error") });
    vi.mocked(useReportsQueue).mockReturnValue({
      data: undefined,
      error,
      isError: true,
      isFetching: false,
      isPending: false,
      isRefetchError: false,
      refetch: vi.fn(),
    } as never);

    render(<MemoryRouter initialEntries={["/needs-assessment"]}><NeedsAssessmentPage /></MemoryRouter>);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("CaneGuard cannot be reached right now.");
    expect(alert).toHaveTextContent("contact your office administrator");
    expect(within(alert).getByText(/CaneGuard cannot be reached right now/)).not.toHaveTextContent(env.apiBaseUrl);
    const details = within(alert).getByText("Technical details").closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(within(details as HTMLElement).getByText(apiEndpointDetail(env.apiBaseUrl))).toBeInTheDocument();
  });

  it("uses stale-data guidance when a queue refresh fails", () => {
    const error = new ApiError("Network Error", { cause: new AxiosError("Network Error") });
    vi.mocked(useReportsQueue).mockImplementation((filters) => {
      const data = filters?.queue === "follow_up_due"
        ? [report("overdue", null, "unassigned")]
        : filters?.queue === "needs_visit"
          ? [report("unassigned", null, "unassigned")]
          : [report("worsened", "worsened", "completed")];
      return result(data, { isError: true, isRefetchError: true, error }) as never;
    });

    render(<MemoryRouter initialEntries={["/needs-assessment"]}><NeedsAssessmentPage /></MemoryRouter>);

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent("last loaded data stays visible and may be stale");
    expect(alerts[0]).toHaveTextContent("contact your office administrator");
  });

  it("displays error state with simplified wording", () => {
    vi.mocked(useReportsQueue).mockReturnValue({
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
