import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { DiseaseReport, ReportLifecycle } from "../../domain/report.types";
import { ReportTable } from "./ReportTable";

/**
 * PROTECTED CONTRACT TESTS - Reviewer-focused queue (table rule + six columns).
 *
 * Contract source: .lavish/table-queue-board.html sections 1, 2, 3, 6 and the
 * locked decisions TQ1-TQ6, plus the section 7 rulings:
 *   Q7 - precedence Resolved > Field Validation > Referred > Follow-Up >
 *        Under Review > Needs Review, with the scheduled-revisit flag driving
 *        Follow-Up.
 *   A8 - affected-area cell format; A9 - Case markers; A11 - "Review" header;
 *        A12 - "No farm reference" fallback.
 * Do not weaken, delete, skip, or rewrite these assertions to make an
 * implementation pass. Contract disagreements return to specification.
 *
 * Clause key used in each test name:
 *   ROW    - "Register rows show exactly the six columns ... no expand row"
 *   CASE   - TQ3 "Case cell: code + farm + markers, no thumbnail"
 *   COND   - TQ6 "Condition cell keeps both lines"
 *   AREA   - "Affected Area" column (A8 format)
 *   STATUS - "Every row shows exactly one of the six states" (Q7 precedence)
 *   DECIDE - "the table helps the reviewer decide which case to open next"
 *   REG    - "No regressions ... keyboard row opening ... queue context"
 *
 * Baseline expectation: these tests fail at revision 0cea13e because the row
 * still renders Report/Possible Condition/Location/Submitted/Follow-up/
 * Work status with a thumbnail and an expand row, and no six-state pill exists.
 *
 * `scheduledRevisit` is the web-side name of the ratified scheduled-revisit
 * flag (Q7). The migration column name is the implementation's to confirm; the
 * behavior it drives is what is asserted here.
 */

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
    submittedAt: "2026-07-20T09:16:00+08:00",
    predictedDisease: "rust",
    confidence: 0.95,
    imageStatus: "available",
    imageUrl: "https://api.caneguard.test/api/v1/reports/1/image",
    symptoms: [],
    reviewStatus: "submitted_unverified",
    lifecycle: openUntouched,
    ...overrides,
  };
}

function renderTable(reports: DiseaseReport[]) {
  return render(
    <MemoryRouter
      initialEntries={[
        "/reports?queue=needs_review&sort=oldest&barangay=Balaytigui",
      ]}
    >
      <ReportTable reports={reports} />
    </MemoryRouter>,
  );
}

const SIX_LABELS = [
  "Needs Review",
  "Under Review",
  "Field Validation",
  "Referred",
  "Follow-Up",
  "Resolved",
] as const;

function queueHeaderLabels() {
  return screen
    .getAllByRole("columnheader")
    .map((header) => header.textContent?.trim() ?? "");
}

function rowFor(reference: string) {
  return screen.getByRole("row", { name: new RegExp(reference, "i") });
}

