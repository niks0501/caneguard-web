import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
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
import {
  useAdvisories,
  useConfirmExpertReferral,
  useExpertDirectory,
  useIssueConsultInvite,
  useLinkDuplicateReport,
  usePossibleRecentMatches,
  useReports,
  useUnlinkDuplicateReport,
  useRecordExpertReferralResponse,
  useRecordReportReferral,
  useRevokeConsultInvite,
  useReport,
  useUpdateReportReview,
} from "../hooks/useReports";
import { CaseReviewPage } from "./CaseReviewPage";

vi.mock("../hooks/useReports", () => ({
  useAdvisories: vi.fn(),
  useConfirmExpertReferral: vi.fn(),
  useExpertDirectory: vi.fn(),
  useIssueConsultInvite: vi.fn(),
  useLinkDuplicateReport: vi.fn(),
  usePossibleRecentMatches: vi.fn(),
  useReports: vi.fn(),
  useUnlinkDuplicateReport: vi.fn(),
  useRecordExpertReferralResponse: vi.fn(),
  useRecordReportReferral: vi.fn(),
  useRevokeConsultInvite: vi.fn(),
  useReport: vi.fn(),
  useUpdateReportReview: vi.fn(),
}));
vi.mock("../hooks/useFieldReporters", () => ({
  useFieldReporters: vi.fn(() => ({ data: [], isError: false })),
}));

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

