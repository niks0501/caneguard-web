import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../app/queryClient";
import { mockReports } from "../data/mock/mockReports";
import { useExportReports, useReports } from "../hooks/useReports";
import { useFieldValidationQueue } from "../hooks/useFieldValidation";
import { SubmittedReportsPage } from "./SubmittedReportsPage";

/**
 * QF-6 interface proposal: one control line with queue tabs, search and sort, a
 * Filters side panel with focus handling, applied chips and one Export menu.
 *
 * These tests describe the new interface; they are a proposal, not proof.
 */

vi.mock("../hooks/useReports", () => ({
  useExportReports: vi.fn(),
  useReports: vi.fn(),
}));

vi.mock("../hooks/useFieldValidation", () => ({
  useFieldValidationQueue: vi.fn(),
}));

vi.mock("../hooks/useFieldReporters", () => ({
  useFieldReporters: vi.fn(() => ({
    data: [{ uuid: "officer-1", name: "Field Officer" }],
  })),
}));

const pageData = {
  reports: mockReports.slice(0, 2),
  meta: {
    currentPage: 1,
    from: 1,
    lastPage: 3,
    perPage: 15,
    to: 2,
    total: 32,
  },
};

function reportsResult(
  overrides: Record<string, unknown> = {},
): ReturnType<typeof useReports> {
  return {
    data: pageData,
    error: null,
    isError: false,
    isFetching: false,
    isPending: false,
    isRefetchError: false,
    isSuccess: true,
    dataUpdatedAt: Date.UTC(2026, 9, 23, 13, 14, 3),
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useReports>;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

function renderPage(initialEntry = "/reports") {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SubmittedReportsPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function filtersTrigger() {
  return screen.getByRole("button", { name: /^Filters/ });
}

function filtersPanel() {
  return document.getElementById("queue-filters-panel") as HTMLElement;
}

beforeEach(() => {
  vi.mocked(useReports).mockReturnValue(reportsResult());
  vi.mocked(useFieldValidationQueue).mockReturnValue({
    data: {
      queue: "needs_visit",
      count: 0,
      total: 0,
      page: 1,
      perPage: 100,
      oldest: null,
      items: [],
    },
    error: null,
    isError: false,
    isFetching: false,
    isPending: false,
    isRefetchError: false,
    isSuccess: true,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useFieldValidationQueue>);
  vi.mocked(useExportReports).mockReturnValue({
    isError: false,
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue(new Blob(["csv"])),
  } as unknown as ReturnType<typeof useExportReports>);
});

describe("QF-6 reports filters", () => {
  it("keeps the queue tabs, search and sort on one line and the rest in the panel", () => {
    renderPage();

    const line = filtersTrigger().closest(".filter-bar") as HTMLElement;
    const tabs = within(line).getByRole("tablist", { name: "Queue" });
    expect(
      within(tabs).getAllByRole("tab").map((tab) => tab.textContent),
    ).toEqual([
      "All",
      "Needs review",
      "Needs visit",
      "Follow-up due",
      "Upcoming",
      "Unverified",
    ]);
    expect(within(line).getByLabelText("Search reports")).toBeInTheDocument();
    expect(within(line).getByLabelText("Sort by")).toBeInTheDocument();
    expect(within(line).getByRole("button", { name: /^Filters/ })).toBeInTheDocument();

    // The nine filters are reachable without crowding the line.
    expect(within(line).queryByLabelText("Status")).not.toBeInTheDocument();
    expect(
      within(filtersPanel()).getByLabelText("Status"),
    ).toBeInTheDocument();
  });

  it("marks the active queue tab and moves the queue filter to the URL", async () => {
    const user = userEvent.setup();
    renderPage("/reports?queue=needs_review");

    expect(screen.getByRole("tab", { name: "Needs review" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute(
      "aria-selected",
      "false",
    );

    await user.click(screen.getByRole("tab", { name: "Needs visit" }));
    expect(screen.getByTestId("location")).toHaveTextContent("queue=needs_visit");

    await user.click(screen.getByRole("tab", { name: "All" }));
    expect(screen.getByTestId("location")).not.toHaveTextContent("queue=");
  });

  it("moves between queue tabs with the arrow keys", async () => {
    const user = userEvent.setup();
    renderPage();

    const all = screen.getByRole("tab", { name: "All" });
    all.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Needs review" })).toHaveFocus();
    expect(screen.getByTestId("location")).toHaveTextContent(
      "queue=needs_review",
    );

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "All" })).toHaveFocus();
    expect(screen.getByTestId("location")).not.toHaveTextContent("queue=");
  });

  it("opens the Filters side panel, keeps focus inside and returns it to the trigger", async () => {
    const user = userEvent.setup();
    renderPage();

    const trigger = filtersTrigger();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(filtersPanel()).toHaveAttribute("inert");

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("dialog", { name: "Filters" });
    expect(panel).toBe(filtersPanel());
    expect(panel).not.toHaveAttribute("inert");
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));

    await user.keyboard("{Escape}");

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(filtersPanel()).toHaveAttribute("inert");
  });

  it("closes the side panel from its close button and keeps every chosen filter", async () => {
    const user = userEvent.setup();
    renderPage("/reports?queue=needs_review");

    await user.click(filtersTrigger());
    await user.selectOptions(within(filtersPanel()).getByLabelText("Status"), "field_validation");
    expect(screen.getByTestId("location")).toHaveTextContent(
      "workflow_status=field_validation",
    );

    await user.click(screen.getByRole("button", { name: "Close filters" }));
    await waitFor(() => expect(filtersTrigger()).toHaveFocus());
    expect(screen.getByTestId("location")).toHaveTextContent(
      "workflow_status=field_validation",
    );
  });

  it("counts the panel filters on the trigger and lists them as removable chips", async () => {
    const user = userEvent.setup();
    renderPage("/reports?barangay=Mabini&reviewer=officer-1");

    expect(filtersTrigger()).toHaveTextContent("2");

    const chips = screen.getByRole("group", { name: /Applied:/ });
    expect(within(chips).getByText("Barangay: Mabini")).toBeInTheDocument();
    expect(within(chips).getByText("Field Inspector: Field Officer")).toBeInTheDocument();

    await user.click(
      within(chips).getByRole("button", { name: /Remove Barangay: Mabini/ }),
    );
    expect(screen.getByTestId("location")).not.toHaveTextContent("barangay=");
    expect(filtersTrigger()).toHaveTextContent("1");
  });

  it("keeps every export behind one Export menu", async () => {
    const user = userEvent.setup();
    renderPage();

    const header = screen.getByRole("banner");
    const menu = within(header).getByText("Export").closest("details") as HTMLElement;
    expect(within(menu).getByRole("button", { name: "Filtered printable report" })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "Case CSV" })).toBeInTheDocument();

    await user.click(within(menu).getByRole("button", { name: "Case CSV" }));
    expect(await screen.findByRole("dialog", { name: "Download the case CSV?" })).toBeInTheDocument();
    expect(menu).not.toHaveAttribute("open");
  });
});
