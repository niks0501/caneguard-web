import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { createQueryClient } from "../app/queryClient";
import { env } from "../config/env";
import { reportListItemDto } from "../test/fixtures";
import { server } from "../test/server";
import { SubmittedReportsPage } from "./SubmittedReportsPage";

/**
 * PROTECTED CONTRACT TESTS - Reviewer-focused queue filters and states.
 *
 * Contract source: .lavish/table-queue-board.html sections 1, 2, 6, TQ2 and the
 * section 7 rulings:
 *   A3 - Reviewer filter = field-validation assignee.
 *   A4 - two condition controls (Possible Condition + Staff-classified condition).
 *   A5 - From/To on the submitted date, a new `workflow_status` parameter for the
 *        six workflow states, and Due-soonest as the default sort.
 *   A6 - Search, Queue and Reported concern survive.
 *   A11 - the sixth column header is "Review".
 *
 * These tests drive the real repository, zod schema and mapper through MSW so
 * the behavior under proof is never mocked.
 *
 * Baseline expectation: fails at revision 0cea13e because the filter bar has no
 * Status / Reviewer / From-To-submitted control of the approved shape, no
 * `workflow_status` parameter, still exposes the four lifecycle filters and
 * Work status, and defaults to the oldest-first sort.
 */

const apiBase = env.apiBaseUrl;

function queueListDto(overrides: Record<string, unknown> = {}) {
  return {
    data: [
      {
        ...reportListItemDto,
        ...overrides,
      },
    ],
    links: { first: null, last: null, prev: null, next: null },
    meta: {
      current_page: 1,
      from: 1,
      last_page: 1,
      per_page: 15,
      to: 1,
      total: 1,
    },
  };
}

let listRequests: string[] = [];
let fieldReporterRequests = 0;

function installApi(handlerOverrides: {
  reports?: (request: Request) => Response | Promise<Response>;
} = {}) {
  listRequests = [];
  fieldReporterRequests = 0;

  server.use(
    http.get(`${apiBase}/api/v1/reports`, async ({ request }) => {
      listRequests.push(request.url);
      if (handlerOverrides.reports) return handlerOverrides.reports(request);
      return HttpResponse.json(queueListDto());
    }),
    http.get(`${apiBase}/api/v1/field-reporters`, () => {
      fieldReporterRequests += 1;
      return HttpResponse.json({
        data: [{ uuid: "officer-1", name: "Field Officer" }],
      });
    }),
  );
}

function renderPage(
  initialEntry = "/reports",
  workspace: "reports" | "monitoring" = "reports",
) {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SubmittedReportsPage workspace={workspace} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  installApi();
});

describe("queue contract - filter bar (FILTERS)", () => {
  it("FILTERS: exposes Status, Barangay, both condition controls, dates, Reviewer and Sort", async () => {
    renderPage();
    await waitFor(() => expect(listRequests.length).toBeGreaterThan(0));

    expect(screen.getByLabelText("Status")).toBeInTheDocument();
    expect(screen.getByLabelText("Barangay")).toBeInTheDocument();
    expect(screen.getByLabelText("Possible Condition")).toBeInTheDocument();
    expect(screen.getByLabelText("Staff-classified condition")).toBeInTheDocument();
    expect(screen.getByLabelText("From date")).toBeInTheDocument();
    expect(screen.getByLabelText("To date")).toBeInTheDocument();
    expect(screen.getByLabelText("Reviewer")).toBeInTheDocument();
    expect(screen.getByLabelText("Sort by")).toBeInTheDocument();
  });

  it("FILTERS: keeps Search, Queue and Reported concern (A6)", async () => {
    renderPage();
    await waitFor(() => expect(listRequests.length).toBeGreaterThan(0));

    expect(screen.getByLabelText("Search reports")).toBeInTheDocument();
    expect(screen.getByLabelText("Queue")).toBeInTheDocument();
    expect(screen.getByLabelText("Reported concern")).toBeInTheDocument();
  });

  it("FILTERS: collapses the four lifecycle filters into the single Status filter", async () => {
    renderPage();
    await waitFor(() => expect(listRequests.length).toBeGreaterThan(0));

    expect(screen.queryByLabelText("Work status")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Case state")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Verification outcome")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Field validation state")).not.toBeInTheDocument();
  });

  it("FILTERS: Reviewer defaults to anyone and lists the office field reporters", async () => {
    renderPage();
    await waitFor(() => expect(listRequests.length).toBeGreaterThan(0));

    const reviewer = screen.getByLabelText("Reviewer");
    expect(within(reviewer).getByRole("option", { name: /anyone/i })).toBeInTheDocument();

    await waitFor(() => expect(fieldReporterRequests).toBeGreaterThan(0));
    expect(within(reviewer).getByRole("option", { name: "Field Officer" })).toBeInTheDocument();
  });

  it("FILTERS: choosing a Status value sends the workflow_status parameter (A5)", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(listRequests.length).toBeGreaterThan(0));

    await user.selectOptions(screen.getByLabelText("Status"), "needs_review");

    await waitFor(() =>
      expect(listRequests.some((url) => url.includes("workflow_status=needs_review"))).toBe(true),
    );
  });

  it("FILTERS: choosing a Reviewer sends the reviewer parameter (A3)", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(listRequests.length).toBeGreaterThan(0));

    await user.selectOptions(screen.getByLabelText("Reviewer"), "officer-1");

    await waitFor(() =>
      expect(listRequests.some((url) => url.includes("reviewer=officer-1"))).toBe(true),
    );
  });

  it("FILTERS: the two condition controls send their own parameters (A4)", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(listRequests.length).toBeGreaterThan(0));

    await user.selectOptions(screen.getByLabelText("Possible Condition"), "rust");
    await user.selectOptions(screen.getByLabelText("Staff-classified condition"), "smut");

    await waitFor(() => {
      const latest = listRequests[listRequests.length - 1];
      expect(latest).toContain("predicted_label=rust");
      expect(latest).toContain("authority_classified_condition=smut");
    });
  });

  it("FILTERS: the date controls send the submitted-date range (A5)", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(listRequests.length).toBeGreaterThan(0));

    const from = screen.getByLabelText("From date");
    const to = screen.getByLabelText("To date");
    await user.clear(from);
    await user.type(from, "2026-07-01");
    await user.clear(to);
    await user.type(to, "2026-07-31");

    await waitFor(() => {
      const latest = listRequests[listRequests.length - 1];
      expect(latest).toContain("date_from=2026-07-01");
      expect(latest).toContain("date_to=2026-07-31");
    });
  });
});