function referralMutationResult(overrides: Record<string, unknown> = {}) {
  return mutationResult(overrides) as unknown as ReturnType<typeof useRecordReportReferral>;
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

beforeEach(() => {
  vi.mocked(useAdvisories).mockReturnValue({ data: [], isError: false } as unknown as ReturnType<typeof useAdvisories>);
  vi.mocked(useConfirmExpertReferral).mockReturnValue(referralMutationResult() as unknown as ReturnType<typeof useConfirmExpertReferral>);
  vi.mocked(useIssueConsultInvite).mockReturnValue(referralMutationResult({ mutateAsync: vi.fn().mockResolvedValue({ url: "https://example.test/secure-consult-link" }) }) as unknown as ReturnType<typeof useIssueConsultInvite>);
  vi.mocked(useExpertDirectory).mockReturnValue({ data: [], isError: false } as unknown as ReturnType<typeof useExpertDirectory>);
  vi.mocked(useFieldReporters).mockReturnValue({ data: [], isError: false } as unknown as ReturnType<typeof useFieldReporters>);
  vi.mocked(usePossibleRecentMatches).mockReturnValue(possibleMatchesResult());
  vi.mocked(useRecordExpertReferralResponse).mockReturnValue(referralMutationResult() as unknown as ReturnType<typeof useRecordExpertReferralResponse>);
  vi.mocked(useRevokeConsultInvite).mockReturnValue(referralMutationResult() as unknown as ReturnType<typeof useRevokeConsultInvite>);
  vi.mocked(useRecordReportReferral).mockReturnValue(referralMutationResult());
  vi.mocked(useReport).mockReturnValue(queryResult());
  vi.mocked(useReports).mockReturnValue(reportsListResult());
  vi.mocked(useLinkDuplicateReport).mockReturnValue(duplicateMutationResult());
  vi.mocked(useUnlinkDuplicateReport).mockReturnValue(duplicateUnlinkMutationResult());
  vi.mocked(useUpdateReportReview).mockReturnValue(mutationResult());
});

describe("CaseReviewPage", () => {
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

    await user.click(screen.getByRole("radio", { name: /Provide advisory/ }));
    await user.click(screen.getByRole("button", { name: "Record office decision" }));

    const modal = screen.getByRole("dialog", { name: "Record office decision" });
    const advisorySelect = within(modal).getByLabelText("Office advisory (optional)");
    expect(within(advisorySelect).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "No advisory selected",
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
    expect(screen.queryByText(report.modelVersion!)).not.toBeInTheDocument();
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
    expect(screen.getByText("The reporter said the Possible Condition does not match what they observed")).toBeInTheDocument();
    const caseStatus = screen.getByRole("region", {
      name: "Case status",
    });
    expect(caseStatus).toHaveTextContent("Work status");
    expect(caseStatus).toHaveTextContent("Needs review");
    expect(caseStatus).toHaveTextContent("Case");
    expect(caseStatus).toHaveTextContent("Open");
    expect(caseStatus).toHaveTextContent("Field validation");
    expect(caseStatus).toHaveTextContent("Unassigned");
    expect(caseStatus).toHaveTextContent("Referral");
    expect(caseStatus).toHaveTextContent("Not referred");
    expect(caseStatus).toHaveTextContent("Verification");
    expect(caseStatus).toHaveTextContent("Not determined");
    expect(caseStatus).toHaveTextContent("Last activity");
    expect(screen.getByText(/^Work status/)).toHaveClass("status-chip__label");
    expect(screen.getByText(/Dark whip-like growths/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Record office decision" }));
    expect(screen.getByText(/Staff-Classified Condition is a separate human finding/)).toBeInTheDocument();
    expect(screen.getByLabelText("Staff-Classified Condition")).toHaveValue("");
    expect(screen.getByText("Sugarcane Smut")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Observed at")).toBeInTheDocument();
    expect(screen.getByText("Submitted at")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Completed field validation" }),
    ).not.toBeInTheDocument();

    // The Possible Condition leads the review with a decision-support
    // disclaimer; confidence stays out of the normal workflow.
    const possibleCondition = screen.getByRole("region", { name: "Possible Condition" });
    expect(possibleCondition).toBeVisible();
    expect(possibleCondition).toHaveTextContent("Possible Condition: Rust");
    expect(screen.getByText(/AI-assisted result\./)).toBeInTheDocument();
    expect(screen.queryByText("93%")).not.toBeInTheDocument();
    expect(screen.queryByText("Decision-support only.")).not.toBeInTheDocument();

    // Reading order: photo, Possible Condition, field report, office decision.
    const photoHeading = screen.getByRole("heading", { name: "Submitted photo" });
    const conditionHeading = screen.getByRole("heading", { name: "Possible Condition" });
    const fieldReportHeading = screen.getByRole("heading", { name: "Field report" });
    const officeDecisionHeading = screen.getByRole("heading", { name: "Office decision" });
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
    expect(screen.getByText("Location not available — offline no map")).toBeInTheDocument();
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
      screen.getByText(/Reporter-observed evidence only\. The AI result does not cover RSSI/),
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
      screen.getByText("Possible Condition agreement was not collected for this report."),
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
      screen.getByText("The reporter said the Possible Condition matches what they observed."),
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

    expect(screen.getByText("Possible Condition: Smut")).toBeVisible();
    await user.click(screen.getByRole("radio", { name: /Provide advisory/ }));
    await user.click(screen.getByRole("button", { name: "Record office decision" }));
    const modal = screen.getByRole("dialog", { name: "Record office decision" });
    await user.selectOptions(within(modal).getByLabelText("Staff-Classified Condition"), "smut");
    await user.type(within(modal).getByLabelText(/^Review notes/), "Authority confirmed Smut.");
    await user.click(within(modal).getByRole("button", { name: "Save decision" }));

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      authorityClassifiedCondition: "smut",
      expectedVersion: smutReport.reviewVersion,
    }));
  });

  it("offers every active Staff-Classified Condition but not legacy Downy mildew", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Record office decision" }));
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

    await user.click(screen.getByRole("radio", { name: /Provide advisory/ }));
    await user.click(screen.getByRole("button", { name: "Record office decision" }));
    const modal = screen.getByRole("dialog", { name: "Record office decision" });
    const select = within(modal).getByLabelText("Staff-Classified Condition");
    expect(select).toHaveValue("downy_mildew");
    expect(
      within(select).getByRole("option", {
        name: /Downy mildew \(legacy record; not offered for new review\)/,
      }),
    ).toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "Save decision" }));

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
      screen.getByRole("group", { name: "Next action - choose one" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("No office action selected")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Record office decision" }));
    const modal = screen.getByRole("dialog", { name: "Record office decision" });
    expect(within(modal).getByLabelText("Verification outcome")).toHaveValue("");
  });

  it("makes the existing review notes field explicit for intervention details", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Record office decision" }));
    const modal = screen.getByRole("dialog", { name: "Record office decision" });

    expect(within(modal).getByRole("note")).toHaveTextContent(
      /Record intervention or action details.*treatment, pesticide, medicine, technical assistance, or other action/i,
    );
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

    await user.click(screen.getByRole("radio", { name: /Needs field validation/ }));
    await user.click(screen.getByRole("button", { name: "Assign visit" }));
    const modal = screen.getByRole("dialog", { name: "Assign visit" });
    await user.click(within(modal).getByRole("button", { name: "Assign visit" }));

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

    await user.click(screen.getByRole("radio", { name: /Needs field validation/ }));
    await user.click(screen.getByRole("button", { name: "Assign visit" }));
    const modal = screen.getByRole("dialog", { name: "Assign visit" });
    await user.selectOptions(
      within(modal).getByLabelText("Field Inspector assignee"),
      report.submitterUuid!,
    );
    expect(within(modal).getByText(/original submitter is also the field validator/i)).toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "Assign visit" }));

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      actionTaken: undefined,
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

    await user.click(screen.getByRole("button", { name: "Record office decision" }));
    const modal = screen.getByRole("dialog", { name: "Record office decision" });

    await user.selectOptions(
      within(modal).getByLabelText("Verification outcome"),
      "unable_to_verify",
    );
    await user.click(
      within(modal).getByRole("button", { name: "Save decision" }),
    );

    expect(
      screen.getAllByText(/Add a note explaining why/i).length,
    ).toBeGreaterThan(0);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("keeps decision validation inside the modal and prefixes document title on failure", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn();
    vi.mocked(useUpdateReportReview).mockReturnValue(
      mutationResult({ mutateAsync }),
    );
    renderPage();

    await user.click(screen.getByRole("button", { name: "Record office decision" }));
    const modal = screen.getByRole("dialog", { name: "Record office decision" });
    await user.click(within(modal).getByRole("button", { name: "Save decision" }));

    // The modal stays open with the inline validation message; nothing is sent.
    expect(
      within(modal).getByText(/Choose a next action or another review field/i),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Record office decision" })).toBeInTheDocument();
    expect(document.title).toMatch(/^Error: /);
  });

  it("saves with the loaded version and returns only after success", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(report);
    vi.mocked(useUpdateReportReview).mockReturnValue(
      mutationResult({ mutateAsync }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole("radio", { name: /Provide advisory/ }),
    );
    await user.click(
      screen.getByRole("button", { name: "Record office decision" }),
    );
    const modal = screen.getByRole("dialog", { name: "Record office decision" });
    await user.selectOptions(
      within(modal).getByLabelText("Staff-Classified Condition"),
      "smut",
    );
    await user.type(
      within(modal).getByLabelText(/^Review notes/),
      "Field evidence reviewed.",
    );
    await user.click(
      within(modal).getByRole("button", { name: "Save decision" }),
    );

    expect(mutateAsync).toHaveBeenCalledWith({
      notes: "Field evidence reviewed.",
      authorityClassifiedCondition: "smut",
      verificationOutcome: undefined,
      actionTaken: "advisory_provided",
      caseState: undefined,
      expectedVersion: report.reviewVersion,
    });
    expect(
      await screen.findByText("Returned to report queue"),
    ).toBeInTheDocument();
  });

  it("shows field validation and stale-review conflicts distinctly", async () => {
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
    expect(screen.getByText("The notes field is required.")).toBeInTheDocument();

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
    expect(screen.getByText(/changed after you opened it/i)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Refresh report" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("prevents a duplicate save while a review is pending", () => {
    vi.mocked(useUpdateReportReview).mockReturnValue(
      mutationResult({ isPending: true }),
    );
    renderPage();

    expect(
      screen.getByRole("button", { name: "Saving review..." }),
    ).toBeDisabled();
  });

  it("keeps an over-long note inside the decision modal without saving", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn();
    vi.mocked(useUpdateReportReview).mockReturnValue(
      mutationResult({ mutateAsync }),
    );
    renderPage();

    await user.click(screen.getByRole("radio", { name: /Provide advisory/ }));
    await user.click(screen.getByRole("button", { name: "Record office decision" }));
    const modal = screen.getByRole("dialog", { name: "Record office decision" });
    // One change event (not per-keystroke typing) keeps the 1,001-char
    // draft fast under test; the component sees the same final value.
    fireEvent.change(within(modal).getByLabelText(/^Review notes/), {
      target: { value: "x".repeat(1001) },
    });
    await user.click(within(modal).getByRole("button", { name: "Save decision" }));

    // The modal stays open with the existing note-length error inside it.
    expect(
      within(modal).getByText(/Review notes must be 1,000 characters or fewer/i),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Record office decision" })).toBeInTheDocument();
  });

  it("shows a stale-review conflict with refresh inside the decision modal", async () => {
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

    await user.click(screen.getByRole("radio", { name: /Provide advisory/ }));
    await user.click(screen.getByRole("button", { name: "Record office decision" }));
    const modal = screen.getByRole("dialog", { name: "Record office decision" });

    expect(
      within(modal).getByText(/changed after you opened it/i),
    ).toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "Refresh report" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("disables the decision modal submit and cancel while saving and sends one request", async () => {
    const user = userEvent.setup();
    const savePromise = new Promise(() => {});
    const mutateAsync = vi.fn().mockReturnValue(savePromise);
    vi.mocked(useUpdateReportReview).mockReturnValue(
      mutationResult({ mutateAsync }),
    );
    const { rerender } = renderPage();

    await user.click(screen.getByRole("radio", { name: /Provide advisory/ }));
    await user.click(screen.getByRole("button", { name: "Record office decision" }));
    const modal = screen.getByRole("dialog", { name: "Record office decision" });
    await user.click(within(modal).getByRole("button", { name: "Save decision" }));
    expect(mutateAsync).toHaveBeenCalledTimes(1);

    // While the save is in flight the modal controls lock.
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
    const pendingModal = screen.getByRole("dialog", { name: "Record office decision" });
    expect(within(pendingModal).getByRole("button", { name: "Saving decision..." })).toBeDisabled();
    expect(within(pendingModal).getByRole("button", { name: "Cancel" })).toBeDisabled();

    // A second click on the locked submit sends nothing more.
    await user.click(within(pendingModal).getByRole("button", { name: "Saving decision..." }));
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

  it("distinguishes rate-limited and malformed review responses", () => {
    vi.mocked(useUpdateReportReview).mockReturnValue(
      mutationResult({
        error: new ApiError("Slow down", { status: 429 }),
        isError: true,
      }),
    );
    const { rerender } = renderPage();
    expect(screen.getByText(/too many review attempts/i)).toBeInTheDocument();

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
      screen.getByText(/server returned an unexpected response/i),
    ).toBeInTheDocument();
  });

  it("continues an office decision for a new referral into the handoff instead of sending an incomplete review", async () => {
    const user = userEvent.setup();
    const reviewSave = vi.fn();
    const referralSave = vi.fn().mockResolvedValue(referredReport);
    vi.mocked(useUpdateReportReview).mockReturnValue(
      referralMutationResult({ mutateAsync: reviewSave }) as unknown as ReturnType<typeof useUpdateReportReview>,
    );
    vi.mocked(useRecordReportReferral).mockReturnValue(
      referralMutationResult({ mutateAsync: referralSave }),
    );
    renderPage();

    await user.click(screen.getByRole("radio", { name: /Refer to expert/ }));
    await user.click(screen.getByRole("button", { name: "Record office decision" }));
    const decision = screen.getByRole("dialog", { name: "Record office decision" });
    await user.type(within(decision).getByRole("textbox", { name: /Review notes/ }), "Please evaluate the field evidence.");
    await user.click(within(decision).getByRole("button", { name: "Continue to referral" }));

    expect(reviewSave).not.toHaveBeenCalled();
    const handoff = screen.getByRole("dialog", { name: "Request expert input" });
    await user.type(within(handoff).getByLabelText("Expert destination"), "Regional office");
    await user.type(within(handoff).getByLabelText("Referral date"), "2026-09-04");
    await user.type(within(handoff).getByLabelText("Invitee name"), "Dr. Expert");
    await user.type(within(handoff).getByLabelText("Invitee contact"), "expert@example.test");
    await user.click(within(handoff).getByRole("button", { name: "Request expert input" }));

    expect(referralSave).toHaveBeenCalledWith(expect.objectContaining({
      destination: "Regional office",
      officeNotes: "Please evaluate the field evidence.",
      expectedVersion: report.reviewVersion,
    }));
    expect(referralSave.mock.calls[0][0]).not.toHaveProperty("reference");
  });

  it("lets an office review save after a completed consult without silently creating a second referral", async () => {
    const user = userEvent.setup();
    const reviewSave = vi.fn().mockResolvedValue(referredReport);
    const referralSave = vi.fn();
    vi.mocked(useReport).mockReturnValue(queryResult({
      data: {
        ...reportAfterTerminalConsult("completed", "expert_response_received"),
        referral: {
          ...referredReport.referral!,
          status: "completed",
          consultReviewOutcome: "accepted",
        },
      },
    }));
    vi.mocked(useUpdateReportReview).mockReturnValue(
      referralMutationResult({ mutateAsync: reviewSave }) as unknown as ReturnType<typeof useUpdateReportReview>,
    );
    vi.mocked(useRecordReportReferral).mockReturnValue(referralMutationResult({ mutateAsync: referralSave }));
    renderPage();

    await user.click(screen.getByRole("button", { name: "Record office decision" }));
    const decision = screen.getByRole("dialog", { name: "Record office decision" });
    await user.type(within(decision).getByRole("textbox", { name: /Review notes/ }), "Decision after expert response.");
    await user.click(within(decision).getByRole("button", { name: "Save decision" }));

    expect(reviewSave).toHaveBeenCalledWith(expect.objectContaining({
      notes: "Decision after expert response.",
      actionTaken: undefined,
    }));
    expect(referralSave).not.toHaveBeenCalled();
  });

  it("records a referral through the guided next action", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue(referredReport);
    vi.mocked(useRecordReportReferral).mockReturnValue(
      referralMutationResult({ mutateAsync }),
    );
    renderPage();

    // Referral fields are revealed only for the Refer to expert choice.
    expect(screen.queryByRole("button", { name: "Request expert input" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Refer to expert/ }));
    await user.click(screen.getByRole("button", { name: "Request expert input" }));
    const modal = screen.getByRole("dialog", { name: "Request expert input" });
    await user.type(within(modal).getByLabelText("Expert destination"), " Regional office ");
    await user.type(within(modal).getByLabelText("Expert office reference (optional)"), " SRA-2026-0042 ");
    await user.type(within(modal).getByLabelText("Referral date"), "2026-09-04");
    await user.type(within(modal).getByLabelText("Invitee name"), " Dr. External Expert ");
    await user.type(within(modal).getByLabelText("Invitee contact"), "expert@example.test");
    await user.type(within(modal).getByLabelText(/Referral note \(optional\)/), " Review the mismatch. ");
    await user.click(within(modal).getByRole("button", { name: "Request expert input" }));

    // One save request through the existing atomic referral endpoint, carrying
    // the visible office classification, verification, and notes snapshot.
    expect(mutateAsync).toHaveBeenCalledWith({
      destination: " Regional office ",
      reference: "SRA-2026-0042",
      referralDate: "2026-09-04",
      expertName: " Dr. External Expert ",
      expertContact: "expert@example.test",
      note: " Review the mismatch. ",
      authorityClassifiedCondition: null,
      verificationOutcome: undefined,
      officeNotes: "",
      expectedVersion: report.reviewVersion,
    });
    expect(await within(modal).findByDisplayValue("https://example.test/secure-consult-link")).toBeInTheDocument();
    expect(within(modal).getByText(/Awaiting expert input/)).toBeInTheDocument();
    expect(within(modal).queryByRole("button", { name: "Request expert input" })).not.toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "Done" }));
    expect(await screen.findByText("Returned to report queue")).toBeInTheDocument();
  });

  it("records an expert referral without an external reference", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue(referredReport);
    vi.mocked(useRecordReportReferral).mockReturnValue(
      referralMutationResult({ mutateAsync }),
    );
    renderPage();

    await user.click(screen.getByRole("radio", { name: /Refer to expert/ }));
    await user.click(screen.getByRole("button", { name: "Request expert input" }));
    const modal = screen.getByRole("dialog", { name: "Request expert input" });
    expect(within(modal).getByText(/add it when the expert responds/i)).toBeInTheDocument();
    await user.type(within(modal).getByLabelText("Expert destination"), "Regional office");
    await user.type(within(modal).getByLabelText("Referral date"), "2026-09-04");
    await user.type(within(modal).getByLabelText("Invitee name"), "Dr. External Expert");
    await user.type(within(modal).getByLabelText("Invitee contact"), "expert@example.test");
    await user.click(within(modal).getByRole("button", { name: "Request expert input" }));

    expect(mutateAsync.mock.calls[0]?.[0]).not.toHaveProperty("reference");
    expect(await within(modal).findByDisplayValue("https://example.test/secure-consult-link")).toBeInTheDocument();
  });

  it("keeps a saved outsider request pending when link issuance fails and retries without duplicating the consult", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(referredReport);
    const issue = vi.fn().mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce({ url: "https://example.test/retried-link" });
    vi.mocked(useRecordReportReferral).mockReturnValue(referralMutationResult({ mutateAsync: save }));
    vi.mocked(useIssueConsultInvite).mockReturnValue(referralMutationResult({ mutateAsync: issue }) as unknown as ReturnType<typeof useIssueConsultInvite>);
    renderPage();

    await user.click(screen.getByRole("radio", { name: /Refer to expert/ }));
    await user.click(screen.getByRole("button", { name: "Request expert input" }));
    const modal = screen.getByRole("dialog", { name: "Request expert input" });
    await user.type(within(modal).getByLabelText("Expert destination"), "Regional office");
    await user.type(within(modal).getByLabelText("Referral date"), "2026-09-04");
    await user.type(within(modal).getByLabelText("Invitee name"), "Dr. Expert");
    await user.click(within(modal).getByRole("button", { name: "Request expert input" }));
    expect(within(modal).getByText("Add a contact for the invitee.")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    await user.type(within(modal).getByLabelText("Invitee contact"), "expert@example.test");
    await user.click(within(modal).getByRole("button", { name: "Request expert input" }));
    expect(await within(modal).findByRole("button", { name: "Retry secure link" })).toBeInTheDocument();
    expect(within(modal).getByText(/request was saved, but the secure link could not be created/i)).toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "Retry secure link" }));
    expect(await within(modal).findByDisplayValue("https://example.test/retried-link")).toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(1);
    expect(issue).toHaveBeenCalledTimes(2);
  });

  it("shows the tracking code and a placeholder when the referral has no external reference", () => {
    const referral = {
      ...referredReport.referral!,
      reference: null,
      trackingCode: "CG-20260924-00000001",
    };
    vi.mocked(useReport).mockReturnValue(queryResult({
      data: { ...referredReport, referral },
    }));

    renderPage();

    expect(screen.getAllByText("CG-20260924-00000001").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not provided yet").length).toBeGreaterThan(0);
  });

  it("assigns an in-system expert from the directory", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue(referredReport);
    vi.mocked(useExpertDirectory).mockReturnValue({
      data: [{ uuid: "expert-uuid", name: "Dr. Ada Expert", email: "ada@example.test" }],
      isError: false,
    } as unknown as ReturnType<typeof useExpertDirectory>);
    vi.mocked(useRecordReportReferral).mockReturnValue(
      referralMutationResult({ mutateAsync }),
    );
    renderPage();

    await user.click(screen.getByRole("radio", { name: /Refer to expert/ }));
    await user.click(screen.getByRole("button", { name: "Request expert input" }));
    const expertModal = screen.getByRole("dialog", { name: "Request expert input" });
    await user.type(within(expertModal).getByLabelText("Expert destination"), " Regional office ");
    await user.type(within(expertModal).getByLabelText("Expert office reference (optional)"), " SRA-2026-0042 ");
    await user.type(within(expertModal).getByLabelText("Referral date"), "2026-09-04");
    await user.selectOptions(within(expertModal).getByLabelText("Expert from directory"), "expert-uuid");
    expect(within(expertModal).queryByLabelText("Invitee name")).not.toBeInTheDocument();
    await user.click(within(expertModal).getByRole("button", { name: "Request expert input" }));

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      expertUuid: "expert-uuid",
      expectedVersion: report.reviewVersion,
    }));
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty("expertName");
    expect(vi.mocked(useIssueConsultInvite).mock.results.at(-1)?.value.mutateAsync).not.toHaveBeenCalled();
    expect(await screen.findByText("Returned to report queue")).toBeInTheDocument();
  });

  it.each([
    ["completed", "expert_response_received"],
    ["cancelled", "not_referred"],
  ] as const)("shows referral fields again after a %s consult", async (status, referralState) => {
    const user = userEvent.setup();
    vi.mocked(useReport).mockReturnValue(
      queryResult({
        data: reportAfterTerminalConsult(status, referralState),
      }),
    );
    renderPage();

    // A terminal consult leaves no active handoff, so the guided choice is
    // pre-selected and the referral modal carries the fields again.
    expect(screen.getByRole("radio", { name: /Refer to expert/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Request expert input" }));
    const modal = screen.getByRole("dialog", { name: "Request expert input" });
    expect(within(modal).getByLabelText("Expert destination")).toBeInTheDocument();
    expect(within(modal).getByLabelText("Expert office reference (optional)")).toBeInTheDocument();
    expect(within(modal).getByLabelText("Referral date")).toBeInTheDocument();
  });

  it("closes the expert response modal on success and returns focus to its opener", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({
      ...referredReport,
      lifecycle: {
        ...referredReport.lifecycle!,
        referralState: "expert_response_received",
      },
    });
    vi.mocked(useReport).mockReturnValue(queryResult({ data: referredReport }));
    vi.mocked(useRecordExpertReferralResponse).mockReturnValue(
      referralMutationResult({ mutateAsync }) as unknown as ReturnType<typeof useRecordExpertReferralResponse>,
    );
    renderPage();

    const opener = screen.getByRole("button", { name: "Record expert response" });
    await user.click(opener);
    const modal = screen.getByRole("dialog", { name: "Record expert response" });
    await user.type(within(modal).getByLabelText("Expert response date"), "2026-09-08");
    await user.type(within(modal).getByLabelText("Expert response note"), " Response received. ");
    await user.click(within(modal).getByRole("button", { name: "Record expert response" }));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Review the updated Staff-Classified Condition/i)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Record expert response" })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(opener);
  });

  it("exposes the decision summary with next action, classification, verification, and last change", async () => {
    const user = userEvent.setup();
    renderPage();

    const summary = screen.getByRole("region", { name: "Office decision" });
    expect(within(summary).getByText("Pending decision")).toBeInTheDocument();
    expect(within(summary).getByText("Not classified")).toBeInTheDocument();
    expect(within(summary).getByText("Not determined")).toBeInTheDocument();
    expect(within(summary).getByText("Not yet reviewed")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Provide advisory/ }));
    expect(within(summary).getByText("Provide advisory")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Record office decision" }));
    const modal = screen.getByRole("dialog", { name: "Record office decision" });
    await user.selectOptions(within(modal).getByLabelText("Staff-Classified Condition"), "smut");
    await user.selectOptions(within(modal).getByLabelText("Verification outcome"), "verified");

    // The read-only summary tracks the modal draft while it stays open.
    expect(within(summary).getByText("Sugarcane Smut")).toBeInTheDocument();
    expect(within(summary).getByText("Verified")).toBeInTheDocument();
  });

  it("requires an explicit office decision before saving a completed expert proposal", async () => {
    const user = userEvent.setup();
    const completedProposal = {
      ...reportAfterTerminalConsult("completed", "expert_response_received"),
      referral: {
        ...reportAfterTerminalConsult("completed", "expert_response_received").referral!,
        conditionOpinion: "smut" as const,
        findingDetails: "The evidence supports smut.",
        findingConfidence: "high" as const,
        findingRecommendation: "Inspect adjacent rows.",
      },
    };
    const mutateAsync = vi.fn().mockResolvedValue(completedProposal);
    vi.mocked(useReport).mockReturnValue(queryResult({ data: completedProposal }));
    vi.mocked(useConfirmExpertReferral).mockReturnValue(
      referralMutationResult({ mutateAsync }) as unknown as ReturnType<typeof useConfirmExpertReferral>,
    );
    renderPage();

    await user.click(screen.getByRole("radio", { name: /Provide advisory/ }));
    expect(screen.getByRole("button", { name: "Record office decision" })).toBeDisabled();
    expect(screen.getByText(/Accept or override the completed expert proposal/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Accept proposal" }));
    expect(mutateAsync).toHaveBeenCalledWith({
      consultReviewOutcome: "accepted",
      expectedVersion: completedProposal.reviewVersion,
    });
  });

  it("records an expert response without closing the case", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({
      ...referredReport,
      lifecycle: {
        ...referredReport.lifecycle!,
        referralState: "expert_response_received",
      },
    });
    vi.mocked(useReport).mockReturnValue(queryResult({
      data: {
        ...referredReport,
        referral: { ...referredReport.referral!, reference: null },
      },
    }));
    vi.mocked(useRecordExpertReferralResponse).mockReturnValue(
      referralMutationResult({ mutateAsync }) as unknown as ReturnType<typeof useRecordExpertReferralResponse>,
    );
    renderPage();

    expect(screen.getAllByText("Awaiting expert input").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Record expert response" }));
    const modal = screen.getByRole("dialog", { name: "Record expert response" });
    await user.type(within(modal).getByLabelText("Expert response date"), "2026-09-08");
    await user.type(within(modal).getByLabelText("Expert office reference (optional)"), " SRA-2026-RESPONSE-0042 ");
    await user.type(within(modal).getByLabelText("Expert response note"), " Response received. ");
    await user.type(within(modal).getByLabelText("Expert finding (optional)"), " Finding recorded. ");
    await user.selectOptions(within(modal).getByLabelText("Staff-Classified Condition after response"), "smut");
    await user.selectOptions(within(modal).getByLabelText("Verification outcome after response"), "verified");
    await user.click(within(modal).getByRole("button", { name: "Record expert response" }));

    expect(mutateAsync).toHaveBeenCalledWith({
      responseDate: "2026-09-08",
      reference: "SRA-2026-RESPONSE-0042",
      responseNote: " Response received. ",
      responseFinding: " Finding recorded. ",
      authorityClassifiedCondition: "smut",
      verificationOutcome: "verified",
      expectedVersion: referredReport.reviewVersion,
    });
    expect(screen.getByText(/Review the updated Staff-Classified Condition/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Print \/ download referral summary/i }),
    ).toHaveAttribute(
      "href",
      `${env.apiBaseUrl}/api/v1/reports/${referredReport.uuid}/referral/summary`,
    );
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

  it("reveals assignment and referral fields only for their own next action", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByRole("button", { name: "Assign visit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request expert input" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Field Inspector assignee")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Expert destination")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Provide advisory/ }));
    expect(screen.queryByRole("button", { name: "Assign visit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request expert input" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Field Inspector assignee")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Expert destination")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Needs field validation/ }));
    expect(screen.getByRole("button", { name: "Assign visit" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request expert input" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Assign visit" }));
    const modal = screen.getByRole("dialog", { name: "Assign visit" });
    expect(within(modal).getByLabelText("Field Inspector assignee")).toBeInTheDocument();
    expect(within(modal).getByLabelText("Target visit date (optional)")).toBeInTheDocument();
    expect(within(modal).queryByLabelText("Expert destination")).not.toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "Cancel" }));
  });

  it("keeps duplicate linking and case information correction under More actions", async () => {
    const user = userEvent.setup();
    renderPage();

    const moreActions = screen.getByRole("region", { name: "More actions" });
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

    await user.click(screen.getByRole("radio", { name: /No further action/ }));
    const closeConfirmation = screen.getByRole("checkbox", { name: /Close this case/ });
    // D-02: the confirmation is checked by default so closure stays explicit
    // but still fits in one save.
    expect(closeConfirmation).toBeChecked();
    await user.click(closeConfirmation);
    expect(closeConfirmation).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Record office decision" }));
    const modal = screen.getByRole("dialog", { name: "Record office decision" });
    await user.click(within(modal).getByRole("button", { name: "Save decision" }));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        actionTaken: "no_further_action_required",
        caseState: undefined,
      }),
    );
  });

  it("closes the case when the No further action confirmation is left checked", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue(report);
    vi.mocked(useUpdateReportReview).mockReturnValue(mutationResult({ mutateAsync }));
    renderPage();

    await user.click(screen.getByRole("radio", { name: /No further action/ }));
    expect(screen.getByRole("checkbox", { name: /Close this case/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Record office decision" }));
    const modal = screen.getByRole("dialog", { name: "Record office decision" });
    await user.click(within(modal).getByRole("button", { name: "Save decision" }));

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

    const nextActionGroup = screen.getByRole("group", { name: "Next action - choose one" });
    expect(
      within(nextActionGroup).queryByRole("radio", { name: /Provide technical assistance/ }),
    ).not.toBeInTheDocument();

    const timeline = screen.getByRole("region", { name: "Case history" });
    expect(within(timeline).getByText("Technical assistance provided")).toBeInTheDocument();
    expect(within(timeline).getByText("Provided technical assistance to the field contact.")).toBeInTheDocument();
  });
});
