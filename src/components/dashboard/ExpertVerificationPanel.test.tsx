import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MonthlyReportSummary } from "../../domain/dashboard.types";
import {
  ExpertVerificationPanel,
  ExpertVerificationPanelView,
} from "./ExpertVerificationPanel";
import { useMonthlyReportSummary } from "../../hooks/useReports";

vi.mock("../../hooks/useReports", () => ({
  useMonthlyReportSummary: vi.fn(),
}));

const mockSummaryWithData: MonthlyReportSummary = {
  month: "2026-07",
  period: { from: "2026-07-01", to: "2026-07-31" },
  reportedCases: 6,
  expertVerification: {
    consultVolume: {
      total: 6,
      consultedCases: 6,
      pending: 3,
      inProgress: 1,
      completed: 2,
      cancelled: 0,
    },
    expertAgreement: {
      count: 2,
      denominator: 2,
      rate: 1.0,
      percentage: 100,
    },
    unableToClassifyRate: {
      count: 1,
      denominator: 2,
      rate: 0.5,
      percentage: 50,
    },
    symptomVerificationDisagreement: {
      count: 0,
      denominator: 2,
      rate: 0,
      percentage: 0,
    },
  },
};

const mockSummaryEmpty: MonthlyReportSummary = {
  month: "2026-08",
  period: { from: "2026-08-01", to: "2026-08-31" },
  reportedCases: 0,
  expertVerification: {
    consultVolume: {
      total: 0,
      consultedCases: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0,
    },
    expertAgreement: {
      count: 0,
      denominator: 0,
      rate: null,
      percentage: null,
    },
    unableToClassifyRate: {
      count: 0,
      denominator: 0,
      rate: null,
      percentage: null,
    },
    symptomVerificationDisagreement: {
      count: 0,
      denominator: 0,
      rate: null,
      percentage: null,
    },
  },
};

describe("ExpertVerificationPanelView", () => {
  it("renders loading state when pending", () => {
    render(
      <ExpertVerificationPanelView
        month="2026-07"
        isPending={true}
      />,
    );

    expect(screen.getByText("Expert verification")).toBeInTheDocument();
    expect(screen.getByText("Loading expert verification numbers...")).toBeInTheDocument();
  });

  it("renders error state with retry button when error occurs", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();

    render(
      <ExpertVerificationPanelView
        month="2026-07"
        isError={true}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Expert verification")).toBeInTheDocument();
    expect(
      screen.getByText("The monthly expert-verification numbers could not be loaded."),
    ).toBeInTheDocument();

    const retryBtn = screen.getByRole("button", { name: "Try again" });
    await user.click(retryBtn);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders empty state when there are zero consults for the month", () => {
    render(
      <ExpertVerificationPanelView
        month="2026-08"
        data={mockSummaryEmpty}
        isPending={false}
        isError={false}
      />,
    );

    expect(screen.getByText("Expert verification")).toBeInTheDocument();
    expect(
      screen.getByText("No expert verification consults recorded for this month."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Monthly expert consult outcomes for 2026-08. Read-only operational summary from recorded expert evaluations."),
    ).toBeInTheDocument();
  });

  it("renders counts by outcome with plain short labels in populated state", () => {
    render(
      <ExpertVerificationPanelView
        month="2026-07"
        data={mockSummaryWithData}
        isPending={false}
        isError={false}
      />,
    );

    const section = screen.getByRole("region", { name: "Expert verification" });
    expect(section).toBeInTheDocument();

    expect(
      within(section).getByText("Monthly expert consult outcomes for 2026-07. Read-only operational summary from recorded expert evaluations."),
    ).toBeInTheDocument();

    // Top metrics
    expect(within(section).getByText("Total consults")).toBeInTheDocument();
    expect(within(section).getByText("6")).toBeInTheDocument();

    // Consult status breakdown
    const consultStatus = within(section).getByRole("region", { name: "Consult status" });
    expect(within(consultStatus).getByText("Completed")).toBeInTheDocument();
    expect(within(consultStatus).getByText("2")).toBeInTheDocument();
    expect(within(consultStatus).getByText("In progress")).toBeInTheDocument();
    expect(within(consultStatus).getByText("1")).toBeInTheDocument();
    expect(within(consultStatus).getByText("Pending")).toBeInTheDocument();
    expect(within(consultStatus).getByText("3")).toBeInTheDocument();
    expect(within(consultStatus).getByText("Cancelled")).toBeInTheDocument();
    expect(within(consultStatus).getByText("0")).toBeInTheDocument();

    // Finding outcomes breakdown
    const findingOutcomes = within(section).getByRole("region", { name: "Finding outcomes" });
    expect(within(findingOutcomes).getByText("Agreed with AI")).toBeInTheDocument();
    expect(within(findingOutcomes).getByText("Unable to classify")).toBeInTheDocument();
    expect(within(findingOutcomes).getByText("Symptom disagreement")).toBeInTheDocument();
  });

  it("delegates to useMonthlyReportSummary in connected container component", () => {
    vi.mocked(useMonthlyReportSummary).mockReturnValue({
      data: mockSummaryWithData,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useMonthlyReportSummary>);

    render(<ExpertVerificationPanel month="2026-07" />);

    expect(useMonthlyReportSummary).toHaveBeenCalledWith("2026-07");
    expect(screen.getByRole("region", { name: "Expert verification" })).toBeInTheDocument();
    expect(screen.getByText("Total consults")).toBeInTheDocument();
  });
});
