import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

function renderSummary() {
  render(
    <MonthlyCaseSummary
      summary={summary}
      month="2026-07"
      onMonthChange={vi.fn()}
    />,
  );
}

describe("MonthlyCaseSummary", () => {
  it("uses submitted-report wording and keeps Possible Conditions descriptive", async () => {
    renderSummary();
    const user = userEvent.setup();

    expect(screen.getByRole("region", { name: "Monthly submitted report summary" })).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Submitted reports by Possible Condition/ }),
    );

    expect(screen.getByText("Possible Condition: rust")).toBeInTheDocument();
    expect(screen.getByText("Possible Condition, decision support only")).toBeInTheDocument();
    expect(screen.queryByText(/prevalence|infection rate|outbreak probability|disease risk score/i)).not.toBeInTheDocument();
  });

  it("starts collapsed with a count hint and expands to reveal the barangay list", async () => {
    renderSummary();
    const user = userEvent.setup();

    const toggle = screen.getByRole("button", { name: /Submitted reports by barangay/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(toggle).getByText(/3 submitted reports/)).toBeInTheDocument();
    expect(screen.queryByText("Mabini")).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Mabini")).toBeInTheDocument();
    expect(screen.getByText("3 submitted reports")).toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Mabini")).not.toBeInTheDocument();
  });

  it("toggles the Possible Condition list with the keyboard", async () => {
    renderSummary();
    const user = userEvent.setup();

    const toggle = screen.getByRole("button", { name: /Submitted reports by Possible Condition/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Possible Condition: rust")).not.toBeInTheDocument();

    toggle.focus();
    await user.keyboard("{Enter}");

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Possible Condition: rust")).toBeInTheDocument();
    expect(screen.getByText("2 submitted reports")).toBeInTheDocument();

    await user.keyboard(" ");

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Possible Condition: rust")).not.toBeInTheDocument();
  });

  it("renders the empty state without a toggle", () => {
    render(
      <MonthlyCaseSummary
        summary={{ ...summary, casesByBarangay: [], casesByPossibleCondition: [] }}
        month="2026-07"
        onMonthChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /Submitted reports by barangay/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Submitted reports by Possible Condition/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("No submitted reports in this month.")).toHaveLength(2);
  });
});
