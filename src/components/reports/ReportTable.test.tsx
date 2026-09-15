import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { DiseaseReport } from "../../domain/report.types";
import { ReportTable } from "./ReportTable";

function report(overrides: Partial<DiseaseReport> = {}): DiseaseReport {
  return {
    uuid: "00000000-0000-4000-8000-000000000001",
    referenceCode: "CG-2026-0001",
    barangay: "Mabini",
    province: "Negros Occidental",
    municipality: "Bago",
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

function renderTable(reports: DiseaseReport[]) {
  return render(
    <MemoryRouter>
      <ReportTable reports={reports} />
    </MemoryRouter>,
  );
}

describe("ReportTable", () => {
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
});
