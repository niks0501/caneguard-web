import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { createQueryClient } from "../app/queryClient";
import { env } from "../config/env";
import { reportListItemDto } from "../test/fixtures";
import { server } from "../test/server";
import { NeedsAssessmentPage } from "./NeedsAssessmentPage";

/**
 * QF-8: Needs assessment is one list whose empty groups fold into a single
 * line. These tests drive the real reports repository, zod schema, mapper and
 * query hooks through MSW against the `/api/v1/reports` queue responses the
 * running portal receives, so the grouping under proof is never mocked.
 */
const apiBase = env.apiBaseUrl;

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

function renderNeedsAssessment() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={["/needs-assessment"]}>
        <NeedsAssessmentPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("NeedsAssessmentPage queue reads", () => {
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

    renderNeedsAssessment();

    const awaiting = await screen.findByRole("region", { name: "Visits awaiting a decision" });
    expect(within(awaiting).getByText("3")).toBeInTheDocument();
    expect(within(awaiting).getByText("CG-worsened")).toBeInTheDocument();
    expect(within(awaiting).getByText("CG-improved")).toBeInTheDocument();
    expect(within(awaiting).queryByText("CG-fresh")).not.toBeInTheDocument();
    expect(within(awaiting).queryByText("CG-unassigned")).not.toBeInTheDocument();

    // The attention group stays reachable with its own count and rows.
    const attention = screen.getByRole("region", { name: "Needs attention" });
    expect(within(attention).getByText("2")).toBeInTheDocument();
    expect(within(attention).getByText("CG-worsened")).toBeInTheDocument();
    expect(within(attention).getByText("CG-unable")).toBeInTheDocument();
    expect(within(attention).queryByText("CG-improved")).not.toBeInTheDocument();

    const observations = screen.getByRole("region", { name: "New observations" });
    expect(within(observations).getByText("1")).toBeInTheDocument();
    expect(within(observations).getByText("CG-fresh")).toBeInTheDocument();
    expect(within(observations).getByText("Not visited")).toBeInTheDocument();
    expect(within(observations).queryByText("CG-worsened")).not.toBeInTheDocument();

    const unassigned = screen.getByRole("region", { name: "Unassigned visits" });
    expect(within(unassigned).getByText("CG-unassigned")).toBeInTheDocument();

    // The empty group takes one line in the same list, not a heading of its own.
    expect(screen.queryByRole("heading", { name: "Overdue visits" })).not.toBeInTheDocument();
    const folded = screen.getByText("No open visits are overdue.");
    expect(screen.getAllByText("No open visits are overdue.")).toHaveLength(1);
    expect(folded.closest("section")).toBeNull();
    expect(folded.parentElement).toBe(screen.getByRole("heading", { name: "Needs attention" }).closest("section")?.parentElement);
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

    renderNeedsAssessment();

    const awaiting = await screen.findByRole("region", { name: "Visits awaiting a decision" });
    expect(within(awaiting).getByText("2")).toBeInTheDocument();
    // A group count is never paired with a denominator it does not match.
    expect(within(awaiting).queryByText(/of 137/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/The Visits awaiting a decision queue loaded the first 4 of 137 matching cases/)).toHaveLength(1);
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

    renderNeedsAssessment();

    expect(await screen.findByText("This list could not be loaded. Please try again.", {}, { timeout: 5_000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/queue loaded the first/)).not.toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Visits awaiting a decision" })).not.toBeInTheDocument();
  });
});
