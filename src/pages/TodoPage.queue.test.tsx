import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { createQueryClient } from "../app/queryClient";
import { env } from "../config/env";
import { reportListItemDto } from "../test/fixtures";
import { server } from "../test/server";
import { TodoPage } from "./TodoPage";

/**
 * QF-8: To do is four lanes whose empty lanes fold into a single
 * line. These tests drive the real reports repository, zod schema, mapper and
 * query hooks through MSW against the `/api/v1/reports` queue responses the
 * running portal receives, so the lane split under proof is never mocked.
 */
const apiBase = env.apiBaseUrl;

function DecisionArrival() {
  const location = useLocation();
  return <output data-testid="decision-state">{JSON.stringify(location.state)}</output>;
}

function queueItem(seed: number, referenceCode: string, lifecycle: Record<string, unknown>, latestValidation: Record<string, unknown> | null) {
  return {
    ...reportListItemDto,
    uuid: `00000000-0000-4000-8000-0000000000${seed.toString().padStart(2, "0")}`,
    reference_code: referenceCode,
    lifecycle: { ...reportListItemDto.lifecycle, ...lifecycle },
    latest_validation: latestValidation,
  };
}

function completedVisit(seed: number, referenceCode: string, followUpOutcome: string) {
  return queueItem(seed, referenceCode, { field_validation_state: "completed" }, {
    visited_at: "2026-09-02T08:00:00.000Z",
    field_observation: "Orange pustules on the lower leaf surface.",
    finding: "Rust confirmed in the eastern block.",
    action_taken: "Advised pruning and recorded the next action.",
    follow_up_outcome: followUpOutcome,
    assignee: { uuid: "inspector-1", name: "Field Inspector" },
    fresh_photo: { available: true, url: "https://api.caneguard.test/fresh.jpg" },
  });
}

function unvisitedObservation(seed: number, referenceCode: string) {
  return queueItem(seed, referenceCode, { field_validation_state: "unassigned" }, null);
}

function listResponse(items: Record<string, unknown>[], options: { total?: number } = {}) {
  return {
    data: items,
    links: { first: null, last: null, prev: null, next: null },
    meta: {
      current_page: 1,
      from: items.length > 0 ? 1 : null,
      last_page: 1,
      per_page: 100,
      to: items.length > 0 ? items.length : null,
      total: options.total ?? items.length,
    },
  };
}

interface QueueReply {
  items?: Record<string, unknown>[];
  total?: number;
  fail?: boolean;
}

/** Every queue read the page makes, answered by the queue it asked for. */
function installApi(replies: Record<string, QueueReply>) {
  server.use(
    http.get(`${apiBase}/api/v1/reports`, ({ request }) => {
      const queue = new URL(request.url).searchParams.get("queue") ?? "";
      const reply = replies[queue] ?? {};
      if (reply.fail) return new HttpResponse(null, { status: 500 });
      return HttpResponse.json(listResponse(reply.items ?? [], { total: reply.total }));
    }),
  );
}

