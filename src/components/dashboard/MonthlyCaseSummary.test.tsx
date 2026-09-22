import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MonthlyCaseSummary } from "./MonthlyCaseSummary";

const summary = {
  month: "2026-07",
  period: { from: "2026-07-01", to: "2026-07-31" },
  reportedCases: 4,
  casesByBarangay: [{ barangay: "Mabini", reportedCases: 3 }],
  casesByPossibleCondition: [{ possibleCondition: "rust" as const, reportedCases: 2 }],
  estimatedAffectedHectares: 3.75,
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
  it("keeps the UTC monthly panel without the chart-covered breakdown lists", () => {
    render(
      <MonthlyCaseSummary
        summary={summary}
        month="2026-07"
        onMonthChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("region", { name: "Monthly submitted report summary" })).toHaveTextContent(
      "These are operational report counts, not population-level disease statistics.",
    );
    // Barangay and Possible Condition lists moved to the PHT Report
    // analytics charts; the panel keeps metric tiles and review time.
    expect(screen.queryByRole("heading", { name: "Submitted reports by barangay" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Submitted reports by Possible Condition" })).not.toBeInTheDocument();
    expect(screen.getByText(/Barangay and Possible Condition breakdowns now render as charts/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Field-validation counts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review time" })).toBeInTheDocument();
    expect(screen.queryByText(/prevalence|infection rate|outbreak probability|disease risk score/i)).not.toBeInTheDocument();
  });
});
