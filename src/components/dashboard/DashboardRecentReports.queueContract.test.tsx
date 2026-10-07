import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { DiseaseReport } from "../../domain/report.types";
import { DashboardRecentReports } from "./DashboardRecentReports";

/**
 * PROTECTED CONTRACT TESTS - Dashboard recent-cases surface.
 *
 * Contract source: .lavish/table-queue-board.html section 1 (dashboard recent
 * table row) and TQ1 ("every case surface at once").
 *   SURFACE - "Same six columns as the registers; rows keyboard-openable.
 *              Keeps its latest-cases glance role."
 *
 * Baseline expectation: fails at revision 0cea13e because the table renders
 * seven columns including Reported concern / Submitted / a trailing Open link,
 * and its rows are not focusable.
 */

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
    uuid: "00000000-0000-4000-8000-000000000009",
    referenceCode: "CG-2026-0009",
    barangay: "Balaytigui",
    province: "Batangas",
    municipality: "Nasugbu",
    farmReference: "Dela Cruz farm",
    submittedByName: "Ana Reporter",
    submitterRole: "field_reporter",
    capturedAt: "2026-07-18T07:42:00+08:00",
    submittedAt: "2026-07-20T09:16:00+08:00",
    predictedDisease: "rust",
    imageStatus: "available",
    symptoms: [],
    reviewStatus: "submitted_unverified",
    lifecycle: {
      caseState: "open",
      verificationOutcome: "not_determined",
      fieldValidationState: "unassigned",
      referralState: "not_referred",
    },
    ...overrides,
  };
}

function renderTable(reports: DiseaseReport[]) {
  return render(
    <MemoryRouter>
      <DashboardRecentReports reports={reports} />
    </MemoryRouter>,
  );
}

describe("dashboard surface contract (SURFACE)", () => {
  it("SURFACE: renders the same six queue columns as the register", () => {
    renderTable([report()]);

    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent?.trim() ?? "");

    expect(headers).toEqual([
      "Case",
      "Location",
      "Possible Condition",
      "Affected Area",
      "Case Status",
      "Review",
    ]);
  });

  it("SURFACE: drops the thumbnail, reported concern and submitted timestamp", () => {
    renderTable([report({ reporterSuspectedCondition: "RSSI" })]);

    expect(screen.queryByAltText(/Submitted photo/i)).not.toBeInTheDocument();
    expect(screen.queryByText("RSSI")).not.toBeInTheDocument();
    expect(screen.queryByText("Jul 20, 2026")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Submitted" }),
    ).not.toBeInTheDocument();
  });

  it("SURFACE: rows are keyboard-openable and carry queue context", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();
    renderTable([report()]);

    const row = screen.getByRole("row", { name: /CG-2026-0009/i });
    expect(row).toHaveAttribute("tabindex", "0");

    row.focus();
    await user.keyboard("{Enter}");

    expect(mockNavigate).toHaveBeenCalledWith(
      "/reports/00000000-0000-4000-8000-000000000009",
      { state: { reviewQueue: expect.objectContaining({ remainingIds: [], reviewedIds: [] }) } },
    );
  });

  it("SURFACE: shows exactly one of the six case states", () => {
    renderTable([
      report({
        lifecycle: {
          caseState: "open",
          verificationOutcome: "not_determined",
          fieldValidationState: "assigned",
          referralState: "not_referred",
        },
      }),
    ]);

    const row = screen.getByRole("row", { name: /CG-2026-0009/i });
    expect(within(row).getByText("Field Validation", { exact: true })).toBeInTheDocument();
    expect(within(row).queryByText("Needs field validation", { exact: true })).not.toBeInTheDocument();
  });
});
