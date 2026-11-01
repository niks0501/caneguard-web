import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../app/queryClient";
import { env } from "../config/env";
import { reportListItemDto } from "../test/fixtures";
import { server } from "../test/server";
import { MonitoringWorkspacePage } from "./MonitoringWorkspacePage";

vi.mock("./FieldValidationMapPage", () => ({ FieldValidationMapPage: () => <p>Map view</p> }));

/**
 * PROTECTED FEATURE-CONTRACT TESTS - Monitoring Register / Visit Calendar redesign.
 *
 * Oracle: approved Feature Contract dated 2026-10-07.
 * These tests intentionally assert externally observable behavior and avoid
 * asserting component names, CSS classes, data-fetching implementation, or a
 * particular schedule-summary endpoint.
 *
 * Baseline expectation:
 * - Several tests FAIL because the baseline still embeds the full calendar in
 *   the Register, still exposes "Saved views" and "Inspector schedule", has no
 *   schedule summary, has no selected-day agenda, and renders every visit in a
 *   busy date cell.
 * - Existing read-only/error behavior may already PASS and acts as regression
 *   protection.
 */

const apiBase = env.apiBaseUrl;
const OFFICE_TODAY = "2026-10-07";

type QueueItem = ReturnType<typeof scheduleItem>;

function scheduleItem(
  index: number,
  targetVisitDate: string | null,
  options: {
    assignee?: { uuid: string; name: string } | null;
    barangay?: string;
    observedAt?: string | null;
    submittedAt?: string;
    uuid?: string;
  } = {},
) {
  return {
    uuid: options.uuid ?? `schedule-${String(index).padStart(3, "0")}`,
    reference_code: `CG-SCHED-${String(index).padStart(3, "0")}`,
    barangay: options.barangay ?? "Balaytigui",
    farm_reference: `Farm ${index}`,
    province: "Batangas",
    municipality: "Nasugbu",
    observed_at: options.observedAt === undefined
      ? `2026-09-${String(Math.min(index, 28)).padStart(2, "0")}T01:00:00.000Z`
      : options.observedAt,
    submitted_at: options.submittedAt ?? `2026-09-${String(Math.min(index, 28)).padStart(2, "0")}T02:00:00.000Z`,
    predicted_label: "rust" as const,
    confidence: 0.84,
    review_status: "for_field_validation" as const,
    lifecycle: {
      case_state: "open" as const,
      verification_outcome: "not_determined" as const,
      field_validation_state: targetVisitDate === null ? "assigned" as const : "assigned" as const,
      referral_state: "not_referred" as const,
    },
    target_visit_date: targetVisitDate,
    assignee: options.assignee === undefined
      ? { uuid: `inspector-${index}`, name: `Inspector ${index}` }
      : options.assignee,
    final_latitude: null,
    final_longitude: null,
    location_source: "unavailable" as const,
    location_unavailable: true,
    location_unavailable_reason: "offline_no_map" as const,
    gps_accuracy: null,
    affected_area_hectares: null,
    affected_portion_percent: null,
  };
}

