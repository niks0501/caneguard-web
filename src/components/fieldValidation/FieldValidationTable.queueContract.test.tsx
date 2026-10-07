import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { FieldValidationMapFeature } from "../../domain/fieldValidation.types";
import { FieldValidationTable } from "./FieldValidationTable";

/**
 * PROTECTED CONTRACT TESTS - Map "Located observations" surface.
 *
 * Contract source: .lavish/table-queue-board.html section 1 (map location table
 * row) and TQ1.
 *   SURFACE - "Same six columns; coordinates move to the case page (map link
 *              stays). Rows keyboard-openable."
 *
 * Baseline expectation: fails at revision 0cea13e because the table renders
 * Report / Location / Possible Condition / Review state / sr-only Actions with
 * inline coordinates and no row activation.
 *
 * The fixture is cast because the map payload does not yet carry farm
 * reference, the lifecycle-derived workflow state, first-reviewed signal or
 * affected area value; widening MapReportResource is part of the contract
 * (finding A7).
 */

const mockNavigate = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const feature = {
  type: "Feature",
  id: "report-1",
  geometry: { type: "Point", coordinates: [120.6039, 14.126] },
  properties: {
    uuid: "00000000-0000-4000-8000-000000000001",
    referenceCode: "CG-2026-0718",
    barangay: "Balaytigui",
    province: "Batangas",
    municipality: "Nasugbu",
    farmReference: "Dela Cruz farm",
    observedAt: "2026-07-18T08:12:00+08:00",
    submittedAt: "2026-07-18T09:16:00+08:00",
    predictedDisease: "mosaic",
    confidence: 0.87,
    reviewStatus: "for_field_validation",
    lifecycle: {
      caseState: "open",
      verificationOutcome: "not_determined",
      fieldValidationState: "assigned",
      referralState: "not_referred",
    },
    firstReviewedAt: null,
    actionTaken: null,
    mismatchReported: null,
    locationSource: "gps",
    gpsAccuracy: 5,
    affectedAreaHectares: 1.2,
    affectedPortionPercent: 15,
  },
} as unknown as FieldValidationMapFeature;

describe("map surface contract (SURFACE)", () => {
  it("SURFACE: renders the same six queue columns as the register", () => {
    render(
      <MemoryRouter>
        <FieldValidationTable features={[feature]} />
      </MemoryRouter>,
    );

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

  it("SURFACE: moves coordinates off the row while keeping the map link", () => {
    render(
      <MemoryRouter>
        <FieldValidationTable features={[feature]} />
      </MemoryRouter>,
    );

    expect(screen.queryByText("14.1260, 120.6039")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open CG-2026-0718/i }),
    ).toHaveAttribute("href", "/reports/00000000-0000-4000-8000-000000000001");
  });

  it("SURFACE: shows exactly one of the six case states", () => {
    render(
      <MemoryRouter>
        <FieldValidationTable features={[feature]} />
      </MemoryRouter>,
    );

    const row = screen.getByRole("row", { name: /CG-2026-0718/i });
    expect(within(row).getByText("Field Validation", { exact: true })).toBeInTheDocument();
    expect(within(row).queryByText("Needs field validation", { exact: true })).not.toBeInTheDocument();
  });

  it("SURFACE: rows are keyboard-openable", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();
    render(
      <MemoryRouter>
        <FieldValidationTable features={[feature]} />
      </MemoryRouter>,
    );

    const row = screen.getByRole("row", { name: /CG-2026-0718/i });
    expect(row).toHaveAttribute("tabindex", "0");

    row.focus();
    await user.keyboard("{Enter}");

    expect(mockNavigate).toHaveBeenCalledWith(
      "/reports/00000000-0000-4000-8000-000000000001",
      expect.anything(),
    );
  });
});
