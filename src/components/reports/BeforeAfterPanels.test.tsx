import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mapReportDetail } from "../../data/api/mappers/report.mapper";
import { reportDetailResponseSchema } from "../../data/api/schemas/report.schema";
import { completedFieldValidationAssignmentDto, reportDetailDto } from "../../test/fixtures";
import { BeforeAfterPanels } from "./BeforeAfterPanels";

// Proposal tests (unpromoted).
const report = mapReportDetail(
  reportDetailResponseSchema.parse({
    data: { ...reportDetailDto, field_validation_assignment: completedFieldValidationAssignmentDto },
  }).data,
);
const completion = report.fieldValidationAssignment!.completion!;

describe("BeforeAfterPanels", () => {
  // Proves: Reported | Visited twin panels with matched rows (condition, who, when).
  it("renders Reported and Visited panels with matching Who and When rows", () => {
    render(<BeforeAfterPanels report={report} completion={completion} />);
    for (const name of ["Reported", "Visited"]) {
      const panel = screen.getByRole("region", { name });
      expect(within(panel).getByText("Who")).toBeInTheDocument();
      expect(within(panel).getByText("When")).toBeInTheDocument();
    }
  });

  // Proves: the follow-up outcome is shown as one tag.
  it("shows the follow-up outcome once as a tag", () => {
    render(<BeforeAfterPanels report={report} completion={completion} />);
    expect(screen.getAllByText("Improved")).toHaveLength(1);
  });

  // Proves: the visit photo is embedded, with the link kept as fallback if it cannot load.
  it("embeds the visit photo and falls back to the authorized link on load failure", () => {
    const withPhoto = { ...completion, freshPhoto: { available: true, url: "https://example.test/fresh.jpg" } };
    render(<BeforeAfterPanels report={report} completion={withPhoto} />);
    const img = screen.getByAltText(/Visit photo/);
    expect(img).toHaveAttribute("src", "https://example.test/fresh.jpg");
    expect(screen.queryByRole("link", { name: "Open authorized photo" })).not.toBeInTheDocument();
    fireEvent.error(img);
    expect(screen.getByRole("link", { name: "Open authorized photo" })).toHaveAttribute("href", "https://example.test/fresh.jpg");
  });
});
