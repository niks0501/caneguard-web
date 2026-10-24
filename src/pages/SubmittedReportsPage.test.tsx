import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ZodError } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/ApiError";
import { AxiosError } from "axios";
import { createQueryClient } from "../app/queryClient";
import { mockReports } from "../data/mock/mockReports";
import { useExportReports, useReports } from "../hooks/useReports";
import { useFieldValidationQueue } from "../hooks/useFieldValidation";
import { SubmittedReportsPage } from "./SubmittedReportsPage";

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

function renderPage(
  initialEntry = "/reports",
  workspace: "reports" | "monitoring" = "reports",
) {
  const queryClient = createQueryClient();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SubmittedReportsPage workspace={workspace} />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { ...view, queryClient };
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

describe("SubmittedReportsPage", () => {
  it("uses URL filters for the server query and renders Laravel pagination", () => {
    renderPage(
      "/reports?page=2&status=submitted_unverified&predicted_label=rust&barangay=Mabini&date_from=2026-07-01&date_to=2026-07-27&sort=oldest",
    );

    expect(screen.getByText("32 matching reports")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Possible Condition" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Case Status" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Observed" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Nasugbu, Batangas").length).toBeGreaterThan(0);
    expect(screen.getByText("Reporter concern needs review")).toBeInTheDocument();
    expect(screen.queryByText(/Machine facts|GPS ±|Image quality:|Signature:|Attention band/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("Possible Condition: Smut").length).toBeGreaterThanOrEqual(1);
    const statusCell = screen.getByRole("cell", { name: "Field Validation" });
    const longStatusLabel = statusCell.querySelector(".status-badge__label");
    expect(longStatusLabel).toHaveClass("status-badge__label");
    expect(longStatusLabel?.parentElement).toHaveClass("status-badge");
    expect(
      screen.getAllByRole("link", { name: /Open CG-/ })[0],
    ).toHaveTextContent("Open");
  });

  it("renders the monitoring workspace with shared Quick views and register columns", () => {
    renderPage("/monitoring?concern=rssi", "monitoring");

    expect(screen.getByRole("heading", { name: "Monitoring workspace" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "RSSI" })).toHaveAttribute(
      "href",
      "/monitoring?concern=rssi",
    );
    expect(screen.getByRole("columnheader", { name: "Case" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Affected Area" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Reported concern" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Machine facts|GPS ±|Image quality:|Signature:|Attention band/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Schedule summary" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Visit calendar" })).not.toBeInTheDocument();
  });

  it("opens an operational queue as a filtered report workspace", () => {
    renderPage("/reports?queue=needs_review");

    expect(screen.getByRole("heading", { name: "Needs Review" })).toBeInTheDocument();
    expect(screen.getByText("Filtered operational workspace")).toBeInTheDocument();
  });

  it("exports the active filters without changing the report workspace", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue(new Blob(["csv"]));
    vi.mocked(useExportReports).mockReturnValue({
      isError: false,
      isPending: false,
      mutateAsync,
    } as unknown as ReturnType<typeof useExportReports>);
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickLink = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderPage(
      "/reports?status=submitted_unverified&predicted_label=rust&barangay=Mabini&date_from=2026-07-01&date_to=2026-07-27",
    );
    await user.click(screen.getByRole("button", { name: "Case CSV" }));

    // The export step states the scope, the whole-match rule and the identifiers.
    const dialog = await screen.findByRole("dialog", { name: "Download the case CSV?" });
    expect(within(dialog).getByText(/Every matching case is included, not just the visible page/)).toBeInTheDocument();
    expect(within(dialog).getByText(/includes farmer and farm references/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Barangay: Mabini/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Review status: Needs review/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Download Case CSV" }));

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      perPage: 15,
      status: "submitted_unverified",
      disease: "rust",
      barangay: "Mabini",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-27",
    }));
    expect(createObjectUrl).toHaveBeenCalledOnce();
    // A scope- and date-aware filename, not a generic export name.
    expect(clickLink.mock.instances[0]).toHaveProperty(
      "download",
      "caneguard-cases-mabini-2026-07-01_to_2026-07-27.csv",
    );
    expect(screen.getByRole("heading", { name: "Recent submissions" })).toBeInTheDocument();
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
    clickLink.mockRestore();
  });

  it("stores filter and page changes in the URL and resets the page", async () => {
    const user = userEvent.setup();
    renderPage("/reports?page=3&workflow_status=resolved");

    await user.selectOptions(
      screen.getByLabelText("Status"),
      "field_validation",
    );

    expect(screen.getByTestId("location")).toHaveTextContent(
      "?workflow_status=field_validation",
    );

    await user.click(screen.getByRole("button", { name: "Go to page 2" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "?workflow_status=field_validation&page=2",
    );
  });

  it("invalidates only the current query when refreshing", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderPage("/reports?status=resolved");
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(screen.getByRole("button", { name: "Refresh queue" }));

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: [
        "reports",
        "list",
        expect.objectContaining({
          status: "resolved",
          page: 1,
          perPage: 15,
        }),
      ],
      exact: true,
    });
  });

  it("blocks malformed URL state before sending a request", () => {
    renderPage("/reports?status=confirmed&page=nope");

    expect(
      screen.getByText(/URL contains an invalid filter or page/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Open CG-/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("32 matching reports")).not.toBeInTheDocument();
  });

  it("keeps the primary queue controls in front and every applied filter removable", async () => {
    const user = userEvent.setup();
    renderPage("/reports?queue=needs_review&barangay=Mabini&reviewer=officer-1");
    await waitFor(() => expect(useReports).toHaveBeenCalled());

    const primary = screen.getByLabelText("Queue").closest(".filter-bar") as HTMLElement;
    expect(within(primary).getByLabelText("Search reports")).toBeInTheDocument();
    expect(within(primary).getByLabelText("Sort by")).toBeInTheDocument();
    // Less common filters stay available without crowding the primary row.
    expect(within(primary).queryByLabelText("Field Inspector")).not.toBeInTheDocument();

    const chips = screen.getByRole("group", { name: /Applied:/ });
    expect(within(chips).getByText("Queue: Needs Review")).toBeInTheDocument();
    expect(within(chips).getByText("Barangay: Mabini")).toBeInTheDocument();
    expect(within(chips).getByText("Field Inspector: Field Officer")).toBeInTheDocument();

    await user.click(within(chips).getByRole("button", { name: /Remove Barangay: Mabini/ }));
    expect(screen.getByTestId("location")).not.toHaveTextContent("barangay=Mabini");
    expect(screen.getByTestId("location")).toHaveTextContent("queue=needs_review");
  });

  it("names a filter the document cannot carry once, even when two URL keys mean Status", async () => {
    const user = userEvent.setup();
    renderPage("/reports?status=submitted_unverified&workflow_status=field_validation");

    await user.click(screen.getByRole("button", { name: "Filtered printable report" }));

    const dialog = await screen.findByRole("dialog", { name: "Generate report" });
    expect(within(dialog).getByText("Not carried into this document: Status.")).toBeInTheDocument();
  });

  it("names every supported filter it sends to the server", async () => {
    const user = userEvent.setup();
    renderPage("/reports?case_state=closed&verification_outcome=verified&field_validation_state=completed");

    const chips = screen.getByRole("group", { name: /Applied:/ });
    expect(within(chips).getByText("Case state: Closed")).toBeInTheDocument();
    expect(within(chips).getByText("Verification: Verified")).toBeInTheDocument();
    expect(within(chips).getByText("Field validation: Completed")).toBeInTheDocument();

    await user.click(within(chips).getByRole("button", { name: /Remove Case state: Closed/ }));
    expect(screen.getByTestId("location")).not.toHaveTextContent("case_state=");
    expect(screen.getByTestId("location")).toHaveTextContent("verification_outcome=verified");
  });

  it("names a bookmarked review-status filter as an applied, removable filter", async () => {
    const user = userEvent.setup();
    renderPage("/reports?status=submitted_unverified");

    const chips = screen.getByRole("group", { name: /Applied:/ });
    expect(within(chips).getByText("Review status: Needs review")).toBeInTheDocument();

    await user.click(within(chips).getByRole("button", { name: /Remove Review status: Needs review/ }));
    expect(screen.getByTestId("location")).not.toHaveTextContent("status=");
  });

  it("never presents a filtered view as All submitted reports", async () => {
    const { unmount } = renderPage("/reports");
    const saved = screen.getByRole("navigation", { name: "Report saved views" });
    expect(within(saved).getByRole("link", { name: "All submitted reports" })).toHaveAttribute("aria-current", "page");
    unmount();

    renderPage("/reports?queue=needs_review");
    const filtered = screen.getByRole("navigation", { name: "Report saved views" });
    expect(within(filtered).getByRole("link", { name: "All submitted reports" })).not.toHaveAttribute("aria-current");
    expect(within(filtered).getByText("Filtered view")).toHaveAttribute("aria-current", "page");
  });

  it("clears every filter back to the documented default view", async () => {
    const user = userEvent.setup();
    renderPage("/reports?queue=needs_review&barangay=Mabini&sort=oldest&page=2");
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getByTestId("location")).toHaveTextContent(/^$/);
    expect(screen.getByLabelText("Sort by")).toHaveValue("due_soonest");
  });

  it("stamps queue freshness in 12-hour Manila time and marks stale data", async () => {
    const { unmount } = renderPage();
    const freshness = screen.getByText("Last updated").closest("p") as HTMLElement;
    expect(freshness).toHaveTextContent(/\d{1,2}:\d{2}:\d{2}\s?(AM|PM)/);
    expect(within(freshness).getByText(/, read from the server/)).toBeInTheDocument();
    unmount();

    vi.mocked(useReports).mockReturnValue(
      reportsResult({ isRefetchError: true }),
    );
    renderPage();
    const stale = screen.getByText("Showing data from").closest("p") as HTMLElement;
    expect(stale).not.toHaveTextContent("Last updated");
    expect(within(stale).getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("keeps developer diagnostics out of the staff-facing connection message", () => {
    vi.mocked(useReports).mockReturnValue(
      reportsResult({
        data: undefined,
        error: new ApiError("Network Error", { cause: new AxiosError("Network Error") }),
        isError: true,
        isSuccess: false,
      }),
    );
    renderPage();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Check your connection");
    expect(alert).toHaveTextContent("contact your office administrator");
    expect(alert).not.toHaveTextContent("VITE_API_BASE_URL");
    expect(alert).not.toHaveTextContent("Start the API server");
    expect(within(alert).getByText("Technical details")).toBeInTheDocument();
    expect(within(alert).getByText(/sends requests to http/)).toBeInTheDocument();
  });

  it("distinguishes empty data from no filter matches", () => {
    vi.mocked(useReports).mockReturnValue(
      reportsResult({
        data: {
          reports: [],
          meta: { ...pageData.meta, from: null, to: null, total: 0 },
        },
      }),
    );
    const view = renderPage();
    expect(screen.getByText("No submitted reports yet")).toBeInTheDocument();

    view.unmount();
    renderPage("/reports?barangay=Mabini");
    expect(
      screen.getByText("No reports match these filters"),
    ).toBeInTheDocument();
  });

  it("distinguishes denied, invalid, unavailable, and malformed responses", () => {
    const cases = [
      {
        error: new ApiError("Forbidden", { status: 403 }),
        message: "does not have access",
      },
      {
        error: new ApiError("Invalid", { status: 422 }),
        message: "rejected one or more report filters",
      },
      {
        error: new ApiError("Network Error", { cause: new AxiosError("Network Error") }),
        message: "CaneGuard cannot be reached right now",
      },
      {
        error: new ApiError("Unavailable", { status: 503 }),
        message: "service is unavailable",
      },
      {
        error: new ApiError("Slow down", { status: 429 }),
        message: "too many requests",
      },
      {
        error: new ZodError([]),
        message: "unexpected format",
      },
    ];

    const { rerender } = renderPage();
    for (const testCase of cases) {
      vi.mocked(useReports).mockReturnValue(
        reportsResult({
          data: undefined,
          error: testCase.error,
          isError: true,
          isSuccess: false,
        }),
      );
      rerender(
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter>
            <SubmittedReportsPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      expect(screen.getByText(new RegExp(testCase.message, "i"))).toBeInTheDocument();
    }
  });

  it("keeps cached rows visible during refresh and refresh failure", () => {
    vi.mocked(useReports).mockReturnValue(
      reportsResult({
        isFetching: true,
        isRefetchError: true,
        isError: true,
      }),
    );
    renderPage();

    expect(screen.getByText(/Refreshing this server-filtered queue/i)).toBeInTheDocument();
    expect(screen.getByText(/latest refresh failed/i)).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /Open CG-/ })[0],
    ).toBeInTheDocument();
  });

  it("keeps a cached no-match state visible after refresh failure", () => {
    vi.mocked(useReports).mockReturnValue(
      reportsResult({
        data: {
          reports: [],
          meta: { ...pageData.meta, from: null, to: null, total: 0 },
        },
        isError: true,
        isRefetchError: true,
        isSuccess: false,
      }),
    );
    renderPage("/reports?barangay=Wawa");

    expect(
      screen.getByText("No reports match these filters"),
    ).toBeInTheDocument();
    expect(screen.getByText(/latest refresh failed/i)).toBeInTheDocument();
  });

  it("suppresses cached report rows when access is revoked", () => {
    vi.mocked(useReports).mockReturnValue(
      reportsResult({
        error: new ApiError("Forbidden", { status: 403 }),
        isError: true,
        isRefetchError: true,
      }),
    );
    renderPage();

    expect(screen.getByText(/does not have access/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Open CG-/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("32 matching reports")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh queue" }),
    ).toBeDisabled();
    expect(screen.queryByText(/latest refresh failed/i)).not.toBeInTheDocument();
  });
  it("offers the queue, status, reviewer and operational sorts without confidence sorting", () => {
    renderPage("/reports");

    const sort = screen.getByLabelText("Sort by");
    const sortOptions = Array.from(sort.querySelectorAll("option")).map(
      (option) => option.textContent,
    );
    expect(sortOptions).toEqual([
      "Due soonest",
      "Oldest submitted first",
      "Newest submitted first",
    ]);
    expect(screen.getByLabelText("Queue")).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
    expect(screen.getByLabelText("Field Inspector")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Staff-classified condition"),
    ).toBeInTheDocument();
  });

  it("filters by the one workflow status, the reviewer and the classification", async () => {
    const user = userEvent.setup();
    renderPage("/reports");

    await user.selectOptions(screen.getByLabelText("Status"), "field_validation");
    expect(screen.getByTestId("location")).toHaveTextContent(
      "?workflow_status=field_validation",
    );

    await user.selectOptions(screen.getByLabelText("Field Inspector"), "officer-1");
    expect(screen.getByTestId("location")).toHaveTextContent(
      "reviewer=officer-1",
    );

    await user.selectOptions(
      screen.getByLabelText("Staff-classified condition"),
      "rust",
    );
    expect(screen.getByTestId("location")).toHaveTextContent(
      "authority_classified_condition=rust",
    );
  });

});
