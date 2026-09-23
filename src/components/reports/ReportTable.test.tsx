import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { DiseaseReport } from "../../domain/report.types";
import { ReportTable } from "./ReportTable";

const mockNavigate = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function report(overrides: Partial<DiseaseReport> = {}): DiseaseReport {
  return {
    uuid: "00000000-0000-4000-8000-000000000001",
    referenceCode: "CG-2026-0001",
    barangay: "Balaytigui",
    province: "Batangas",
    municipality: "Nasugbu",
    submittedByName: "Ramon Dela Cruz",
    submitterRole: "field_reporter",
    capturedAt: "2026-07-18T07:42:00+08:00",
    submittedAt: "2026-07-18T09:16:00+08:00",
    predictedDisease: "rust",
    confidence: 0.95,
    imageStatus: "available",
    symptoms: [],
    reviewStatus: "submitted_unverified",
    ...overrides,
  };
}

function renderTable(
  reports: DiseaseReport[],
  variant: "default" | "monitoring" = "default",
) {
  return render(
    <MemoryRouter>
      <ReportTable reports={reports} variant={variant} />
    </MemoryRouter>,
  );
}

describe("ReportTable", () => {
  it("renders the monitoring register signals without merging reporter and staff concerns", () => {
    renderTable([
      report({
        farmReference: "Farm Alpha",
        reporterSuspectedCondition: "RSSI",
        authorityClassifiedCondition: "rssi",
        actionTaken: "technical_assistance_provided",
        latestValidation: {
          visitedAt: "2026-08-14T09:30:00.000Z",
          fieldObservation: "Fresh observation",
          finding: "Validation finding",
          actionTaken: "Field action",
          followUpOutcome: "worsened",
          assignee: { uuid: "officer-1", name: "Field Officer" },
        },
        followUp: { dueOn: "2026-08-20", overdue: true },
      }),
    ], "monitoring");

    expect(screen.getByRole("columnheader", { name: "Reported concern" })).toBeInTheDocument();
    expect(screen.getByText("Reported: RSSI")).toBeInTheDocument();
    expect(screen.getByText("Staff: RSSI")).toBeInTheDocument();
    expect(screen.getByText("Validation finding")).toBeInTheDocument();
    expect(screen.getByText("Follow-up: Worsened")).toBeInTheDocument();
    expect(screen.getByText("Technical assistance provided")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
  });

  it("labels the derived badge as Work status and never shows AI confidence", () => {
    renderTable([report()]);

    expect(
      screen.getByRole("columnheader", { name: "Work status" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Review status" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("95%")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/confidence/i)).not.toBeInTheDocument();
    expect(screen.getByText("Possible Condition: Rust")).toBeInTheDocument();
  });

  it("shows submission age and the staff classification when present", () => {
    renderTable([
      report({
        authorityClassifiedCondition: "smut",
        submittedAt: new Date(Date.now() - 40 * 86_400_000).toISOString(),
      }),
    ]);

    expect(screen.getByText("1 month ago")).toBeInTheDocument();
    expect(
      screen.getByText("Staff: Sugarcane Smut"),
    ).toBeInTheDocument();
  });

  it("shows an overdue follow-up instead of a bare date", () => {
    renderTable([
      report({
        followUp: { dueOn: "2026-08-20", overdue: true },
      }),
    ]);

    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Aug 20, 2026")).toBeInTheDocument();
  });

  it("marks a case submitted without an exact coordinate", () => {
    renderTable([report({ locationUnavailable: true })]);

    expect(screen.getByText("Location unavailable")).toBeInTheDocument();
  });

  it("states when no visit is scheduled", () => {
    renderTable([report({ followUp: { dueOn: null, overdue: false } })]);

    expect(screen.getByText("No visit scheduled")).toBeInTheDocument();
  });

  it("navigates to report details when a row is clicked", async () => {
    const user = userEvent.setup();
    renderTable([report({ uuid: "00000000-0000-4000-8000-000000000001" })]);

    const row = screen.getByRole("row", { name: /CG-2026-0001/i });
    await user.click(row);

    expect(mockNavigate).toHaveBeenCalledWith("/reports/00000000-0000-4000-8000-000000000001");
  });

  it("navigates to report details when Enter is pressed on the focused row", async () => {
    const user = userEvent.setup();
    renderTable([report({ uuid: "00000000-0000-4000-8000-000000000001" })]);

    const row = screen.getByRole("row", { name: /CG-2026-0001/i });
    row.focus();
    await user.keyboard("{Enter}");

    expect(mockNavigate).toHaveBeenCalledWith("/reports/00000000-0000-4000-8000-000000000001");
  });

  it("toggles row expansion without navigating when expand chevron is clicked", async () => {
    const user = userEvent.setup();
    renderTable([report({ submittedByName: "Ramon Dela Cruz" })]);

    mockNavigate.mockClear();
    const expandBtn = screen.getByRole("button", { name: /Details for CG-2026-0001/i });
    expect(screen.queryByText(/Reporter:/i)).not.toBeInTheDocument();

    await user.click(expandBtn);

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByText(/Reporter:/i)).toBeInTheDocument();
    expect(screen.getByText("Ramon Dela Cruz")).toBeInTheDocument();

    // Clicking inside the expanded content does not navigate
    await user.click(screen.getByText("Ramon Dela Cruz"));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
