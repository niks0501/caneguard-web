import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { FieldValidationTable } from "./FieldValidationTable";
import type { FieldValidationMapFeature } from "../../domain/fieldValidation.types";

const mockNavigate = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockFeature: FieldValidationMapFeature = {
  type: "Feature",
  id: "report-1",
  geometry: {
    type: "Point",
    coordinates: [120.6039, 14.126],
  },
  properties: {
    uuid: "00000000-0000-4000-8000-000000000001",
    referenceCode: "CG-2026-0718",
    barangay: "Balaytigui",
    farmReference: "Dela Cruz farm",
    province: "Batangas",
    municipality: "Nasugbu",
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
    locationSource: "gps",
    gpsAccuracy: 5.0,
    affectedAreaHectares: 1.2,
    affectedPortionPercent: 15,
  },
};

function renderTable(features = [mockFeature]) {
  return render(
    <MemoryRouter>
      <FieldValidationTable features={features} />
    </MemoryRouter>,
  );
}

describe("FieldValidationTable", () => {
  it("renders empty state when there are no features", () => {
    renderTable([]);

    expect(
      screen.getByText("No located observations match the applied filters."),
    ).toBeInTheDocument();
  });

  it("renders the six queue columns", () => {
    renderTable();

    expect(screen.getByRole("heading", { name: "Located observations" })).toBeInTheDocument();
    expect(screen.getByText("1 row")).toBeInTheDocument();

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

  it("moves coordinates off the row while keeping the case link", () => {
    renderTable();

    expect(screen.queryByText("14.1260, 120.6039")).not.toBeInTheDocument();
    expect(screen.queryByText(/14\.126/)).not.toBeInTheDocument();

    const link = screen.getByRole("link", { name: /Open CG-2026-0718/i });
    expect(link).toHaveAttribute(
      "href",
      "/reports/00000000-0000-4000-8000-000000000001",
    );
  });

  it("shows exactly one workflow status", () => {
    renderTable();

    const row = screen.getByRole("row", { name: /CG-2026-0718/i });
    expect(within(row).getByText("Field Validation")).toBeInTheDocument();
    expect(within(row).queryByText("Needs field validation")).not.toBeInTheDocument();
  });

  it("opens the case when a row is activated by keyboard", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();
    renderTable();

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
