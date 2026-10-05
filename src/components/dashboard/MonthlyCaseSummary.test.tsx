import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MonthlyCaseSummary } from "./MonthlyCaseSummary";

const summary = {
  month: "2026-07",
  period: { from: "2026-07-01", to: "2026-07-31" },
  reportedCases: 4,
  casesByBarangay: [{ barangay: "Mabini", reportedCases: 3 }],
  casesByPossibleCondition: [{ possibleCondition: "rust" as const, reportedCases: 2 }],
  estimatedAffectedHectares: 3.75,
  reportsContainingFarmerFarmInformation: 2,
  fieldValidationCounts: {
    unassigned: 1,
    assigned: 1,
    inProgress: 0,
    completed: 2,
    requiringValidation: 1,
  },
  closedCases: 2,
  reviewTime: {
    source: "submitted_at_to_reviewed_at",
    reviewedCases: 2,
    averageHours: 30,
    medianHours: 30,
    minHours: 6,
    maxHours: 54,
  },
};

describe("MonthlyCaseSummary", () => {
  it("keeps only monthly report totals and field-validation workload in the summary", () => {
    render(
      <MonthlyCaseSummary
        summary={summary}
        month="2026-07"
        onMonthChange={vi.fn()}
      />,
    );

    const monthly = screen.getByRole("region", { name: "Monthly submitted report summary" });
    expect(monthly).toHaveTextContent("Counts describe reports submitted during 2026-07, not population-level disease statistics.");
    const summaryView = within(monthly);
    expect(summaryView.getByText("Submitted reports")).toBeInTheDocument();
    expect(summaryView.getByText("Estimated affected area")).toBeInTheDocument();
    expect(summaryView.getByText("Requiring field validation")).toBeInTheDocument();
    expect(summaryView.getByText("Closed submitted reports")).toBeInTheDocument();
    expect(summaryView.getByRole("heading", { name: "Field-validation counts" })).toBeInTheDocument();
    expect(summaryView.getByText("No assignment")).toBeInTheDocument();
    expect(summaryView.getByText("In progress")).toBeInTheDocument();
    expect(summaryView.queryByRole("heading", { name: "Review time" })).not.toBeInTheDocument();
    expect(summaryView.queryByText(/farmer|barangay and possible condition breakdowns/i)).not.toBeInTheDocument();
    expect(summaryView.queryByText(/prevalence|infection rate|outbreak probability|disease risk score/i)).not.toBeInTheDocument();
  });
});
