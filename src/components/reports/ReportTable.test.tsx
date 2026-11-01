import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { DiseaseReport, ReportLifecycle } from "../../domain/report.types";
import { ReportTable } from "./ReportTable";

const mockNavigate = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

type QueueReport = DiseaseReport & { scheduledRevisit?: boolean };

const openUntouched: ReportLifecycle = {
  caseState: "open",
  verificationOutcome: "not_determined",
  fieldValidationState: "unassigned",
  referralState: "not_referred",
};

function report(overrides: Partial<QueueReport> = {}): DiseaseReport {
  return {
    uuid: "00000000-0000-4000-8000-000000000001",
    referenceCode: "CG-2026-0001",
    barangay: "Balaytigui",
    province: "Batangas",
    municipality: "Nasugbu",
    farmReference: "Dela Cruz farm",
    submittedByName: "Ramon Dela Cruz",
    submitterRole: "field_reporter",
    capturedAt: "2026-07-18T07:42:00+08:00",
    submittedAt: "2026-07-18T09:16:00+08:00",
    predictedDisease: "rust",
    confidence: 0.95,
    imageStatus: "available",
    symptoms: [],
    reviewStatus: "submitted_unverified",
    lifecycle: openUntouched,
    ...overrides,
  };
}

function renderTable(
  reports: DiseaseReport[],
  variant: "default" | "monitoring" = "default",
) {
  return render(
    <MemoryRouter
      initialEntries={["/reports?queue=needs_review&sort=oldest&barangay=Balaytigui"]}
    >
      <ReportTable reports={reports} variant={variant} />
    </MemoryRouter>,
  );
}

function rowFor(reference: string) {
  return screen.getByRole("row", { name: new RegExp(reference, "i") });
}