describe("queue contract - six columns (ROW)", () => {
  it("ROW: register row shows exactly the six queue columns in order", () => {
    renderTable([report()]);

    const headers = queueHeaderLabels();

    expect(headers).toEqual([
      "Case",
      "Location",
      "Possible Condition",
      "Affected Area",
      "Case Status",
      "Review",
    ]);
  });

  it("ROW: removes the expand row, thumbnail, submitted timestamp and identity names", () => {
    const { container } = renderTable([report()]);

    expect(
      screen.queryByRole("button", { name: /Details for CG-2026-0001/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByAltText(/Submitted photo for CG-2026-0001/i),
    ).not.toBeInTheDocument();
    expect(container.querySelector(".report-row-expanded-content")).toBeNull();

    const row = rowFor("CG-2026-0001");
    expect(within(row).queryByText("Jul 20, 2026")).not.toBeInTheDocument();
    expect(within(row).queryByText("Ramon Dela Cruz")).not.toBeInTheDocument();
    expect(within(row).queryByText(/Reporter:/i)).not.toBeInTheDocument();
    expect(within(row).queryByText(/Assigned to:/i)).not.toBeInTheDocument();
    expect(within(row).queryByText(/First reviewed:/i)).not.toBeInTheDocument();
  });

  it("ROW: no lifecycle filter vocabulary leaks into the row", () => {
    renderTable([report()]);

    const row = rowFor("CG-2026-0001");
    expect(within(row).queryByText("Unassigned")).not.toBeInTheDocument();
    expect(within(row).queryByText("Not determined")).not.toBeInTheDocument();
  });
});

describe("queue contract - Case and Condition cells (CASE, COND)", () => {
  it("CASE: shows reference code and farm reference without a thumbnail", () => {
    renderTable([report({ farmReference: "Santos farm" })]);

    const row = rowFor("CG-2026-0001");
    expect(within(row).getByText("CG-2026-0001")).toBeInTheDocument();
    expect(within(row).getByText("Santos farm")).toBeInTheDocument();
    expect(
      within(row).queryByAltText(/Submitted photo/i),
    ).not.toBeInTheDocument();
  });

  it("CASE: uses the ratified 'No farm reference' fallback", () => {
    renderTable([report({ farmReference: undefined, barangay: "Sta. Clara" })]);

    expect(within(rowFor("CG-2026-0001")).getByText("No farm reference")).toBeInTheDocument();
  });

  it("CASE: keeps a marker for a reporter mismatch", () => {
    renderTable([report({ mismatchReported: true })]);

    const row = rowFor("CG-2026-0001");
    expect(within(row).getByText(/mismatch|reporter concern/i)).toBeInTheDocument();
  });

  it("COND: keeps the predicted condition and the Staff line when present", () => {
    renderTable([report({ authorityClassifiedCondition: "smut" })]);

    const row = rowFor("CG-2026-0001");
    expect(within(row).getByText(/Rust/)).toBeInTheDocument();
    expect(within(row).getByText("Staff: Sugarcane Smut")).toBeInTheDocument();
  });

  it("COND: omits the Staff line when the office has not classified", () => {
    renderTable([report({ authorityClassifiedCondition: null })]);

    const row = rowFor("CG-2026-0001");
    expect(within(row).queryByText(/^Staff:/)).not.toBeInTheDocument();
  });
});

describe("queue contract - Affected Area (AREA)", () => {
  it("AREA: shows measured hectares", () => {
    renderTable([report({ affectedAreaHectares: 2.4 })]);

    expect(within(rowFor("CG-2026-0001")).getByText("2.4 ha")).toBeInTheDocument();
  });

  it("AREA: shows a dash when the area was not measured", () => {
    renderTable([
      report({ affectedAreaHectares: undefined, affectedAreaMeasurement: "not_measured" }),
    ]);

    expect(within(rowFor("CG-2026-0001")).getByText("—")).toBeInTheDocument();
  });
});

describe("queue contract - one six-state Case Status (STATUS)", () => {
  it("STATUS: renders exactly one of the six labels and retires the legacy badge", () => {
    renderTable([report()]);

    const row = rowFor("CG-2026-0001");
    // "Needs review" (legacy review_status label) must be gone; "Needs Review"
    // (the workflow state) must be present.
    expect(within(row).queryByText("Needs review", { exact: true })).not.toBeInTheDocument();

    const rendered = SIX_LABELS.filter((label) =>
      within(row).queryByText(label, { exact: true }) !== null,
    );
    expect(rendered).toEqual(["Needs Review"]);
  });

  it.each([
    ["closed + verified", { caseState: "closed", verificationOutcome: "verified" }, "Resolved"],
    ["closed + undetermined", { caseState: "closed" }, "Resolved"],
    ["validation assigned", { fieldValidationState: "assigned" }, "Field Validation"],
    ["validation in progress", { fieldValidationState: "in_progress" }, "Field Validation"],
    ["referred", { referralState: "referred" }, "Referred"],
    ["expert response received", { referralState: "expert_response_received" }, "Referred"],
  ] as const)(
    "STATUS: %s maps to %s",
    (_name, lifecycleOverride, expectedLabel) => {
      renderTable([
        report({
          lifecycle: { ...openUntouched, ...(lifecycleOverride as Partial<ReportLifecycle>) },
        }),
      ]);

      expect(
        within(rowFor("CG-2026-0001")).getByText(expectedLabel, { exact: true }),
      ).toBeInTheDocument();
    },
  );

  it("STATUS: an untouched open case is Needs Review", () => {
    renderTable([report()]);

    expect(within(rowFor("CG-2026-0001")).getByText("Needs Review", { exact: true })).toBeInTheDocument();
  });

  it("STATUS: a first-reviewed open case is Under Review", () => {
    renderTable([report({ firstReviewedAt: "2026-07-21T02:00:00.000Z" })]);

    expect(within(rowFor("CG-2026-0001")).getByText("Under Review", { exact: true })).toBeInTheDocument();
  });

  it("STATUS: the scheduled-revisit flag makes a completed validation Follow-Up", () => {
    renderTable([
      report({
        lifecycle: { ...openUntouched, fieldValidationState: "completed" },
        scheduledRevisit: true,
      }),
    ]);

    expect(within(rowFor("CG-2026-0001")).getByText("Follow-Up", { exact: true })).toBeInTheDocument();
  });

  it("STATUS: a due date without the flag is not Follow-Up (flag-driven ruling)", () => {
    renderTable([
      report({
        lifecycle: { ...openUntouched, fieldValidationState: "completed" },
        followUp: { dueOn: "2026-08-20", overdue: true },
        scheduledRevisit: false,
      }),
    ]);

    expect(within(rowFor("CG-2026-0001")).queryByText("Follow-Up", { exact: true })).not.toBeInTheDocument();
    expect(within(rowFor("CG-2026-0001")).getByText("Needs Review", { exact: true })).toBeInTheDocument();
  });

  // Q7 precedence: Resolved > Field Validation > Referred > Follow-Up >
  // Under Review > Needs Review.
  it("STATUS: Resolved outranks every other input", () => {
    renderTable([
      report({
        lifecycle: {
          caseState: "closed",
          verificationOutcome: "verified",
          fieldValidationState: "completed",
          referralState: "referred",
        },
        firstReviewedAt: "2026-07-21T02:00:00.000Z",
        scheduledRevisit: true,
      }),
    ]);

    expect(within(rowFor("CG-2026-0001")).getByText("Resolved", { exact: true })).toBeInTheDocument();
  });

  it("STATUS: Field Validation outranks Referred", () => {
    renderTable([
      report({
        lifecycle: {
          ...openUntouched,
          fieldValidationState: "assigned",
          referralState: "referred",
        },
        scheduledRevisit: true,
        firstReviewedAt: "2026-07-21T02:00:00.000Z",
      }),
    ]);

    expect(within(rowFor("CG-2026-0001")).getByText("Field Validation", { exact: true })).toBeInTheDocument();
  });

  it("STATUS: Referred outranks Follow-Up", () => {
    renderTable([
      report({
        lifecycle: {
          ...openUntouched,
          fieldValidationState: "completed",
          referralState: "referred",
        },
        scheduledRevisit: true,
        firstReviewedAt: "2026-07-21T02:00:00.000Z",
      }),
    ]);

    expect(within(rowFor("CG-2026-0001")).getByText("Referred", { exact: true })).toBeInTheDocument();
  });

  it("STATUS: Follow-Up outranks Under Review", () => {
    renderTable([
      report({
        lifecycle: { ...openUntouched, fieldValidationState: "completed" },
        scheduledRevisit: true,
        firstReviewedAt: "2026-07-21T02:00:00.000Z",
      }),
    ]);

    expect(within(rowFor("CG-2026-0001")).getByText("Follow-Up", { exact: true })).toBeInTheDocument();
  });

  it("STATUS: Under Review outranks Needs Review", () => {
    renderTable([report({ firstReviewedAt: "2026-07-21T02:00:00.000Z" })]);

    expect(within(rowFor("CG-2026-0001")).getByText("Under Review", { exact: true })).toBeInTheDocument();
  });
});

describe("queue contract - decision rule (DECIDE, REG)", () => {
  it("DECIDE: the Review action opens the case with queue context", async () => {
    const user = userEvent.setup();
    renderTable([report()]);

    const reviewAction = within(rowFor("CG-2026-0001")).getByRole("link", {
      name: /Open CG-2026-0001/i,
    });
    await user.click(reviewAction);

    expect(mockNavigate).not.toHaveBeenCalled(); // the anchor itself carries the route
    expect(reviewAction).toHaveAttribute(
      "href",
      "/reports/00000000-0000-4000-8000-000000000001",
    );
  });

  it("REG: rows stay keyboard-openable and Enter carries the queue context", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();
    renderTable([report()]);

    const row = rowFor("CG-2026-0001");
    row.focus();
    await user.keyboard("{Enter}");

    expect(mockNavigate).toHaveBeenCalledWith(
      "/reports/00000000-0000-4000-8000-000000000001",
      {
        state: {
          reviewQueue: {
            returnTo: "/reports?queue=needs_review&sort=oldest&barangay=Balaytigui",
            filters: expect.objectContaining({
              queue: "needs_review",
              barangay: "Balaytigui",
            }),
            remainingIds: [],
            reviewedIds: [],
          },
        },
      },
    );
  });
});
