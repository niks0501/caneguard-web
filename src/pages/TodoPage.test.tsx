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
import { TodoPage } from "./TodoPage";

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

describe("TodoPage", () => {
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

  it("shows the four lanes in work order, each card with one primary button", () => {
    render(<MemoryRouter initialEntries={["/todo"]}><TodoPage /></MemoryRouter>);

    expect(screen.getByRole("heading", { level: 1, name: "To do" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent?.trim())).toEqual([
      "Review new reports", "Send someone", "Visit overdue", "Decide after visit",
    ]);

    const review = screen.getByRole("region", { name: "Review new reports" });
    expect(within(review).getByText("CG-fresh")).toBeInTheDocument();
    expect(within(review).getByText("Not visited")).toBeInTheDocument();
    expect(within(review).getByText(/No field visit has been recorded/)).toBeInTheDocument();
    expect(within(review).getByRole("link", { name: "Review report" })).toHaveAttribute("href", "/reports/fresh");

    const send = screen.getByRole("region", { name: "Send someone" });
    expect(within(send).getByRole("link", { name: "Send someone" })).toHaveAttribute(
      "href",
      "/monitoring?view=field-operations&report=unassigned",
    );

    const overdue = screen.getByRole("region", { name: "Visit overdue" });
    expect(within(overdue).getByRole("link", { name: "Open visit" })).toHaveAttribute(
      "href",
      "/monitoring?view=field-operations&report=overdue",
    );

    const decide = screen.getByRole("region", { name: "Decide after visit" });
    expect(within(decide).getByText("CG-worsened")).toBeInTheDocument();
    expect(within(decide).getByText("CG-unable")).toBeInTheDocument();
    expect(within(decide).queryByText("CG-fresh")).not.toBeInTheDocument();
    expect(within(decide).getAllByRole("link", { name: "Record decision" })[0]).toHaveAttribute("href", "/reports/worsened#review-decision");
    expect(screen.getAllByText("Worsened").length).toBeGreaterThan(0);

    for (const lane of [review, send, overdue, decide]) {
      for (const card of lane.querySelectorAll("article")) {
        expect(within(card as HTMLElement).getAllByRole("link").filter((link) => link.className.includes("button--primary"))).toHaveLength(1);
        expect(card.querySelectorAll(".button")).toHaveLength(1);
      }
    }
    expect(screen.queryByText(/triage/i)).not.toBeInTheDocument();
  });

  it("links each summary counter to its lane", () => {
    render(<MemoryRouter initialEntries={["/todo"]}><TodoPage /></MemoryRouter>);

    const summary = screen.getByLabelText("To do summary");
    for (const [name, lane] of [["Review new reports", "review"], ["Send someone", "send"], ["Visit overdue", "overdue"], ["Decide after visit", "decide"]]) {
      expect(within(summary).getByRole("link", { name: new RegExp(name) })).toHaveAttribute("href", `#lane-${lane}`);
      expect(document.getElementById(`lane-${lane}`)).not.toBeNull();
    }
  });

  it("keeps every lane and folds an empty one into one line", () => {
    vi.mocked(useReportsQueue).mockImplementation((filters) => {
      if (filters?.queue === "follow_up_due") return result([]);
      if (filters?.queue === "needs_visit") return result([]);
      return result([report("improved", "improved", "completed")]);
    });

    render(<MemoryRouter initialEntries={["/todo"]}><TodoPage /></MemoryRouter>);

    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(4);
    expect(screen.getByText("No new reports are waiting for review.")).toBeInTheDocument();
    expect(screen.getByText("No reports are waiting for someone to be sent.")).toBeInTheDocument();
    expect(screen.getByText("No open visits are overdue.")).toBeInTheDocument();
    expect(screen.queryByText("No completed visits are waiting for a decision.")).not.toBeInTheDocument();
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

    render(<MemoryRouter initialEntries={["/todo"]}><TodoPage /></MemoryRouter>);

    const decide = screen.getByRole("region", { name: "Decide after visit" });
    expect(within(decide).getByText("1", { selector: ".needs-assessment-count" })).toBeInTheDocument();
    expect(within(decide).queryByText(/1 of 137/)).not.toBeInTheDocument();
    // The boundary is stated once for the queue, not once per lane it feeds.
    expect(screen.getAllByText(/The Review new reports and Decide after visit queue loaded the first 2 of 137 matching cases/)).toHaveLength(1);
    const review = screen.getByRole("region", { name: "Review new reports" });
    expect(within(review).getByText("1", { selector: ".needs-assessment-count" })).toBeInTheDocument();
    expect(within(review).queryByText(/1 of 137/)).not.toBeInTheDocument();
  });

  it("does not describe a bounded queue when the list could not be loaded", () => {
    vi.mocked(useReportsQueue).mockImplementation((filters) => {
      if (filters?.queue === "needs_visit") return result([], { isError: true, data: undefined });
      if (filters?.queue === "follow_up_due") return result([report("overdue", null, "unassigned")]);
      return result([report("worsened", "worsened", "completed")], {}, { total: 137, truncated: true });
    });

    render(<MemoryRouter initialEntries={["/todo"]}><TodoPage /></MemoryRouter>);

    expect(screen.getByText("This list could not be loaded. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText(/queue loaded the first/)).not.toBeInTheDocument();
  });

  it("does not report an unavailable queue as zero work", () => {
    vi.mocked(useReportsQueue).mockImplementation((filters) => {
      if (filters?.queue === "needs_review") {
        return result([], { isError: true, data: undefined }, { total: 0 });
      }
      return result([report("unassigned", null, "unassigned")]);
    });

    render(<MemoryRouter initialEntries={["/todo"]}><TodoPage /></MemoryRouter>);

    const summary = screen.getByLabelText("To do summary");
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

    render(<MemoryRouter initialEntries={["/todo"]}><TodoPage /></MemoryRouter>);

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

    render(<MemoryRouter initialEntries={["/todo"]}><TodoPage /></MemoryRouter>);

    expect(screen.getByRole("button", { name: "Refreshing" })).toBeInTheDocument();
    expect(screen.queryByText(/triage/i)).not.toBeInTheDocument();
  });

  it("displays refetch warning when refreshing fails", () => {
    vi.mocked(useReportsQueue).mockImplementation((filters) => {
      if (filters?.queue === "follow_up_due") return result([report("overdue", null, "unassigned")]);
      if (filters?.queue === "needs_visit") return result([report("unassigned", null, "unassigned")]);
      return result([report("worsened", "worsened", "completed")], { isRefetchError: true });
    });

    render(<MemoryRouter initialEntries={["/todo"]}><TodoPage /></MemoryRouter>);

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

    render(<MemoryRouter initialEntries={["/todo"]}><TodoPage /></MemoryRouter>);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    const summary = screen.getByLabelText("To do summary");
    expect(within(summary).getAllByText("—").length).toBeGreaterThan(0);
    expect(within(summary).queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText(/triage/i)).not.toBeInTheDocument();
  });

  it("gives bounded retry guidance when an initial queue read is rate limited", () => {
    const error = new ApiError("Slow down", { status: 429 });
    vi.mocked(useReportsQueue).mockReturnValue({
      data: undefined,
      error,
      isError: true,
      isFetching: false,
      isPending: false,
      isRefetchError: false,
      refetch: vi.fn(),
    } as never);

    render(<MemoryRouter initialEntries={["/todo"]}><TodoPage /></MemoryRouter>);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("To do is receiving too many requests.");
    expect(alert).toHaveTextContent("Wait a moment, then try again.");
    expect(within(alert).queryByText("Technical details")).not.toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("gives bounded retry guidance when a queue refresh is rate limited", () => {
    const error = new ApiError("Slow down", { status: 429 });
    vi.mocked(useReportsQueue).mockImplementation((filters) => {
      const data = filters?.queue === "follow_up_due"
        ? [report("overdue", null, "unassigned")]
        : filters?.queue === "needs_visit"
          ? [report("unassigned", null, "unassigned")]
          : [report("worsened", "worsened", "completed")];
      return result(data, { isError: true, isRefetchError: true, error }) as never;
    });

    render(<MemoryRouter initialEntries={["/todo"]}><TodoPage /></MemoryRouter>);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("refresh was rate limited");
    expect(alert).toHaveTextContent("Wait a moment before trying again");
    expect(alert).toHaveTextContent("previous queues remain visible");
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

    render(<MemoryRouter initialEntries={["/todo"]}><TodoPage /></MemoryRouter>);

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

    render(<MemoryRouter initialEntries={["/todo"]}><TodoPage /></MemoryRouter>);

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

    render(<MemoryRouter initialEntries={["/todo"]}><TodoPage /></MemoryRouter>);

    expect(screen.getByText("This list could not be loaded. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText(/triage/i)).not.toBeInTheDocument();
  });
});
