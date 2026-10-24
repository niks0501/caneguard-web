import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { ZodError } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/ApiError";
import { env } from "../config/env";
import { mapReportDetail } from "../data/api/mappers/report.mapper";
import { reportDetailResponseSchema } from "../data/api/schemas/report.schema";
import {
  completedFieldValidationAssignmentDto,
  reportDetailDto,
  reportReferralDto,
} from "../test/fixtures";
import { useFieldReporters } from "../hooks/useFieldReporters";
import { useFieldSurveys } from "../hooks/fieldSurveys";
import {
  useAdvisories,
  useRecordHandoffNote,
  useLinkDuplicateReport,
  usePossibleRecentMatches,
  useReports,
  useUnlinkDuplicateReport,
  useOpenCase,
  useReport,
  useUpdateReportReview,
  useUpdateReportAffectedFields,
} from "../hooks/useReports";
import { CaseReviewPage } from "./CaseReviewPage";

vi.mock("../hooks/useReports", () => ({
  useAdvisories: vi.fn(),
  useRecordHandoffNote: vi.fn(),
  useLinkDuplicateReport: vi.fn(),
  usePossibleRecentMatches: vi.fn(),
  useReports: vi.fn(),
  useUnlinkDuplicateReport: vi.fn(),
  useOpenCase: vi.fn(() => ({ mutate: vi.fn() })),
  useReport: vi.fn(),
  useUpdateReportReview: vi.fn(),
  useUpdateReportAffectedFields: vi.fn(),
}));
vi.mock("../hooks/useFieldReporters", () => ({
  useFieldReporters: vi.fn(() => ({ data: [], isError: false })),
}));
vi.mock("../hooks/fieldSurveys", () => ({ useFieldSurveys: vi.fn() }));

const report = mapReportDetail(
  reportDetailResponseSchema.parse({ data: reportDetailDto }).data,
);
const smutReport = {
  ...report,
  predictedDisease: "smut" as const,
  classScores: [
    { label: "smut" as const, score: 0.97 },
    { label: "rust" as const, score: 0.01 },
    { label: "mosaic" as const, score: 0.01 },
    { label: "healthy" as const, score: 0.01 },
  ],
};

const referredReport = mapReportDetail(
  reportDetailResponseSchema.parse({
    data: {
      ...reportDetailDto,
      lifecycle: { ...reportDetailDto.lifecycle, referral_state: "referred" },
      review: {
        ...reportDetailDto.review,
        action_taken: "referred_for_expert_validation",
      },
      referral: reportReferralDto,
      version: 1,
    },
  }).data,
);

function reportAfterTerminalConsult(
  status: "completed" | "cancelled",
  referralState: "expert_response_received" | "not_referred",
) {
  return {
    ...referredReport,
    lifecycle: { ...referredReport.lifecycle!, referralState },
    referral: { ...referredReport.referral!, status },
    consults: [{
      id: status === "completed" ? 1 : 2,
      status,
      destination: referredReport.referral!.destination,
      reference: referredReport.referral!.reference,
      referralDate: referredReport.referral!.referralDate,
      responseDate: status === "completed" ? "2026-09-08" : null,
    }],
  };
}