function reportListResponse() {
  return {
    data: [reportListItemDto],
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

let queueItems: QueueItem[] = [];
let queueFailureStatus: number | null = null;

function queueForRequest(request: Request) {
  const query = new URL(request.url).searchParams;
  const queue = query.get("queue") ?? "needs_visit";
  const dueFrom = query.get("due_from");
  const dueTo = query.get("due_to");
  const limit = Number(query.get("limit") ?? "50");
  const page = Number(query.get("page") ?? "1");

  let items = [...queueItems];

  if (queue === "follow_up_due") {
    items = items.filter((item) => item.target_visit_date !== null && item.target_visit_date < OFFICE_TODAY);
  } else if (queue === "upcoming") {
    items = items.filter((item) => item.target_visit_date !== null && item.target_visit_date >= OFFICE_TODAY);
  }

  if (dueFrom || dueTo) {
    items = items.filter((item) => {
      if (!item.target_visit_date) return false;
      if (dueFrom && item.target_visit_date < dueFrom) return false;
      if (dueTo && item.target_visit_date > dueTo) return false;
      return true;
    });
  }

  const total = items.length;
  const start = (page - 1) * limit;
  const paged = items.slice(start, start + limit);

  return {
    data: {
      queue,
      count: total,
      total,
      page,
      per_page: limit,
      oldest: items[0] ?? null,
      items: paged,
    },
  };
}

function installApi() {
  server.use(
    http.get(`${apiBase}/api/v1/reports`, () => HttpResponse.json(reportListResponse())),
    http.get(`${apiBase}/api/v1/field-reporters`, () => HttpResponse.json({
      data: [{ uuid: "inspector-1", name: "Inspector 1" }],
    })),
    http.get(`${apiBase}/api/v1/reports/field-validation-queue`, ({ request }) => {
      if (queueFailureStatus) {
        return HttpResponse.json(
          { message: "Schedule unavailable", code: "SCHEDULE_UNAVAILABLE" },
          { status: queueFailureStatus },
        );
      }
      return HttpResponse.json(queueForRequest(request));
    }),
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderWorkspace(initialEntry = "/monitoring?view=register") {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <MonitoringWorkspacePage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function summaryRegion(): HTMLElement {
  const heading = screen.getByText(/schedule summary/i);
  const region = heading.closest("section, aside, article, div");
  if (!region) throw new Error("Schedule summary must have a containing region");
  return region as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T04:00:00.000Z"));
  queueItems = [];
  queueFailureStatus = null;
  installApi();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Monitoring Register contract", () => {
  it("REGISTER: keeps the case table, exposes Quick views, and does not embed the full month calendar", async () => {
    renderWorkspace("/monitoring?concern=rssi&view=register");

    expect(await screen.findByText(reportListItemDto.reference_code)).toBeInTheDocument();
    expect(screen.getByText("Quick views")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All cases" })).toHaveAttribute("href", "/monitoring?view=register");
    expect(screen.getByRole("link", { name: "RSSI" })).toHaveAttribute("href", "/monitoring?concern=rssi&view=register");
    expect(screen.getByRole("link", { name: "Follow-up due" })).toHaveAttribute("href", "/monitoring?queue=follow_up_due&view=register");
    expect(screen.getByRole("link", { name: "Upcoming visits" })).toHaveAttribute("href", "/monitoring?queue=upcoming&view=register");

    expect(screen.queryByRole("grid", { name: /scheduled visits|visit calendar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Visit calendar" })).not.toBeInTheDocument();
  });

  it("QUICK VIEWS: selecting a preset clears prior case filters and restarts from page 1", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWorkspace("/monitoring?concern=rssi&barangay=Mabini&page=3&view=register");
    await screen.findByText(reportListItemDto.reference_code);

    await user.click(screen.getByRole("link", { name: "Upcoming visits" }));

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/monitoring?queue=upcoming&view=register"),
    );
  });

  it("QUICK VIEWS: All cases clears the active preset and manual Register filters", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWorkspace("/monitoring?queue=follow_up_due&barangay=Mabini&page=2&view=register");
    await screen.findByText(reportListItemDto.reference_code);

    await user.click(screen.getByRole("link", { name: "All cases" }));

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/monitoring?view=register"),
    );
  });

  it("REGISTER: exposes one canonical Calendar workspace and removes the duplicate Inspector schedule destination", async () => {
    renderWorkspace();
    await screen.findByText(reportListItemDto.reference_code);

    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/monitoring?view=calendar");
    expect(screen.queryByRole("link", { name: "Inspector schedule" })).not.toBeInTheDocument();
  });

  it("SUMMARY: shows Overdue, Today, Next 7 days, and Unscheduled without counting later future work", async () => {
    queueItems = [
      scheduleItem(1, "2026-10-06"),
      scheduleItem(2, "2026-10-07"),
      scheduleItem(3, "2026-10-08"),
      scheduleItem(4, "2026-10-14"),
      scheduleItem(5, "2026-10-15"),
      scheduleItem(6, null),
    ];

    renderWorkspace();
    await screen.findByText(reportListItemDto.reference_code);

    const summary = summaryRegion();
    expect(summary).toHaveTextContent(/Overdue\s*1/i);
    expect(summary).toHaveTextContent(/Today\s*1/i);
    expect(summary).toHaveTextContent(/Next 7 days\s*2/i);
    expect(summary).toHaveTextContent(/Unscheduled\s*1/i);
    expect(within(summary).getByRole("link", { name: /open calendar/i })).toHaveAttribute(
      "href",
      "/monitoring?view=calendar",
    );
  });

  it("SUMMARY: remains global when the Register is filtered", async () => {
    queueItems = [
      scheduleItem(1, "2026-10-06", { barangay: "Balaytigui" }),
      scheduleItem(2, "2026-10-07", { barangay: "Wawa" }),
      scheduleItem(3, "2026-10-08", { barangay: "Balaytigui" }),
      scheduleItem(4, null, { barangay: "Wawa" }),
    ];

    renderWorkspace("/monitoring?barangay=Balaytigui&concern=rssi&view=register");
    await screen.findByText(reportListItemDto.reference_code);

    const summary = summaryRegion();
    expect(summary).toHaveTextContent(/Overdue\s*1/i);
    expect(summary).toHaveTextContent(/Today\s*1/i);
    expect(summary).toHaveTextContent(/Next 7 days\s*1/i);
    expect(summary).toHaveTextContent(/Unscheduled\s*1/i);
  });

  it("SUMMARY: metric labels are informational and Open Calendar is the only schedule navigation action", async () => {
    queueItems = [scheduleItem(1, "2026-10-07")];
    renderWorkspace();
    await screen.findByText(reportListItemDto.reference_code);

    const summary = summaryRegion();
    for (const label of [/overdue/i, /today/i, /next 7 days/i, /unscheduled/i]) {
      expect(within(summary).queryByRole("link", { name: label })).not.toBeInTheDocument();
      expect(within(summary).queryByRole("button", { name: label })).not.toBeInTheDocument();
    }
    expect(within(summary).getAllByRole("link", { name: /open calendar/i })).toHaveLength(1);
  });

  it("FAILURE: a schedule-data failure leaves the Register usable and marks only the schedule summary unavailable", async () => {
    queueFailureStatus = 503;

    renderWorkspace();

    expect(await screen.findByText(reportListItemDto.reference_code)).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(await screen.findByText(/schedule.*(unavailable|could not|failed)/i)).toBeInTheDocument();
  });
});

describe("Visits default view contract", () => {
  it("DEFAULT: bare /monitoring opens the Map instead of the case table", async () => {
    renderWorkspace("/monitoring");

    expect(await screen.findByText("Map view")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Map" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("Quick views")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Case" })).not.toBeInTheDocument();
  });
});

describe("Visit Calendar contract", () => {
  it("EMPTY MONTH: keeps a usable month grid even when no visits are scheduled", async () => {
    renderWorkspace("/monitoring?view=calendar&calendar_month=2026-10");

    expect(await screen.findByRole("grid", { name: /October 2026/i })).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell").length).toBeGreaterThanOrEqual(28);
  });

  it.each([3, 5, 10, 50])(
    "DENSITY: %i visits never expand a date cell beyond two visible visit indicators and report exact overflow",
    async (visitCount) => {
      queueItems = Array.from({ length: visitCount }, (_, index) =>
        scheduleItem(index + 1, "2026-10-07"),
      );

      renderWorkspace("/monitoring?view=calendar&calendar_month=2026-10");

      const day = await screen.findByRole("gridcell", { name: /2026-10-07|October 7, 2026/i });
      expect(within(day).getAllByText(/CG-SCHED-/)).toHaveLength(2);
      expect(within(day).getByText(`+${visitCount - 2} more`)).toBeInTheDocument();
    },
  );

  it("ADJACENT MONTH: filler dates are inactive placeholders without schedule controls", async () => {
    queueItems = [scheduleItem(1, "2026-09-30")];
    renderWorkspace("/monitoring?view=calendar&calendar_month=2026-10");

    const filler = await screen.findByRole("gridcell", { name: /September 30, 2026|2026-09-30/i });
    expect(within(filler).queryByText("CG-SCHED-001")).not.toBeInTheDocument();
    expect(within(filler).queryByRole("link")).not.toBeInTheDocument();
    expect(within(filler).queryByRole("button")).not.toBeInTheDocument();
  });

  it("CELL SELECTION: selecting a compact visit selects its date instead of opening the case", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    queueItems = [scheduleItem(1, "2026-10-08")];
    renderWorkspace("/monitoring?view=calendar&calendar_month=2026-10");

    await user.click(await screen.findByText("CG-SCHED-001"));

    expect(screen.getByRole("heading", { name: /October 8, 2026/i })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/monitoring/);
  });

  it("AGENDA: selecting overflow exposes the complete selected-date workload, including Unassigned", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    queueItems = [
      scheduleItem(1, "2026-10-07"),
      scheduleItem(2, "2026-10-07"),
      scheduleItem(3, "2026-10-07"),
      scheduleItem(4, "2026-10-07"),
      scheduleItem(5, "2026-10-07", { assignee: null }),
    ];

    renderWorkspace("/monitoring?view=calendar&calendar_month=2026-10");

    await user.click(await screen.findByText("+3 more"));

    expect(screen.getByRole("heading", { name: /October 7, 2026/i })).toBeInTheDocument();
    expect(screen.getByText(/5 scheduled visits/i)).toBeInTheDocument();
    expect(screen.getByText("CG-SCHED-003")).toBeInTheDocument();
    expect(screen.getByText("CG-SCHED-004")).toBeInTheDocument();
    expect(screen.getByText("CG-SCHED-005")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });

  it("ORDERING: selected-day agenda orders known observations oldest first, null observations last, then submitted time and stable identity", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    queueItems = [
      scheduleItem(1, "2026-10-07", { observedAt: "2026-09-10T01:00:00.000Z", submittedAt: "2026-09-10T03:00:00.000Z", uuid: "z-case" }),
      scheduleItem(2, "2026-10-07", { observedAt: "2026-09-01T01:00:00.000Z", submittedAt: "2026-09-01T03:00:00.000Z", uuid: "b-case" }),
      scheduleItem(3, "2026-10-07", { observedAt: null, submittedAt: "2026-08-01T03:00:00.000Z", uuid: "a-case" }),
      scheduleItem(4, "2026-10-07", { observedAt: "2026-09-01T01:00:00.000Z", submittedAt: "2026-09-01T02:00:00.000Z", uuid: "c-case" }),
      scheduleItem(5, "2026-10-07", { observedAt: "2026-09-01T01:00:00.000Z", submittedAt: "2026-09-01T02:00:00.000Z", uuid: "a-case" }),
    ];

    renderWorkspace("/monitoring?view=calendar&calendar_month=2026-10");
    await user.click(await screen.findByText("+3 more"));

    const heading = screen.getByRole("heading", { name: /October 7, 2026/i });
    const agenda = heading.closest("section, aside, article, div");
    if (!agenda) throw new Error("Selected-day agenda must have a containing region");
    const text = agenda.textContent ?? "";

    const expected = ["CG-SCHED-005", "CG-SCHED-004", "CG-SCHED-002", "CG-SCHED-001", "CG-SCHED-003"];
    let previous = -1;
    for (const reference of expected) {
      const index = text.indexOf(reference);
      expect(index).toBeGreaterThan(previous);
      previous = index;
    }
  });

  it("SELECTION: current month selects the current office date, while another month asks the user to select a date", async () => {
    const current = renderWorkspace("/monitoring?view=calendar&calendar_month=2026-10");
    expect(await screen.findByRole("heading", { name: /October 7, 2026/i })).toBeInTheDocument();

    current.unmount();
    renderWorkspace("/monitoring?view=calendar&calendar_month=2026-11");
    expect(await screen.findByText(/select a date/i)).toBeInTheDocument();
  });

  it("TODAY: from another month returns to the office current month and selects the office current date", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderWorkspace("/monitoring?view=calendar&calendar_month=2026-11");
    await user.click(await screen.findByRole("button", { name: "Today" }));

    expect((await screen.findAllByText(/October 2026/i)).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: /October 7, 2026/i })).toBeInTheDocument();
  });

  it("READ ONLY: Calendar exposes no Add visit control and no appointment-time UI", async () => {
    queueItems = [scheduleItem(1, "2026-10-07")];
    renderWorkspace("/monitoring?view=calendar&calendar_month=2026-10");

    // The compact cell indicator and the complete selected-day agenda both name
    // the visit, so the read-only wait-for-data probe is scoped to the grid.
    await waitFor(() =>
      expect(within(screen.getByRole("grid")).getByText("CG-SCHED-001")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /add visit/i })).not.toBeInTheDocument();
    // The workspace freshness stamp carries a server-read clock time; the
    // calendar itself must still expose no appointment-time UI.
    const calendarBody = document.querySelector(".monitoring-calendar__body");
    expect(calendarBody).not.toBeNull();
    expect(
      within(calendarBody as HTMLElement).queryByText(/\b\d{1,2}:\d{2}\s*(AM|PM)\b/i),
    ).not.toBeInTheDocument();
  });

  it("AUTHORIZATION FAILURE: does not misrepresent forbidden schedule access as an empty month", async () => {
    server.use(
      http.get(`${apiBase}/api/v1/reports/field-validation-queue`, () =>
        HttpResponse.json({ message: "Forbidden", code: "FORBIDDEN" }, { status: 403 }),
      ),
    );

    renderWorkspace("/monitoring?view=calendar&calendar_month=2026-10");

    expect(await screen.findByText(/does not have access/i)).toBeInTheDocument();
    expect(screen.queryByText(/no scheduled visits/i)).not.toBeInTheDocument();
  });
});
