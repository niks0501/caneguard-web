import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { FieldValidationTable } from "./FieldValidationTable";
import type { FieldValidationMapFeature } from "../../domain/fieldValidation.types";

const mockFeature: FieldValidationMapFeature = {
  type: "Feature",
  id: "report-1",
  geometry: {
    type: "Point",
    coordinates: [120.6311, 14.0722],
  },
  properties: {
    uuid: "00000000-0000-4000-8000-000000000001",
    referenceCode: "CG-2026-0718",
    barangay: "Mabini",
    province: "Negros Occidental",
    municipality: "Bago",
    observedAt: "2026-07-18T08:12:00+08:00",
    submittedAt: "2026-07-18T09:16:00+08:00",
    predictedDisease: "mosaic",
    confidence: 0.87,
    reviewStatus: "for_field_validation",
    locationSource: "gps",
    gpsAccuracy: 5.0,
    affectedAreaHectares: 1.2,
    affectedPortionPercent: 15,
  },
};

describe("FieldValidationTable", () => {
  it("renders empty state when there are no features", () => {
    render(
      <MemoryRouter>
        <FieldValidationTable features={[]} />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("No located observations match the applied filters."),
    ).toBeInTheDocument();
  });

  it("renders 5 clean columns and open report action", () => {
    render(
      <MemoryRouter>
        <FieldValidationTable features={[mockFeature]} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Located observations" })).toBeInTheDocument();
    expect(screen.getByText("1 rows")).toBeInTheDocument();

    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(5);
    expect(headers[0]).toHaveTextContent("Report");
    expect(headers[1]).toHaveTextContent("Location");
    expect(headers[2]).toHaveTextContent("Possible Condition");
    expect(headers[3]).toHaveTextContent("Review state");

    // Check row data
    expect(screen.getByText("CG-2026-0718")).toBeInTheDocument();
    expect(screen.getByText("Mabini")).toBeInTheDocument();
    expect(screen.getByText("14.0722, 120.6311")).toBeInTheDocument();
    expect(screen.getByText("Possible Condition: Mosaic")).toBeInTheDocument();
    expect(screen.getByText("Needs field validation")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "Open Report" });
    expect(link).toHaveAttribute(
      "href",
      "/reports/00000000-0000-4000-8000-000000000001",
    );
  });
});