describe("ReportTable - six queue columns", () => {
  it.each(["default", "monitoring"] as const)(
    "renders exactly the six queue columns for the %s register",
    (variant) => {
      renderTable([report()], variant);

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
    },
  );

  it("keeps the case cell to code, farm and markers only", () => {
    renderTable([report({ mismatchReported: true })]);

    const row = rowFor("CG-2026-0001");
    expect(within(row).getByText("CG-2026-0001")).toBeInTheDocument();
    expect(within(row).getByText("Dela Cruz farm")).toBeInTheDocument();
    expect(within(row).getByText(/reporter concern/i)).toBeInTheDocument();
    expect(screen.queryByAltText(/Submitted photo/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Ramon Dela Cruz")).not.toBeInTheDocument();
    expect(screen.queryByText(/Reporter:/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Details for CG-2026-0001/i }),
    ).not.toBeInTheDocument();
  });

  it("names the machine-fact cautions from the list payload", () => {
    renderTable([
      report({
        mismatchReported: false,
        machineFacts: {
          checklistConsistency: "inconsistent",
          qualityWarnings: ["Image blur detected"],
        },
      }),
    ]);

    const row = rowFor("CG-2026-0001");
    expect(
      within(row).getByText(/Observations do not match Possible Condition/),
    ).toBeInTheDocument();
    expect(
      within(row).getByText(/Photo may be difficult to review/),
    ).toBeInTheDocument();
  });

  it("falls back to 'No farm reference'", () => {
    renderTable([report({ farmReference: undefined })]);

    expect(within(rowFor("CG-2026-0001")).getByText("No farm reference")).toBeInTheDocument();
  });

  it("keeps the predicted condition and the staff line", () => {
    renderTable([report({ authorityClassifiedCondition: "smut" })]);

    const row = rowFor("CG-2026-0001");
    expect(within(row).getByText(/Rust/)).toBeInTheDocument();
    expect(within(row).getByText("Staff: Sugarcane Smut")).toBeInTheDocument();
  });

  it("moves the submitted timestamp off the row", () => {
    renderTable([report()]);

    const row = rowFor("CG-2026-0001");
    expect(within(row).queryByText("Jul 18, 2026")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Submitted" }),
    ).not.toBeInTheDocument();
  });
});

describe("ReportTable - affected area", () => {
  it("shows measured hectares", () => {
    renderTable([report({ affectedAreaHectares: 2.4 })]);

    expect(within(rowFor("CG-2026-0001")).getByText("2.4 ha")).toBeInTheDocument();
  });

  it("shows a dash when the area was not measured", () => {
    renderTable([
      report({ affectedAreaHectares: undefined, affectedAreaMeasurement: "not_measured" }),
    ]);

    expect(within(rowFor("CG-2026-0001")).getByText("—")).toBeInTheDocument();
  });
});

describe("ReportTable - one workflow status", () => {
  it("shows Needs Review for an untouched open case", () => {
    renderTable([report()]);

    expect(within(rowFor("CG-2026-0001")).getByText("Needs Review")).toBeInTheDocument();
    expect(within(rowFor("CG-2026-0001")).queryByText("Needs review")).not.toBeInTheDocument();
  });

  it("shows Field Validation for assigned work", () => {
    renderTable([
      report({ lifecycle: { ...openUntouched, fieldValidationState: "assigned" } }),
    ]);

    expect(within(rowFor("CG-2026-0001")).getByText("Field Validation")).toBeInTheDocument();
  });

  it("shows Resolved for a closed case", () => {
    renderTable([
      report({ lifecycle: { ...openUntouched, caseState: "closed" } }),
    ]);

    expect(within(rowFor("CG-2026-0001")).getByText("Resolved")).toBeInTheDocument();
  });

  it("shows Follow-Up only when the scheduled-revisit flag is set", () => {
    const { unmount } = renderTable([
      report({
        lifecycle: { ...openUntouched, fieldValidationState: "completed" },
        scheduledRevisit: true,
      }),
    ]);

    expect(within(rowFor("CG-2026-0001")).getByText("Follow-Up")).toBeInTheDocument();
    unmount();

    renderTable([
      report({
        lifecycle: { ...openUntouched, fieldValidationState: "completed" },
        followUp: { dueOn: "2026-08-20", overdue: true },
      }),
    ]);

    expect(within(rowFor("CG-2026-0001")).queryByText("Follow-Up")).not.toBeInTheDocument();
  });

  it("shows Under Review once a case has been opened", () => {
    renderTable([report({ firstReviewedAt: "2026-07-21T02:00:00.000Z" })]);

    expect(within(rowFor("CG-2026-0001")).getByText("Under Review")).toBeInTheDocument();
  });
});

describe("ReportTable - queue navigation", () => {
  it("navigates to report details when a row is clicked", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();
    renderTable([report()]);

    await user.click(rowFor("CG-2026-0001"));

    expect(mockNavigate).toHaveBeenCalledWith(
      "/reports/00000000-0000-4000-8000-000000000001",
      {
        state: {
          reviewQueue: expect.objectContaining({
            returnTo: "/reports?queue=needs_review&sort=oldest&barangay=Balaytigui",
            filters: expect.objectContaining({
              queue: "needs_review",
              barangay: "Balaytigui",
            }),
            remainingIds: [],
            reviewedIds: [],
          }),
        },
      },
    );
  });

  it("navigates to report details when Enter is pressed on the focused row", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();
    renderTable([report()]);

    const row = rowFor("CG-2026-0001");
    row.focus();
    await user.keyboard("{Enter}");

    expect(mockNavigate).toHaveBeenCalledWith(
      "/reports/00000000-0000-4000-8000-000000000001",
      expect.objectContaining({
        state: {
          reviewQueue: expect.objectContaining({
            returnTo: "/reports?queue=needs_review&sort=oldest&barangay=Balaytigui",
            remainingIds: [],
            reviewedIds: [],
          }),
        },
      }),
    );
  });

  it("carries the queue context on the Review action anchor", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();
    renderTable([report()]);

    const reviewAction = within(rowFor("CG-2026-0001")).getByRole("link", {
      name: /Open CG-2026-0001/i,
    });
    expect(reviewAction).toHaveAttribute(
      "href",
      "/reports/00000000-0000-4000-8000-000000000001",
    );

    await user.click(reviewAction);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