function queryResult(overrides: Record<string, unknown> = {}) {
  return {
    data: report,
    error: null,
    isError: false,
    isPending: false,
    isRefetchError: false,
    isSuccess: true,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useReport>;
}

function mutationResult(overrides: Record<string, unknown> = {}) {
  return {
    error: null,
    isError: false,
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue(report),
    reset: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useUpdateReportReview>;
}

function duplicateMutationResult(overrides: Record<string, unknown> = {}) {
  return mutationResult(overrides) as unknown as ReturnType<typeof useLinkDuplicateReport>;
}

function duplicateUnlinkMutationResult(overrides: Record<string, unknown> = {}) {
  return mutationResult(overrides) as unknown as ReturnType<typeof useUnlinkDuplicateReport>;
}

function pickerReport(overrides: Record<string, unknown> = {}) {
  return {
    uuid: "target-report-uuid",
    referenceCode: "CG-2026-0007",
    barangay: "Mabini",
    submittedByName: "Ana Reporter",
    submittedAt: "2026-08-12T10:00:00.000Z",
    predictedDisease: "rust",
    ...overrides,
  };
}

function reportsListResult(
  reportsList: Array<ReturnType<typeof pickerReport>> = [],
  overrides: Record<string, unknown> = {},
) {
  return {
    data: {
      reports: reportsList,
      meta: {
        currentPage: 1,
        from: reportsList.length ? 1 : null,
        lastPage: 1,
        perPage: 8,
        to: reportsList.length || null,
        total: reportsList.length,
      },
    },
    error: null,
    isError: false,
    isPending: false,
    isFetching: false,
    isSuccess: true,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useReports>;
}

function possibleMatchesResult(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      matches: [],
      message: "No possible recent match was found for this case.",
      possibleMatch: false,
      canSubmit: true,
      assessment: "condition_and_location",
      recentWindowHours: 72,
      locationRadiusMeters: 100,
    },
    error: null,
    isError: false,
    isPending: false,
    ...overrides,
  } as unknown as ReturnType<typeof usePossibleRecentMatches>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/reports/${report.uuid}`]}>
      <Routes>
        <Route path="/reports/:reportId" element={<CaseReviewPage />} />
        <Route path="/reports" element={<p>Returned to report queue</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const officeAdvisory = {
  uuid: "office-advisory-001", code: "ADV-OFFICE-OPS-001", title: "Document and monitor affected rows",
  content: "Mark the affected rows and record the date and visible changes.", status: "validated" as const,
};

async function chooseAdvisory(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: "Provide Advisory or Assistance" }));
  await user.selectOptions(screen.getByLabelText("Validated advisory"), officeAdvisory.uuid);
}

beforeEach(() => {
  vi.mocked(useAdvisories).mockReturnValue({ data: [officeAdvisory], isError: false } as unknown as ReturnType<typeof useAdvisories>);
  vi.mocked(useRecordHandoffNote).mockReturnValue({ mutateAsync: vi.fn(), isPending: false, isError: false } as unknown as ReturnType<typeof useRecordHandoffNote>);
  vi.mocked(useFieldReporters).mockReturnValue({ data: [], isError: false } as unknown as ReturnType<typeof useFieldReporters>);
  vi.mocked(useFieldSurveys).mockReturnValue({
    data: { type: "FeatureCollection", features: [], metadata: { totalCount: 0, returnedCount: 0, limit: 250, truncated: false } },
    error: null, isError: false, isPending: false, isFetching: false, isRefetchError: false, refetch: vi.fn(),
  } as unknown as ReturnType<typeof useFieldSurveys>);
  vi.mocked(useUpdateReportAffectedFields).mockReturnValue(mutationResult() as unknown as ReturnType<typeof useUpdateReportAffectedFields>);
  vi.mocked(usePossibleRecentMatches).mockReturnValue(possibleMatchesResult());
  vi.mocked(useReport).mockReturnValue(queryResult());
  vi.mocked(useReports).mockReturnValue(reportsListResult());
  vi.mocked(useLinkDuplicateReport).mockReturnValue(duplicateMutationResult());
  vi.mocked(useUnlinkDuplicateReport).mockReturnValue(duplicateUnlinkMutationResult());
  vi.mocked(useUpdateReportReview).mockReturnValue(mutationResult());
});

describe("CaseReviewPage", () => {
  it("does not carry image failures or administrative drafts into the next case", async () => {
    const user = userEvent.setup();
    const nextReport = { ...report, uuid: "next-case", referenceCode: "CG-NEXT", farmerOrFarmOwnerName: "Next farm owner" };
    vi.mocked(useReport).mockImplementation((id) => queryResult({ data: id === "next-case" ? nextReport : report }));
    const discard = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<MemoryRouter initialEntries={[`/reports/${report.uuid}`]}><Routes>
      <Route path="/reports/:reportId" element={<><CaseReviewPage /><Link to="/reports/next-case">Open other case</Link></>} />
    </Routes></MemoryRouter>);
    fireEvent.error(screen.getByRole("img", { name: `Submitted sugarcane photo for ${report.referenceCode}` }));
    await user.click(screen.getByText("Other case actions"));
    await user.click(screen.getByRole("button", { name: "Correct case information" }));
    const correction = screen.getByRole("dialog", { name: "Correct case information" });
    await user.clear(within(correction).getByLabelText("Farmer or farm owner"));
    await user.type(within(correction).getByLabelText("Farmer or farm owner"), "Unsaved old-case correction");
    await user.click(within(correction).getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("link", { name: "Open other case" }));
    expect(screen.getByRole("heading", { level: 1, name: "CG-NEXT" })).toBeInTheDocument();
    expect(screen.queryByText("Image could not be loaded.")).not.toBeInTheDocument();
    await user.click(screen.getByText("Other case actions"));
    await user.click(screen.getByRole("button", { name: "Correct case information" }));
    expect(screen.getByLabelText("Farmer or farm owner")).toHaveValue("Next farm owner");
    discard.mockRestore();
  });

  it.each(["completed", "cancelled"] as const)("shows a %s referral as read-only history without gating office review", async (status) => {
    const user = userEvent.setup();
    vi.mocked(useReport).mockReturnValue(queryResult({
      data: reportAfterTerminalConsult(status, "expert_response_received"),
    }));
    const save = vi.fn().mockResolvedValue(report);
    vi.mocked(useUpdateReportReview).mockReturnValue(mutationResult({ mutateAsync: save }));
    renderPage();
    expect(screen.getByRole("heading", { name: "Expert referral (historical)" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Refer to expert/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Record expert response")).not.toBeInTheDocument();
    expect(screen.queryByText("Request expert input")).not.toBeInTheDocument();
    expect(document.getElementById("referral-response-form")).toBeNull();
    expect(document.getElementById("referral-modal")).toBeNull();
    await chooseAdvisory(user);
    const dialog = screen.getByRole("form", { name: "Report Evidence Review" });
    await user.type(within(dialog).getByRole("textbox", { name: /Review notes/ }), "Office evidence review.");
    await user.click(within(dialog).getByRole("button", { name: "Confirm Review" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ notes: expect.stringContaining("Office evidence review.") }));
    expect(save.mock.calls[0][0].actionTaken).toBe("advisory_provided");
  });

  it("keeps a printable case summary and plain handoff note without creating a consult", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(report);
    vi.mocked(useRecordHandoffNote).mockReturnValue({ mutateAsync: save, isPending: false, isError: false } as unknown as ReturnType<typeof useRecordHandoffNote>);
    renderPage();
    expect(screen.queryByRole("heading", { name: "Expert referral (historical)" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Print case summary" })).toHaveAttribute("href", `${env.apiBaseUrl.replace(/\/$/, "")}/api/v1/reports/${report.uuid}/referral/summary`);
    await user.click(screen.getByText("Add handoff note"));
    await user.type(screen.getByLabelText("Destination"), "Offline desk");
    await user.type(screen.getByLabelText("Sent date"), "2026-10-04");
    await user.type(screen.getByLabelText("Advice received note (optional)"), "Offline advice");
    await user.click(screen.getByRole("button", { name: "Save handoff note" }));
    expect(save).toHaveBeenCalledWith({
      destination: "Offline desk", reference: "", sentDate: "2026-10-04", note: "", adviceReceivedNote: "Offline advice", expectedVersion: report.reviewVersion,
    });
    expect(screen.queryByLabelText(/due date/i)).not.toBeInTheDocument();
  });

  it("offers validated office advisories and excludes drafts and retired items", async () => {
    const user = userEvent.setup();
    vi.mocked(useAdvisories).mockReturnValue({
      data: [
        {
          uuid: "office-advisory-001",
          code: "ADV-OFFICE-OPS-001",
          title: "Document and monitor affected rows",
          content: "Mark the affected rows and record the date and visible changes.",
          status: "validated",
        },
        {
          uuid: "office-advisory-draft",
          code: "ADV-DRAFT-001",
          title: "Draft office guidance",
          content: "Not yet approved.",
          status: "draft",
        },
        {
          uuid: "office-advisory-retired",
          code: "ADV-RETIRED-001",
          title: "Retired office guidance",
          content: "No longer selectable.",
          status: "retired",
        },
      ],
      isError: false,
    } as unknown as ReturnType<typeof useAdvisories>);
    renderPage();

    await chooseAdvisory(user);

    const modal = screen.getByRole("form", { name: "Report Evidence Review" });
    const advisorySelect = within(modal).getByLabelText("Validated advisory");
    expect(within(advisorySelect).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Select a validated advisory",
      "ADV-OFFICE-OPS-001 - Document and monitor affected rows",
    ]);
  });

  it("does not display the backend attention band", () => {
    vi.mocked(useReport).mockReturnValue(queryResult({
      data: { ...report, attentionBand: "red", attentionBandReasons: ["test-only backend detail"] },
    }));

    renderPage();

    expect(screen.queryByText(/Attention band/i)).not.toBeInTheDocument();
    expect(screen.queryByText("red")).not.toBeInTheDocument();
  });

  it("uses plain loading copy", () => {
    vi.mocked(useReport).mockReturnValue(queryResult({
      data: undefined,
      isPending: true,
      isSuccess: false,
    }));

    renderPage();

    expect(screen.getByText("Loading report...")).toBeInTheDocument();
  });

  it("renders future model evidence without dropping unknown class labels", () => {
    vi.mocked(useReport).mockReturnValue(queryResult({ data: {
      ...report, modelVersion: "v2-future", modelVersionRecognised: false,
      classScores: [{ label: "healthy", score: 0.2 }, { label: "new_class", score: 0.8 }],
    } }));
    renderPage();
    expect(screen.getByText(/Model version not recognised — evidence shown as submitted: v2-future/)).toBeInTheDocument();
    expect(screen.getByText("new_class (unrecognised class)")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("renders the submitted photo, Possible Condition, observations, and review detail", async () => {
    const user = userEvent.setup();
    renderPage();

    const image = screen.getByRole("img", {
      name: `Submitted sugarcane photo for ${report.referenceCode}`,
    });
    expect(image).toHaveAttribute("src", report.imageUrl);
    // Technical detail stays internal: no Technical Evidence section, no model
    // version, coordinates, GPS accuracy, class scores, or machine-fact chips
    // in the normal workflow.
    expect(screen.queryByText("Technical Evidence")).not.toBeInTheDocument();
    expect(screen.queryByText(/Attention band/i)).not.toBeInTheDocument();
    expect(screen.getByText(report.modelVersion!)).not.toBeVisible();
    expect(screen.queryByText("Machine facts")).not.toBeInTheDocument();
    expect(screen.queryByText("Checklist consistency")).not.toBeInTheDocument();
    expect(screen.getByText("Juan Dela Cruz")).toBeInTheDocument();
    const locationField = screen.getByText("Location").closest(".detail-field");
    expect(locationField).toHaveTextContent("Brgy. Balaytigui, Nasugbu, Batangas");
    expect(screen.getByRole("link", { name: "View on map" })).toHaveAttribute(
      "href",
      expect.stringContaining("google.com/maps"),
    );
    expect(screen.queryByText("14.126, 120.6039")).not.toBeInTheDocument();
    expect(screen.queryByText("GPS")).not.toBeInTheDocument();
    expect(screen.queryByText("4.25 m")).not.toBeInTheDocument();
    expect(screen.getByText("PSR 86")).toBeInTheDocument();
    expect(screen.getByText("6 months")).toBeInTheDocument();
    expect(screen.getByText("12.5 ha")).toBeInTheDocument();
    expect(screen.getByText("42.75%")).toBeInTheDocument();
    expect(
      screen.getByText("Rust symptoms concentrated on the eastern edge."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No image quality warnings were reported."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Symptom agreement")).not.toBeInTheDocument();
    expect(screen.queryByText("Checklist responses: Consistent with the Possible Condition")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Reporter observation: Possible Condition reported as not matching"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Reporter flagged AI mismatch")).not.toBeInTheDocument();
    // Human-readable decision states replace the machine chips.
    expect(screen.getByText("The submitted observations do not fully match the Possible Condition")).toBeInTheDocument();
    expect(screen.getByText("The reporter said the AI result does not match what they observed.")).toBeInTheDocument();
    const caseStatus = screen.getByRole("region", {
      name: "Case status",
    });
    expect(screen.getByText("Needs Review")).toBeInTheDocument();
    expect(caseStatus).toHaveTextContent("Open");
    expect(caseStatus).not.toHaveTextContent("Referral");
    await user.click(screen.getByText("View Full Report Details"));
    const details = screen.getByText("View Full Report Details").closest("details")!;
    expect(details).toHaveTextContent("Field validation");
    expect(details).toHaveTextContent("Unassigned");
    expect(details).toHaveTextContent("Verification");
    expect(details).toHaveTextContent("Not determined");
    expect(details).toHaveTextContent("First reviewed");
    expect(screen.getByText(/Dark whip-like growths/)).toBeInTheDocument();
    await chooseAdvisory(user);
    expect(screen.getByText(/Human finding; independent of the AI Possible Condition/)).toBeInTheDocument();
    expect(screen.getByLabelText("Staff-Classified Condition")).toHaveValue("");
    expect(screen.getByText("Sugarcane Smut")).toBeInTheDocument();
    expect(screen.getByText("Observed at")).toBeInTheDocument();
    expect(screen.getByText("Submitted at")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Completed field validation" }),
    ).not.toBeInTheDocument();

    // The Possible Condition leads the review with a decision-support
    // disclaimer; confidence stays out of the normal workflow.
    const possibleCondition = screen.getByRole("region", { name: "Possible Condition" });
    expect(possibleCondition).toBeVisible();
    expect(possibleCondition).toHaveTextContent("Rust");
    expect(screen.getByText(/AI-assisted result\./)).toBeInTheDocument();
    expect(within(possibleCondition).queryByText("93%")).not.toBeInTheDocument();
    expect(screen.queryByText("Decision-support only.")).not.toBeInTheDocument();

    // Reading order: photo, Possible Condition, field report, office decision.
    const photoHeading = screen.getByRole("heading", { name: "Submitted photo" });
    const conditionHeading = screen.getByRole("heading", { name: "Possible Condition" });
    const fieldReportHeading = screen.getByRole("heading", { name: "Field report" });
    const officeDecisionHeading = screen.getByRole("heading", { name: "Review Summary" });
    expect(photoHeading.compareDocumentPosition(conditionHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(conditionHeading.compareDocumentPosition(fieldReportHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fieldReportHeading.compareDocumentPosition(officeDecisionHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.error(image);
    expect(
      screen.getByRole("img", {
        name: "Image could not be loaded",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Image could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByText("Image available")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry image" }));
    expect(
      screen.getByRole("img", {
        name: `Submitted sugarcane photo for ${report.referenceCode}`,
      }),
    ).toBeInTheDocument();
  });

  it("renders unavailable location provenance and human measurement state", () => {
    const unavailable = mapReportDetail(
      reportDetailResponseSchema.parse({
        data: {
          ...reportDetailDto,
          observations: {
            ...reportDetailDto.observations,
            final_latitude: null,
            final_longitude: null,
            location_source: "unavailable",
            location_unavailable_reason: "offline_no_map",
            affected_area_hectares: null,
            affected_area_measurement: "not_measured",
            affected_portion_percent: null,
            affected_portion_measurement: "not_measured",
          },
        },
      }).data,
    );
    vi.mocked(useReport).mockReturnValue(queryResult({ data: unavailable }));

    renderPage();

    expect(screen.getByText("Location needs confirmation")).toBeInTheDocument();
    expect(screen.getByText(/Location not available — offline no map/)).toBeInTheDocument();
    expect(screen.queryByText("GPS")).not.toBeInTheDocument();
    expect(screen.getAllByText("Not measured")).toHaveLength(2);
  });

  it("renders RSSI reporter concern separately from the Possible Condition", () => {
    vi.mocked(useReport).mockReturnValue(
      queryResult({
        data: {
          ...report,
          reporterSuspectedCondition: "RSSI",
          reporterObservationText: "A field concern consistent with RSSI was observed.",
        },
      }),
    );
    renderPage();

    expect(screen.getByRole("heading", { name: "Possible Condition" })).toBeInTheDocument();
    expect(screen.getByText("RSSI reported as a field concern")).toBeInTheDocument();
    expect(
      screen.getByText(/reporter-observed evidence only; the AI result does not cover RSSI/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Reporter observation: RSSI field concern reported (not AI-detected)")).not.toBeInTheDocument();
    expect(screen.getByText("A field concern consistent with RSSI was observed.")).toBeInTheDocument();
  });

  it("renders completed field validation evidence in the case review", () => {
    const completedReport = mapReportDetail(
      reportDetailResponseSchema.parse({
        data: {
          ...reportDetailDto,
          lifecycle: {
            ...reportDetailDto.lifecycle,
            field_validation_state: "completed",
          },
          field_validation_assignment: completedFieldValidationAssignmentDto,
        },
      }).data,
    );
    vi.mocked(useReport).mockReturnValue(queryResult({ data: completedReport }));
    renderPage();

    const evidence = screen.getByRole("region", {
      name: "Completed field validation",
    });
    expect(within(evidence).getByText("Field validation")).toBeInTheDocument();
    expect(
      within(evidence).getByText(
        "Fresh observation from the assigned validation visit.",
      ),
    ).toBeInTheDocument();
    expect(
      within(evidence).getByText(
        "The field finding is preserved as separate evidence.",
      ),
    ).toBeInTheDocument();
    expect(within(evidence).getByText("Action Taken evidence")).toBeInTheDocument();
    expect(
      within(evidence).getByText("Provided field guidance and recorded the next action."),
    ).toBeInTheDocument();
    expect(within(evidence).getByText("Follow-up outcome")).toBeInTheDocument();
    expect(within(evidence).getByText("Improved")).toBeInTheDocument();
    expect(
      within(evidence).getByText(/read-only here and does not verify or close the case/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getAllByText("Case history")[0]);
    const timeline = screen.getByRole("region", { name: "Case history" });
    expect(within(timeline).getByText("Follow-up outcome")).toBeInTheDocument();
    expect(within(timeline).getByText("Improved")).toBeInTheDocument();
  });

  it("does not render field validation evidence when completion data is absent", () => {
    vi.mocked(useReport).mockReturnValue(
      queryResult({
        data: {
          ...report,
          fieldValidationAssignment: {
            uuid: "assignment-without-completion",
            assignee: { uuid: "field-reporter", name: "Field Reporter" },
            assignedBy: { uuid: "reviewer", name: "Reviewer" },
            activatedAt: "2026-08-13T12:00:00.000Z",
            updatedAt: "2026-08-13T12:00:00.000Z",
          },
        },
      }),
    );
    renderPage();

    expect(
      screen.queryByRole("heading", { name: "Completed field validation" }),
    ).not.toBeInTheDocument();
  });

  it("distinguishes an unasked mismatch state from an explicit no", () => {
    vi.mocked(useReport).mockReturnValue(
      queryResult({ data: { ...report, mismatchReported: null } }),
    );
    const { rerender } = renderPage();

    expect(
      screen.getByText("AI result agreement was not collected for this report."),
    ).toBeInTheDocument();

    vi.mocked(useReport).mockReturnValue(
      queryResult({ data: { ...report, mismatchReported: false } }),
    );
    rerender(
      <MemoryRouter initialEntries={[`/reports/${report.uuid}`]}>
        <Routes>
          <Route path="/reports/:reportId" element={<CaseReviewPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByText("The reporter said the AI result matches what they observed."),
    ).toBeInTheDocument();
    // The reporter's own concern is reported independently of that agreement.
    const concernField = screen
      .getByText("Observed or suspected concern")
      .closest(".detail-field");
    expect(concernField).toHaveTextContent("smut");
  });

  it("keeps an AI Smut result separate when the authority confirms Smut", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue(smutReport);
    vi.mocked(useReport).mockReturnValue(queryResult({ data: smutReport }));
    vi.mocked(useUpdateReportReview).mockReturnValue(mutationResult({ mutateAsync }));
    renderPage();

    expect(within(screen.getByRole("region", { name: "Possible Condition" })).getByText("Smut")).toBeVisible();
    await chooseAdvisory(user);
    const modal = screen.getByRole("form", { name: "Report Evidence Review" });
    await user.selectOptions(within(modal).getByLabelText("Staff-Classified Condition"), "smut");
    await user.type(within(modal).getByLabelText(/^Review notes/), "Authority confirmed Smut.");
    await user.click(within(modal).getByRole("button", { name: "Confirm Review" }));

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      authorityClassifiedCondition: "smut",
      expectedVersion: smutReport.reviewVersion,
    }));
  });

  it("offers every active Staff-Classified Condition but not legacy Downy mildew", async () => {
    const user = userEvent.setup();
    renderPage();

    await chooseAdvisory(user);
    const select = screen.getByLabelText("Staff-Classified Condition");
    expect(within(select).getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual([
      "",
      "healthy",
      "smut",
      "mosaic",
      "rust",
      "rssi",
      "mixed_or_multiple",
      "unable_to_classify",
    ]);
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Not classified",
      "Healthy / No Selected Concern",
      "Sugarcane Smut",
      "Sugarcane Mosaic Disease",
      "Sugarcane Rust",
      "RSSI",
      "Mixed or Multiple Visible Concerns",
      "Unable to Classify",
    ]);
    expect(within(select).queryByRole("option", { name: "Downy mildew" })).not.toBeInTheDocument();
  });

  it("keeps a historical Downy mildew classification readable and preservable", async () => {
    const user = userEvent.setup();
    const historicalReport = {
      ...report,
      authorityClassifiedCondition: "downy_mildew" as const,
    };
    const mutateAsync = vi.fn().mockResolvedValue(historicalReport);
    vi.mocked(useReport).mockReturnValue(queryResult({ data: historicalReport }));
    vi.mocked(useUpdateReportReview).mockReturnValue(mutationResult({ mutateAsync }));
    renderPage();

    await chooseAdvisory(user);
    const modal = screen.getByRole("form", { name: "Report Evidence Review" });
    const select = within(modal).getByLabelText("Staff-Classified Condition");
    expect(select).toHaveValue("downy_mildew");
    expect(
      within(select).getByRole("option", {
        name: /Downy mildew \(legacy record; not offered for new review\)/,
      }),
    ).toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "Confirm Review" }));

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      authorityClassifiedCondition: "downy_mildew",
      expectedVersion: historicalReport.reviewVersion,
    }));
  });

  it("does not select a next action or verification outcome automatically", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(
      screen
        .getAllByRole("radio")
        .every((radio) => !(radio as HTMLInputElement).checked),
    ).toBe(true);
    expect(
      screen.getByRole("group", { name: "What should happen next?" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("No office action selected")).not.toBeInTheDocument();

    await chooseAdvisory(user);
    const modal = screen.getByRole("form", { name: "Report Evidence Review" });
    expect(within(modal).getByLabelText("Verification Outcome")).toHaveValue("not_determined");
  });

  it("makes the existing review notes field explicit for intervention details", async () => {
    const user = userEvent.setup();
    renderPage();

    await chooseAdvisory(user);
    const modal = screen.getByRole("form", { name: "Report Evidence Review" });

    expect(within(modal).getByText(/Record treatment, pesticide, medicine, technical assistance, or other action details when applicable/i)).toBeInTheDocument();
    expect(within(modal).getByLabelText(/^Review notes/)).toHaveAttribute(
      "placeholder",
      "Describe the intervention or other action used, if applicable...",
    );
  });

  it("keeps possible matching advisory and explicit linkage separate", async () => {
    const user = userEvent.setup();
    const match = {
      uuid: "canonical-report",
      referenceCode: "CG-2026-0002",
      submittedAt: "2026-07-20T10:00:00.000Z",
      condition: "rust" as const,
      distanceMeters: 12.4,
      basis: ["same_condition", "nearby_location", "recent_submission"] as const,
      message: "Possible recent match. Compare this case before deciding.",
    };
    const mutateAsync = vi.fn().mockResolvedValue(report);
    vi.mocked(usePossibleRecentMatches).mockReturnValue(
      possibleMatchesResult({
        data: {
          matches: [match],
          message: "Possible recent matches found.",
          possibleMatch: true,
          canSubmit: true,
          assessment: "condition_and_location",
          recentWindowHours: 72,
          locationRadiusMeters: 100,
        },
      }),
    );
    vi.mocked(useLinkDuplicateReport).mockReturnValue(
      duplicateMutationResult({ mutateAsync }),
    );
    renderPage();

    await user.click(screen.getByRole("button", { name: "Link as possible duplicate" }));
    const modal = screen.getByRole("dialog", { name: "Link as possible duplicate" });
    expect(within(modal).getByText(/nothing is merged, deleted, or blocked automatically/i)).toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "Use as canonical" }));
    expect(within(modal).getByTestId("report-picker-selection")).toHaveTextContent("CG-2026-0002");
    await user.type(
      within(modal).getByLabelText(/^Link reason \(optional\)/),
      " The cases may describe the same field observation. ",
    );
    await user.click(within(modal).getByRole("button", { name: "Link as possible duplicate" }));

    expect(mutateAsync).toHaveBeenCalledWith({
      canonicalReportUuid: "canonical-report",
      reason: "The cases may describe the same field observation.",
      expectedVersion: report.reviewVersion,
    });
    expect(await screen.findByText(/submitted record remains preserved/i)).toBeInTheDocument();
  });

  it("requires a canonical case before explicit linkage", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn();
    vi.mocked(useLinkDuplicateReport).mockReturnValue(
      duplicateMutationResult({ mutateAsync }),
    );
    renderPage();

    await user.click(screen.getByRole("button", { name: "Link as possible duplicate" }));
    const modal = screen.getByRole("dialog", { name: "Link as possible duplicate" });

    expect(within(modal).getByRole("combobox", { name: "Search cases" })).toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "Link as possible duplicate" }));

    expect(within(modal).getByText(/enter a canonical case ID/i)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("selects a duplicate link target from case search and renders the reference-code chip", async () => {
    const user = userEvent.setup();
    const target = pickerReport();
    vi.mocked(useReports).mockReturnValue(reportsListResult([target]));
    const mutateAsync = vi.fn().mockResolvedValue(report);
    vi.mocked(useLinkDuplicateReport).mockReturnValue(
      duplicateMutationResult({ mutateAsync }),
    );
    renderPage();

    await user.click(screen.getByRole("button", { name: "Link as possible duplicate" }));
    const modal = screen.getByRole("dialog", { name: "Link as possible duplicate" });
    await user.click(within(modal).getByRole("combobox", { name: "Search cases" }));
    await user.click(await within(modal).findByRole("option", { name: /CG-2026-0007/ }));

    expect(within(modal).getByTestId("report-picker-selection")).toHaveTextContent("CG-2026-0007");
    await user.click(within(modal).getByRole("button", { name: "Link as possible duplicate" }));

    expect(mutateAsync).toHaveBeenCalledWith({
      canonicalReportUuid: "target-report-uuid",
      reason: undefined,
      expectedVersion: report.reviewVersion,
    });
    expect(await screen.findByText(/submitted record remains preserved/i)).toBeInTheDocument();
  });

  it("excludes the case under review from case search results", async () => {
    const user = userEvent.setup();
    const current = pickerReport({ uuid: report.uuid, referenceCode: report.referenceCode });
    const other = pickerReport();
    vi.mocked(useReports).mockReturnValue(reportsListResult([current, other]));
    renderPage();

    await user.click(screen.getByRole("button", { name: "Link as possible duplicate" }));
    const modal = screen.getByRole("dialog", { name: "Link as possible duplicate" });
    await user.click(within(modal).getByRole("combobox", { name: "Search cases" }));

    expect(await within(modal).findByRole("option", { name: /CG-2026-0007/ })).toBeInTheDocument();
    expect(
      within(modal).queryByRole("option", { name: new RegExp(report.referenceCode) }),
    ).not.toBeInTheDocument();
  });

  it("links with a pasted case ID from the collapsed fallback", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue(report);
    vi.mocked(useLinkDuplicateReport).mockReturnValue(
      duplicateMutationResult({ mutateAsync }),
    );
    renderPage();

    await user.click(screen.getByRole("button", { name: "Link as possible duplicate" }));
    const modal = screen.getByRole("dialog", { name: "Link as possible duplicate" });
    await user.click(within(modal).getByText("Paste a case ID instead"));
    await user.type(
      within(modal).getByLabelText("Canonical case ID"),
      "123e4567-e89b-12d3-a456-426614174000",
    );
    await user.click(within(modal).getByRole("button", { name: "Link as possible duplicate" }));

    expect(mutateAsync).toHaveBeenCalledWith({
      canonicalReportUuid: "123e4567-e89b-12d3-a456-426614174000",
      reason: undefined,
      expectedVersion: report.reviewVersion,
    });
  });

  it("surfaces the server report error for duplicate linking", async () => {
    const user = userEvent.setup();
    vi.mocked(useLinkDuplicateReport).mockReturnValue(
      duplicateMutationResult({
        error: new ApiError("The duplicate could not be recorded.", {
          status: 422,
          errors: { report: ["This case already has linked duplicates of its own."] },
        }),
        isError: true,
      }),
    );
    renderPage();

    await user.click(screen.getByRole("button", { name: "Link as possible duplicate" }));
    const modal = screen.getByRole("dialog", { name: "Link as possible duplicate" });
    expect(
      within(modal).getByText("This case already has linked duplicates of its own."),
    ).toBeInTheDocument();
    expect(within(modal).queryByText(/service is unavailable/i)).not.toBeInTheDocument();
  });

  it("keeps the reason field usable when case search is empty or unavailable", async () => {
    const user = userEvent.setup();
    vi.mocked(useReports).mockReturnValue(reportsListResult([]));
    renderPage();

    await user.click(screen.getByRole("button", { name: "Link as possible duplicate" }));
    screen.getByRole("dialog", { name: "Link as possible duplicate" });
    await user.click(screen.getByRole("combobox", { name: "Search cases" }));
    expect(await screen.findByText(/No cases match this search/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Link reason \(optional\)/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Link as possible duplicate" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    vi.mocked(useReports).mockReturnValue(
      reportsListResult([], {
        data: undefined,
        error: new Error("offline"),
        isError: true,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Link as possible duplicate" }));
    screen.getByRole("dialog", { name: "Link as possible duplicate" });
    await user.click(screen.getByRole("combobox", { name: "Search cases" }));
    screen.getByRole("dialog", { name: "Link as possible duplicate" });
    expect(await screen.findByText(/Case search is unavailable/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Link reason \(optional\)/)).toBeInTheDocument();
  });

  it("shows the preserved relationship after a case is linked", () => {
    vi.mocked(useReport).mockReturnValue(
      queryResult({
        data: {
          ...report,
          canonicalLinkage: {
            isDuplicate: true,
            canonicalCase: {
              uuid: "canonical-report",
              referenceCode: "CG-2026-0002",
              submittedAt: "2026-07-20T10:00:00.000Z",
            },
            linkedBy: { uuid: "reviewer-1", name: "Maria Reviewer" },
            linkedAt: "2026-07-20T11:00:00.000Z",
            reason: "The cases may describe the same field observation.",
          },
        },
      }),
    );
    renderPage();

    expect(screen.getByText("Linked as a possible duplicate")).toBeInTheDocument();
    expect(screen.getByText(/Canonical case CG-2026-0002/)).toBeInTheDocument();
    expect(screen.getByText(/submitted record and its audit history remain preserved/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Link as possible duplicate" })).not.toBeInTheDocument();
  });

  it("can remove a preserved duplicate relationship with the current version", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn();
    vi.mocked(useReport).mockReturnValue(
      queryResult({
        data: {
          ...report,
          canonicalLinkage: {
            isDuplicate: true,
            canonicalCase: {
              uuid: "canonical-report",
              referenceCode: "CG-2026-0002",
              submittedAt: "2026-07-20T10:00:00.000Z",
            },
            linkedBy: { uuid: "reviewer-1", name: "Maria Reviewer" },
            linkedAt: "2026-07-20T11:00:00.000Z",
            reason: "The cases may describe the same field observation.",
          },
        },
      }),
    );
    vi.mocked(useUnlinkDuplicateReport).mockReturnValue(
      duplicateUnlinkMutationResult({ mutateAsync }),
    );
    renderPage();

    await user.click(screen.getByRole("button", { name: "Remove duplicate link" }));

    expect(mutateAsync).toHaveBeenCalledWith({ expectedVersion: report.reviewVersion });
  });

  it("requires a field reporter when field validation is selected", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn();
    vi.mocked(useUpdateReportReview).mockReturnValue(mutationResult({ mutateAsync }));
    renderPage();

    await user.click(screen.getByRole("radio", { name: "Needs Field Validation" }));
    const modal = screen.getByRole("form", { name: "Report Evidence Review" });
    await user.click(within(modal).getByRole("button", { name: "Confirm Review" }));

    expect(screen.getAllByText(/Select a Field Inspector before saving/i).length).toBeGreaterThan(0);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("saves an immediate assignment with an optional target date and same-person warning", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue(report);
    vi.mocked(useFieldReporters).mockReturnValue({
      data: [{ uuid: report.submitterUuid!, name: report.submittedByName }],
      isError: false,
    } as ReturnType<typeof useFieldReporters>);
    vi.mocked(useUpdateReportReview).mockReturnValue(mutationResult({ mutateAsync }));
    renderPage();

    await user.click(screen.getByRole("radio", { name: "Needs Field Validation" }));
    const modal = screen.getByRole("form", { name: "Report Evidence Review" });
    await user.selectOptions(
      within(modal).getByLabelText("Field Inspector assignee"),
      report.submitterUuid!,
    );
    expect(within(modal).getByText(/original submitter is also the field validator/i)).toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "Confirm Review" }));

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      verificationOutcome: "not_determined",
      caseState: "open",
      fieldValidationState: "assigned",
      fieldValidationAssigneeUuid: report.submitterUuid,
      fieldValidationTargetDate: null,
    }));
  });

  it("requires a note when evidence cannot be verified", async () => {
    const mutateAsync = vi.fn();
    vi.mocked(useUpdateReportReview).mockReturnValue(
      mutationResult({ mutateAsync }),
    );
    const user = userEvent.setup();
    renderPage();

    await chooseAdvisory(user);
    const modal = screen.getByRole("form", { name: "Report Evidence Review" });

    await user.selectOptions(
      within(modal).getByLabelText("Verification Outcome"),
      "unable_to_verify",
    );
    await user.click(
      within(modal).getByRole("button", { name: "Confirm Review" }),
    );

    expect(
      screen.getAllByText(/Add a note explaining why/i).length,
    ).toBeGreaterThan(0);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("keeps decision validation inline and prefixes document title on failure", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn();
    vi.mocked(useUpdateReportReview).mockReturnValue(
      mutationResult({ mutateAsync }),
    );
    renderPage();

    await chooseAdvisory(user);
    const modal = screen.getByRole("form", { name: "Report Evidence Review" });
    await user.selectOptions(
      within(modal).getByLabelText("Verification Outcome"),
      "unable_to_verify",
    );
    await user.click(within(modal).getByRole("button", { name: "Confirm Review" }));

    // The draft remains inline with its validation message; nothing is sent.
    expect(
      within(modal).getByText(/Add a note explaining why/i),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("form", { name: "Report Evidence Review" })).toBeInTheDocument();
    expect(document.title).toMatch(/^Error: /);
  });

  it("saves with the loaded version and stays on the case after success", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(report);
    vi.mocked(useUpdateReportReview).mockReturnValue(
      mutationResult({ mutateAsync }),
    );
    const user = userEvent.setup();
    renderPage();

    await chooseAdvisory(user);
    const modal = screen.getByRole("form", { name: "Report Evidence Review" });
    await user.selectOptions(
      within(modal).getByLabelText("Staff-Classified Condition"),
      "smut",
    );
    await user.type(
      within(modal).getByLabelText(/^Review notes/),
      "Field evidence reviewed.",
    );
    await user.click(
      within(modal).getByRole("button", { name: "Confirm Review" }),
    );

    expect(mutateAsync).toHaveBeenCalledWith({
      notes: "Field evidence reviewed.",
      authorityClassifiedCondition: "smut",
      verificationOutcome: "not_determined",
      actionTaken: "advisory_provided",
      advisoryUuid: officeAdvisory.uuid,
      expectedVersion: report.reviewVersion,
    });
    expect(
      await screen.findByText(`${report.referenceCode} — Review confirmed.`),
    ).toBeInTheDocument();
    // The reviewer stays on the case instead of returning to the queue.
    expect(screen.queryByText("Returned to report queue")).not.toBeInTheDocument();
  });

  it("shows field validation and stale-review conflicts distinctly", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    vi.mocked(useReport).mockReturnValue(queryResult({ refetch }));
    vi.mocked(useUpdateReportReview).mockReturnValue(
      mutationResult({
        error: new ApiError("Invalid", {
          status: 422,
          errors: { notes: ["The notes field is required."] },
        }),
        isError: true,
      }),
    );
    const { rerender } = renderPage();
    // The failure is reported beside the inline confirmation.
    await chooseAdvisory(user);
    const modal = screen.getByRole("form", { name: "Report Evidence Review" });
    expect(within(modal).getByText("The notes field is required.")).toBeInTheDocument();

    vi.mocked(useUpdateReportReview).mockReturnValue(
      mutationResult({
        error: new ApiError("Conflict", { status: 409 }),
        isError: true,
      }),
    );
    rerender(
      <MemoryRouter initialEntries={[`/reports/${report.uuid}`]}>
        <Routes>
          <Route path="/reports/:reportId" element={<CaseReviewPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(within(modal).getByText(/Another reviewer saved this report/i)).toBeInTheDocument();

    // A failed comparison read keeps the draft and offers an explicit retry.
    await user.click(await within(modal).findByRole("button", { name: "Try loading the latest version again" }));
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it("prevents a duplicate save while a review is pending", async () => {
    vi.mocked(useUpdateReportReview).mockReturnValue(
      mutationResult({ isPending: true }),
    );
    renderPage();

    const modal = screen.getByRole("form", { name: "Report Evidence Review" });
    expect(
      within(modal).getByRole("button", { name: "Confirming review..." }),
    ).toBeDisabled();
  });

  it("keeps an over-long draft inline without saving", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn();
    vi.mocked(useUpdateReportReview).mockReturnValue(
      mutationResult({ mutateAsync }),
    );
    renderPage();

    await chooseAdvisory(user);
    const modal = screen.getByRole("form", { name: "Report Evidence Review" });
    // One change event (not per-keystroke typing) keeps the 1,001-char
    // draft fast under test; the component sees the same final value.
    fireEvent.change(within(modal).getByLabelText(/^Review notes/), {
      target: { value: "x".repeat(1001) },
    });
    await user.click(within(modal).getByRole("button", { name: "Confirm Review" }));

    // The draft remains inline with its note-length error.
    expect(
      within(modal).getByText(/Review notes must be 1,000 characters or fewer/i),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("form", { name: "Report Evidence Review" })).toBeInTheDocument();
  });

  it("shows a stale-review conflict with explicit reconciliation inline", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    vi.mocked(useReport).mockReturnValue(queryResult({ refetch }));
    vi.mocked(useUpdateReportReview).mockReturnValue(
      mutationResult({
        error: new ApiError("Conflict", { status: 409 }),
        isError: true,
      }),
    );
    renderPage();

    await chooseAdvisory(user);
    const modal = screen.getByRole("form", { name: "Report Evidence Review" });

    expect(
      within(modal).getByText(/Another reviewer saved this report/i),
    ).toBeInTheDocument();
    // The stale draft cannot be resubmitted against a merely refreshed token.
    expect(
      within(modal).getByRole("button", { name: "Confirm Review" }),
    ).toBeDisabled();
    await user.click(
      await within(modal).findByRole("button", { name: "Try loading the latest version again" }),
    );
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it("offers a first-open status retry without blocking the evidence", async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    const reset = vi.fn();
    vi.mocked(useOpenCase).mockReturnValue({
      mutate,
      reset,
      isError: true,
      isPending: false,
    } as never);
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: report.referenceCode })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Evidence Summary" })).toBeInTheDocument();
    const alert = screen.getByText(/first-review status was not recorded/i).closest("[role='alert']") as HTMLElement;
    expect(alert).not.toHaveTextContent(/review lock version/i);

    const attemptsBeforeRetry = mutate.mock.calls.length;
    await user.click(within(alert).getByRole("button", { name: "Retry status update" }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledTimes(attemptsBeforeRetry + 1);
  });

  it("disables the inline decision controls while saving and sends one request", async () => {
    const user = userEvent.setup();
    const savePromise = new Promise(() => {});
    const mutateAsync = vi.fn().mockReturnValue(savePromise);
    vi.mocked(useUpdateReportReview).mockReturnValue(
      mutationResult({ mutateAsync }),
    );
    const { rerender } = renderPage();

    await chooseAdvisory(user);
    const modal = screen.getByRole("form", { name: "Report Evidence Review" });
    await user.click(within(modal).getByRole("button", { name: "Confirm Review" }));
    expect(mutateAsync).toHaveBeenCalledTimes(1);

    // While the save is in flight the decision controls lock.
    vi.mocked(useUpdateReportReview).mockReturnValue(
      mutationResult({ mutateAsync, isPending: true }),
    );
    rerender(
      <MemoryRouter initialEntries={[`/reports/${report.uuid}`]}>
        <Routes>
          <Route path="/reports/:reportId" element={<CaseReviewPage />} />
          <Route path="/reports" element={<p>Returned to report queue</p>} />
        </Routes>
      </MemoryRouter>,
    );
    const pendingModal = screen.getByRole("form", { name: "Report Evidence Review" });
    expect(within(pendingModal).getByRole("button", { name: "Confirming review..." })).toBeDisabled();
    expect(within(pendingModal).getByLabelText("Staff-Classified Condition")).toBeDisabled();
    expect(within(pendingModal).getByLabelText("Validated advisory")).toBeDisabled();

    // A second click on the locked submit sends nothing more.
    await user.click(within(pendingModal).getByRole("button", { name: "Confirming review..." }));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("keeps cached detail visible and offers retry after a failed refresh", async () => {
    const refetch = vi.fn();
    vi.mocked(useReport).mockReturnValue(
      queryResult({
        error: new ApiError("Unavailable", { status: 503 }),
        isError: true,
        isRefetchError: true,
        refetch,
      }),
    );
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText(report.referenceCode)).toBeInTheDocument();
    expect(
      screen.getByText(/previously loaded report remains visible/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Retry report refresh" }),
    );
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("distinguishes rate-limited and malformed review responses", async () => {
    const user = userEvent.setup();
    vi.mocked(useUpdateReportReview).mockReturnValue(
      mutationResult({
        error: new ApiError("Slow down", { status: 429 }),
        isError: true,
      }),
    );
    const { rerender } = renderPage();
    await chooseAdvisory(user);
    const modal = screen.getByRole("form", { name: "Report Evidence Review" });
    expect(within(modal).getByText(/too many review attempts/i)).toBeInTheDocument();

    vi.mocked(useUpdateReportReview).mockReturnValue(
      mutationResult({
        error: new ZodError([]),
        isError: true,
      }),
    );
    rerender(
      <MemoryRouter initialEntries={[`/reports/${report.uuid}`]}>
        <Routes>
          <Route path="/reports/:reportId" element={<CaseReviewPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      within(modal).getByText(/server returned an unexpected response/i),
    ).toBeInTheDocument();
  });

  it("exposes the decision summary with next action, classification, verification, and the resulting state", async () => {
    const user = userEvent.setup();
    renderPage();

    const summary = screen.getByRole("region", { name: "Review Summary" });
    const echo = summary.querySelector(".decision-summary__grid") as HTMLElement;
    expect(within(echo).getByText("Pending decision")).toBeInTheDocument();
    expect(within(echo).getByText("Not classified")).toBeInTheDocument();
    expect(within(echo).getByText("Not determined")).toBeInTheDocument();
    expect(within(echo).getByText("Open")).toBeInTheDocument();

    await chooseAdvisory(user);
    expect(within(echo).getByText("Provide Advisory or Assistance")).toBeInTheDocument();

    // The summary tracks each pending choice before confirmation.
    const modal = screen.getByRole("form", { name: "Report Evidence Review" });
    await user.selectOptions(within(modal).getByLabelText("Staff-Classified Condition"), "smut");
    await user.selectOptions(within(modal).getByLabelText("Verification Outcome"), "verified");

    // The read-only summary reflects the current inline draft.
    expect(within(echo).getByText("Sugarcane Smut")).toBeInTheDocument();
    expect(within(echo).getByText("Verified")).toBeInTheDocument();
  });

  it("distinguishes missing, forbidden, and rate-limited reports", () => {
    vi.mocked(useReport).mockReturnValue(
      queryResult({ data: null, isSuccess: true }),
    );
    const { rerender } = renderPage();
    expect(screen.getByText(/does not exist/i)).toBeInTheDocument();

    vi.mocked(useReport).mockReturnValue(
      queryResult({
        data: report,
        error: new ApiError("Forbidden", { status: 403 }),
        isError: true,
        isRefetchError: true,
        isSuccess: false,
      }),
    );
    rerender(
      <MemoryRouter initialEntries={[`/reports/${report.uuid}`]}>
        <Routes>
          <Route path="/reports/:reportId" element={<CaseReviewPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/does not have access/i)).toBeInTheDocument();
    expect(screen.queryByText(report.referenceCode)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();

    vi.mocked(useReport).mockReturnValue(
      queryResult({
        data: undefined,
        error: new ApiError("Slow down", { status: 429 }),
        isError: true,
        isSuccess: false,
      }),
    );
    rerender(
      <MemoryRouter initialEntries={[`/reports/${report.uuid}`]}>
        <Routes>
          <Route path="/reports/:reportId" element={<CaseReviewPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/too many requests/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });


  it("keeps duplicate linking and case information correction under Other case actions", async () => {
    const user = userEvent.setup();
    renderPage();

    const moreActions = screen.getByRole("region", { name: "Other case actions" });
    expect(moreActions.closest("details")).toBeInTheDocument();
    const decision = screen.getByRole("region", { name: "Review Summary" });
    expect(
      within(decision).queryByRole("button", { name: "Link as possible duplicate" }),
    ).not.toBeInTheDocument();
    expect(
      within(decision).queryByRole("button", { name: "Correct case information" }),
    ).not.toBeInTheDocument();
    expect(
      within(moreActions).getByRole("button", { name: "Link as possible duplicate" }),
    ).toBeInTheDocument();
    expect(
      within(moreActions).getByRole("button", { name: "Correct case information" }),
    ).toBeInTheDocument();

    expect(screen.queryByLabelText(/Search cases/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Farmer or farm owner")).not.toBeInTheDocument();

    await user.click(within(moreActions).getByRole("button", { name: "Link as possible duplicate" }));
    const dupModal = screen.getByRole("dialog", { name: "Link as possible duplicate" });
    expect(within(dupModal).getByLabelText(/Search cases/i)).toBeInTheDocument();
    expect(within(dupModal).getByText("Paste a case ID instead")).toBeInTheDocument();
    await user.click(within(dupModal).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Link as possible duplicate" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Search cases/i)).not.toBeInTheDocument();

    await user.click(within(moreActions).getByRole("button", { name: "Correct case information" }));
    const metaModal = screen.getByRole("dialog", { name: "Correct case information" });
    expect(within(metaModal).getByLabelText("Farmer or farm owner")).toBeInTheDocument();
    await user.click(within(metaModal).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Correct case information" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Farmer or farm owner")).not.toBeInTheDocument();
  });

  it("closes a case only through the confirmed No further action choice", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue(report);
    vi.mocked(useUpdateReportReview).mockReturnValue(mutationResult({ mutateAsync }));
    renderPage();

    expect(
      screen.queryByRole("checkbox", { name: /Close this case/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "No Further Action" }));
    // The explicit closure confirmation is inline with the action.
    const modal = screen.getByRole("form", { name: "Report Evidence Review" });
    const closeConfirmation = within(modal).getByRole("checkbox", { name: /Close this case/ });
    expect(closeConfirmation).not.toBeChecked();
    await user.click(within(modal).getByRole("button", { name: "Confirm Review" }));
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(within(modal).getByText("Confirm that you want to close this case.")).toBeInTheDocument();
    await user.click(closeConfirmation);
    expect(closeConfirmation).toBeChecked();
    expect(mutateAsync).not.toHaveBeenCalled();
    await user.click(within(modal).getByRole("button", { name: "Confirm Review" }));
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      actionTaken: "no_further_action_required", caseState: "closed",
    }));

  });

  it("closes the case when the No further action confirmation is explicitly checked", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue(report);
    vi.mocked(useUpdateReportReview).mockReturnValue(mutationResult({ mutateAsync }));
    renderPage();

    await user.click(screen.getByRole("radio", { name: "No Further Action" }));
    const modal = screen.getByRole("form", { name: "Report Evidence Review" });
    await user.click(within(modal).getByRole("checkbox", { name: /Close this case/ }));
    expect(within(modal).getByRole("checkbox", { name: /Close this case/ })).toBeChecked();
    await user.click(within(modal).getByRole("button", { name: "Confirm Review" }));

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        actionTaken: "no_further_action_required",
        caseState: "closed",
      }),
    );
  });

  it("renders empty timeline message when there are no prior review events", () => {
    renderPage();
    expect(screen.getByText("No prior review events recorded.")).toBeInTheDocument();
  });

  it("renders review events in the timeline when present", () => {
    const reportWithEvents = {
      ...report,
      reviewEvents: [
        {
          id: 1,
          actor: {
            uuid: "00000000-0000-4000-8000-000000000100",
            name: "Maria Santos",
          },
          actionTaken: "advisory_provided" as const,
          authorityClassifiedCondition: "rust" as const,
          verificationOutcome: "verified" as const,
          notes: "Initial field observation confirmed leaf rust.",
          caseState: "open" as const,
          createdAt: "2026-07-21T14:30:00.000Z",
        },
      ],
    };
    vi.mocked(useReport).mockReturnValue(queryResult({ data: reportWithEvents }));
    renderPage();

    const timeline = screen.getByRole("region", { name: "Case history" });
    expect(within(timeline).getByText("Maria Santos")).toBeInTheDocument();
    expect(within(timeline).getByText("Advisory provided")).toBeInTheDocument();
    expect(within(timeline).getByText("Sugarcane Rust")).toBeInTheDocument();
    expect(within(timeline).getByText("Verified")).toBeInTheDocument();
    expect(within(timeline).getByText("Initial field observation confirmed leaf rust.")).toBeInTheDocument();
  });

  it("omits technical assistance from next-action selection while displaying it in historical review events", () => {
    const reportWithHistoricalTechnicalAssistance = {
      ...report,
      actionTaken: "technical_assistance_provided" as const,
      reviewEvents: [
        {
          id: 2,
          actor: {
            uuid: "00000000-0000-4000-8000-000000000101",
            name: "Maria Santos",
          },
          actionTaken: "technical_assistance_provided" as const,
          authorityClassifiedCondition: null,
          verificationOutcome: null,
          notes: "Provided technical assistance to the field contact.",
          caseState: "open" as const,
          createdAt: "2026-07-22T14:30:00.000Z",
        },
      ],
    };
    vi.mocked(useReport).mockReturnValue(
      queryResult({ data: reportWithHistoricalTechnicalAssistance }),
    );
    renderPage();

    const nextActionGroup = screen.getByRole("group", { name: "What should happen next?" });
    expect(
      within(nextActionGroup).queryByRole("radio", { name: /Provide technical assistance/ }),
    ).not.toBeInTheDocument();

    const timeline = screen.getByRole("region", { name: "Case history" });
    expect(within(timeline).getByText("Technical assistance provided")).toBeInTheDocument();
    expect(within(timeline).getByText("Provided technical assistance to the field contact.")).toBeInTheDocument();
  });

  it("keeps all three actions inline with one final confirmation", async () => {
    const user = userEvent.setup();
    renderPage();

    const decision = screen.getByRole("form", { name: "Report Evidence Review" });
    const actions = screen.getByRole("group", { name: "What should happen next?" });
    expect(within(actions).getAllByRole("radio")).toHaveLength(3);
    expect(screen.getAllByRole("group", { name: "What should happen next?" })).toHaveLength(1);
    await chooseAdvisory(user);
    expect(within(decision).getAllByRole("button", { name: "Confirm Review" })).toHaveLength(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "No Further Action" }));
    expect(within(decision).getAllByRole("button", { name: "Confirm Review" })).toHaveLength(1);
    expect(screen.queryByRole("radio", { name: /Refer to expert/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Needs Field Validation" }));
    expect(within(decision).getAllByRole("button", { name: "Confirm Review" })).toHaveLength(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  });

  it("shows existing work status without automatically selecting a new decision", () => {
    const fieldValidationReport = mapReportDetail(
      reportDetailResponseSchema.parse({
        data: {
          ...reportDetailDto,
          review: { ...reportDetailDto.review, status: "for_field_validation" },
          lifecycle: {
            ...reportDetailDto.lifecycle,
            field_validation_state: "assigned",
          },
        },
      }).data,
    );
    vi.mocked(useReport).mockReturnValue(queryResult({ data: fieldValidationReport }));
    renderPage();

    expect(screen.getByText("Field Validation")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Needs Field Validation" })).not.toBeChecked();
    expect(screen.getByText("Pending decision")).toBeInTheDocument();

  });

  it("shows a closed case without automatically selecting a new closure decision", () => {
    const closedReport = {
      ...report,
      reviewStatus: "verified_by_staff" as const,
      lifecycle: {
        ...report.lifecycle!,
        caseState: "closed" as const,
        verificationOutcome: "verified" as const,
      },
    };
    vi.mocked(useReport).mockReturnValue(queryResult({ data: closedReport }));
    renderPage();

    expect(screen.getByRole("region", { name: "Case status" })).toHaveTextContent("Closed");
    expect(screen.getByRole("radio", { name: "No Further Action" })).not.toBeChecked();
    expect(screen.getByText("Pending decision")).toBeInTheDocument();

  });

  it("expands field validation inline and explicitly reopens the case in the same confirmation", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue(report);
    const closedReport = {
      ...report,
      lifecycle: { ...report.lifecycle!, caseState: "closed" as const },
    };
    vi.mocked(useReport).mockReturnValue(queryResult({ data: closedReport }));
    vi.mocked(useFieldReporters).mockReturnValue({
      data: [{ uuid: "inspector-uuid", name: "Ana Inspector" }],
      isError: false,
    } as unknown as ReturnType<typeof useFieldReporters>);
    vi.mocked(useUpdateReportReview).mockReturnValue(mutationResult({ mutateAsync }));
    renderPage();

    // No office-decision step stands between the choice and its save.
    await user.click(screen.getByRole("radio", { name: "Needs Field Validation" }));
    expect(
      screen.queryByRole("dialog", { name: "Record office decision" }),
    ).not.toBeInTheDocument();
    const modal = screen.getByRole("form", { name: "Report Evidence Review" });
    await user.selectOptions(
      within(modal).getByLabelText("Field Inspector assignee"),
      "inspector-uuid",
    );

    // A closed case must be reopened by the same save that assigns the visit.
    await user.click(within(modal).getByRole("button", { name: "Confirm Review" }));
    expect(
      within(modal).getByText(/Reopen the case before assigning/i),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();

    await user.click(within(modal).getByRole("checkbox", { name: /Reopen this case/ }));
    await user.click(within(modal).getByRole("button", { name: "Confirm Review" }));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      caseState: "open",
      fieldValidationState: "assigned",
      fieldValidationAssigneeUuid: "inspector-uuid",
    }));
  });

  it("stays on the case with inline success and next-case / queue controls", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    const mutateAsync = vi.fn().mockResolvedValue(report);
    vi.mocked(useReport).mockReturnValue(queryResult({ refetch }));
    vi.mocked(useUpdateReportReview).mockReturnValue(mutationResult({ mutateAsync }));
    renderPage();

    await chooseAdvisory(user);
    const modal = screen.getByRole("form", { name: "Report Evidence Review" });
    await user.click(within(modal).getByRole("button", { name: "Confirm Review" }));

    const message = `${report.referenceCode} — Review confirmed.`;
    const success = await screen.findByText(message);
    expect(success.closest(".review-save-success")).toHaveAttribute("role", "status");
    expect(screen.queryByText("Returned to report queue")).not.toBeInTheDocument();
    expect(refetch).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Review Next Case" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to Queue" })).toBeInTheDocument();

  });
});