describe("queue contract - Status vocabulary (STATUS)", () => {
  it("STATUS: offers exactly the six workflow states", async () => {
    renderPage();
    await waitFor(() => expect(listRequests.length).toBeGreaterThan(0));

    const status = screen.getByLabelText("Status");
    const options = within(status)
      .getAllByRole("option")
      .map((option) => option.textContent?.trim() ?? "");
    const workflowStates = options.filter((label) => !/all/i.test(label));

    expect(workflowStates).toEqual([
      "Needs Review",
      "Under Review",
      "Field Validation",
      "Referred",
      "Follow-Up",
      "Resolved",
    ]);
    expect(options.some((label) => /all/i.test(label))).toBe(true);
  });
});

describe("queue contract - sort and six-column row surface", () => {
  it("SORT: the queue opens on Due soonest (A5)", async () => {
    renderPage();

    await waitFor(() =>
      expect(listRequests.some((url) => url.includes("sort=due_soonest"))).toBe(true),
    );
  });

  it("ROW: the queue renders the six contract columns", async () => {
    renderPage();
    await waitFor(() => expect(listRequests.length).toBeGreaterThan(0));

    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent?.trim() ?? "");

    expect(headers).toEqual([
      "Case",
      "Location",
      "Possible Condition",
      "Affected Area",
      "Case Status",
      "Review",
    ]);
  });
});

describe("queue regressions (SAVED, STATE)", () => {
  it("SAVED: monitoring keeps its saved views and their URL contract", async () => {
    renderPage("/monitoring?concern=rssi", "monitoring");

    expect(screen.getByRole("link", { name: "RSSI concerns" })).toHaveAttribute(
      "href",
      "/monitoring?concern=rssi",
    );
    expect(screen.getByRole("link", { name: "Follow-up due" })).toHaveAttribute(
      "href",
      "/monitoring?queue=follow_up_due",
    );
    expect(screen.getByRole("link", { name: "Upcoming visits" })).toHaveAttribute(
      "href",
      "/monitoring?queue=upcoming",
    );
  });

  it("STATE: an empty queue renders the empty state", async () => {
    installApi({
      reports: () =>
        HttpResponse.json({
          data: [],
          links: { first: null, last: null, prev: null, next: null },
          meta: { current_page: 1, from: null, last_page: 1, per_page: 15, to: null, total: 0 },
        }),
    });
    renderPage();

    expect(await screen.findByText("No submitted reports yet")).toBeInTheDocument();
  });

  it("STATE: an invalid filter URL is rejected without a request", async () => {
    renderPage("/reports?predicted_label=not_a_disease");

    expect(
      await screen.findByText(/invalid filter|clear the filters/i),
    ).toBeInTheDocument();
    expect(listRequests).toHaveLength(0);
  });
});
