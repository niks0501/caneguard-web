import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ZodError } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/ApiError";
import { createQueryClient } from "../app/queryClient";
import { mockReports } from "../data/mock/mockReports";
import { useReports } from "../hooks/useReports";
import { SubmittedReportsPage } from "./SubmittedReportsPage";

vi.mock("../hooks/useReports", () => ({
  useReports: vi.fn(),
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

function renderPage(initialEntry = "/reports") {
  const queryClient = createQueryClient();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SubmittedReportsPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { ...view, queryClient };
}

beforeEach(() => {
  vi.mocked(useReports).mockReturnValue(reportsResult());
});

describe("SubmittedReportsPage", () => {
  it("uses URL filters for the server query and renders Laravel pagination", () => {
    renderPage(
      "/reports?page=2&status=submitted_unverified&predicted_label=rust&barangay=Mabini&date_from=2026-07-01&date_to=2026-07-27&sort=confidence_desc",
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
        sort: "confidence_desc",
      }),
      { enabled: true },
    );
    expect(screen.getByText("32 matching reports")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Possible result" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /Open CG-/ })[0],
    ).toHaveTextContent("Open");
  });

  it("stores filter and page changes in the URL and resets the page", async () => {
    const user = userEvent.setup();
    renderPage("/reports?page=3&status=resolved");

    await user.selectOptions(
      screen.getByLabelText("Status"),
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
});