function renderTodo() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={["/todo"]}>
        <TodoPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TodoPage queue reads", () => {
  it("keeps a headed, counted group for every queue result that has rows and folds only the empty one into the same list", async () => {
    installApi({
      needs_review: {
        items: [
          completedVisit(1, "CG-worsened", "worsened"),
          completedVisit(2, "CG-unable", "unable_to_determine"),
          completedVisit(3, "CG-improved", "improved"),
          unvisitedObservation(4, "CG-fresh"),
        ],
      },
      needs_visit: { items: [unvisitedObservation(5, "CG-unassigned")] },
      follow_up_due: { items: [] },
    });

    renderTodo();

    const decide = await screen.findByRole("region", { name: "Decide after visit" });
    expect(within(decide).getByText("3")).toBeInTheDocument();
    expect(within(decide).getByText("CG-worsened")).toBeInTheDocument();
    expect(within(decide).getByText("CG-improved")).toBeInTheDocument();
    expect(within(decide).queryByText("CG-fresh")).not.toBeInTheDocument();
    expect(within(decide).queryByText("CG-unassigned")).not.toBeInTheDocument();

    const review = screen.getByRole("region", { name: "Review new reports" });
    expect(within(review).getByText("4")).toBeInTheDocument();
    expect(within(review).getByText("CG-fresh")).toBeInTheDocument();
    expect(within(review).getByText("CG-worsened")).toBeInTheDocument();
    expect(within(review).getByText("Not visited")).toBeInTheDocument();

    const send = screen.getByRole("region", { name: "Send someone" });
    expect(within(send).getByText("CG-unassigned")).toBeInTheDocument();

    // The empty lane keeps its place in work order and folds into one line.
    const overdue = screen.getByRole("region", { name: "Visit overdue" });
    expect(within(overdue).getByText("0")).toBeInTheDocument();
    expect(within(overdue).getByText("No open visits are overdue.")).toBeInTheDocument();
  });

  it("includes all validation work in Send someone while retaining the overdue lane", async () => {
    const overdue = queueItem(6, "CG-overdue", { field_validation_state: "assigned" }, {
      visited_at: "2026-09-02T08:00:00.000Z",
      field_observation: "No symptoms were observed during the visit.",
      finding: "No disease findings recorded.",
      action_taken: "Follow-up is required.",
      follow_up_outcome: null,
      assignee: { uuid: "inspector-1", name: "Field Inspector" },
      fresh_photo: { available: false },
    });
    const assigned = queueItem(7, "CG-assigned", { field_validation_state: "in_progress" }, null);
    const advised = { ...queueItem(8, "CG-advised", { field_validation_state: "unassigned" }, null), action_taken: "advisory_provided" };
    installApi({
      needs_review: { items: [] },
      needs_visit: { items: [assigned, overdue] },
      follow_up_due: { items: [overdue] },
      unverified_no_active_work: { items: [advised] },
    });

    renderTodo();

    const send = await screen.findByRole("region", { name: "Send someone" });
    expect(within(send).getByText("CG-assigned")).toBeInTheDocument();
    expect(within(send).getByText("CG-advised")).toBeInTheDocument();
    expect(within(send).getByText("CG-overdue")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Visit overdue" })).getByText("CG-overdue")).toBeInTheDocument();
  });

  it("routes no-active-work cards to the field-validation decision action", async () => {
    const advised = { ...queueItem(9, "CG-advised", { field_validation_state: "unassigned" }, null), action_taken: "advisory_provided" };
    installApi({
      needs_review: { items: [] },
      needs_visit: { items: [] },
      follow_up_due: { items: [] },
      unverified_no_active_work: { items: [advised] },
    });
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/todo"]}>
          <Routes>
            <Route path="/todo" element={<TodoPage />} />
            <Route path="/reports/:reportId" element={<DecisionArrival />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const action = await screen.findByRole("link", { name: "Assign field validation" });
    expect(action).toHaveAttribute("href", "/reports/00000000-0000-4000-8000-000000000009#review-decision");
    fireEvent.click(action);
    expect(await screen.findByTestId("decision-state")).toHaveTextContent('"preselectAction":"field"');
  });

  it("states a truncated queue read once above the list it actually rendered", async () => {
    installApi({
      needs_review: {
        items: [
          completedVisit(1, "CG-worsened", "worsened"),
          completedVisit(2, "CG-improved", "improved"),
          unvisitedObservation(3, "CG-fresh"),
          unvisitedObservation(4, "CG-fresh-2"),
        ],
        total: 137,
      },
      needs_visit: { items: [] },
      follow_up_due: { items: [] },
    });

    renderTodo();

    const decide = await screen.findByRole("region", { name: "Decide after visit" });
    expect(within(decide).getByText("2")).toBeInTheDocument();
    // A lane count is never paired with a denominator it does not match.
    expect(within(decide).queryByText(/of 137/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/The Review new reports and Decide after visit queue loaded the first 4 of 137 matching cases/)).toHaveLength(1);
  });

  it("shows the load error alone when one queue fails first, never a boundary notice about a list it did not render", async () => {
    installApi({
      needs_review: {
        items: [
          completedVisit(1, "CG-worsened", "worsened"),
          completedVisit(2, "CG-unable", "unable_to_determine"),
        ],
        total: 137,
      },
      needs_visit: { fail: true },
      follow_up_due: { items: [unvisitedObservation(5, "CG-overdue")] },
    });

    renderTodo();

    expect(await screen.findByText("This list could not be loaded. Please try again.", {}, { timeout: 5_000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/queue loaded the first/)).not.toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Decide after visit" })).not.toBeInTheDocument();
  });
});
