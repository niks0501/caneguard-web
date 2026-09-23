import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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

    expect(useReports).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        perPage: 15,
        status: "submitted_unverified",
        disease: "rust",
        barangay: "Mabini",
        dateFrom: "2026-07-01",
        dateTo: "2026-07-27",
        sort: "oldest",
      }),
      { enabled: true },
    );
    expect(screen.getByText("32 matching reports")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Possible Condition" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Work status" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Observed" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Nasugbu, Batangas").length).toBeGreaterThan(0);
    expect(screen.getByText("AI mismatch flagged")).toBeInTheDocument();
    expect(screen.getAllByText("Possible Condition: Smut").length).toBeGreaterThanOrEqual(1);
    const statusCell = screen.getByRole("cell", { name: "Needs field validation" });
    const longStatusLabel = statusCell.querySelector(".status-badge__label");
    expect(longStatusLabel).toHaveClass("status-badge__label");
    expect(longStatusLabel?.parentElement).toHaveClass("status-badge");
    expect(
      screen.getAllByRole("link", { name: /Open CG-/ })[0],
    ).toHaveTextContent("Open");
  });

  it("renders the monitoring workspace with shared saved views and register columns", () => {
    renderPage("/monitoring?concern=rssi", "monitoring");

    expect(screen.getByRole("heading", { name: "Monitoring workspace" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "RSSI concerns" })).toHaveAttribute(
      "href",
      "/monitoring?concern=rssi",
    );
    expect(screen.getByRole("columnheader", { name: "Reported concern" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Latest validation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Visit calendar" })).toBeInTheDocument();
    expect(useReports).toHaveBeenCalledWith(
      expect.objectContaining({ reportedConcern: "rssi" }),
      { enabled: true },
    );
    expect(useFieldValidationQueue).toHaveBeenCalledWith(
      expect.objectContaining({ dueFrom: expect.any(String), dueTo: expect.any(String) }),
      { enabled: true },
    );
  });

  it("opens an operational queue as a filtered report workspace", () => {
    renderPage("/reports?queue=needs_review");

    expect(useReports).toHaveBeenCalledWith(
      expect.objectContaining({ queue: "needs_review", page: 1 }),
      { enabled: true },
    );
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
    await user.click(screen.getByRole("button", { name: "Export CSV" }));

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
    expect(screen.getByRole("heading", { name: "Recent submissions" })).toBeInTheDocument();
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
    clickLink.mockRestore();
  });

  it("stores filter and page changes in the URL and resets the page", async () => {
    const user = userEvent.setup();
    renderPage("/reports?page=3&status=resolved");

    await user.selectOptions(
      screen.getByLabelText("Work status"),
      "for_field_validation",
    );

    expect(screen.getByTestId("location")).toHaveTextContent(
      "?status=for_field_validation",
    );

    await user.click(screen.getByRole("button", { name: "Go to page 2" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "?status=for_field_validation&page=2",
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

    expect(useReports).toHaveBeenCalledWith(
      expect.any(Object),
      { enabled: false },
    );
    expect(
      screen.getByText(/URL contains an invalid filter or page/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Open CG-/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("32 matching reports")).not.toBeInTheDocument();
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
        message: "Cannot connect to the CaneGuard API",
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
  it("defaults the unscoped work queue to the oldest submission", () => {
    renderPage("/reports");

    expect(useReports).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "oldest" }),
      { enabled: true },
    );
  });

  it("offers queue, work-status, and operational sorts without confidence sorting", () => {
    renderPage("/reports");

    const sort = screen.getByLabelText("Sort by");
    const sortOptions = Array.from(sort.querySelectorAll("option")).map(
      (option) => option.textContent,
    );
    expect(sortOptions).toEqual([
      "Oldest submitted first",
      "Newest submitted first",
      "Due soonest",
    ]);
    expect(screen.getByLabelText("Queue")).toBeInTheDocument();
    expect(screen.getByLabelText("Work status")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Staff-classified condition"),
    ).toBeInTheDocument();
  });

  it("filters by the independent lifecycle and classification concepts", async () => {
    const user = userEvent.setup();
    renderPage("/reports");

    await user.selectOptions(screen.getByLabelText("Case state"), "open");
    expect(screen.getByTestId("location")).toHaveTextContent("?case_state=open");

    await user.selectOptions(
      screen.getByLabelText("Field validation state"),
      "assigned",
    );
    expect(screen.getByTestId("location")).toHaveTextContent(
      "field_validation_state=assigned",
    );

    await user.selectOptions(
      screen.getByLabelText("Staff-classified condition"),
      "rust",
    );
    expect(screen.getByTestId("location")).toHaveTextContent(
      "authority_classified_condition=rust",
    );
  });

  it("orders the follow-up queue by the nearest due date", () => {
    renderPage("/reports?queue=follow_up_due");

    expect(useReports).toHaveBeenCalledWith(
      expect.objectContaining({ queue: "follow_up_due", sort: "due_soonest" }),
      { enabled: true },
    );
  });

});
