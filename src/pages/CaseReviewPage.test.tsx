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
  useLinkDuplicateReport,
  usePossibleRecentMatches,
  useRecordExpertReferralResponse,
  useRecordReportReferral,
  useReport,
  useUpdateReportReview,
} from "../hooks/useReports";
import { CaseReviewPage } from "./CaseReviewPage";

vi.mock("../hooks/useReports", () => ({
  useLinkDuplicateReport: vi.fn(),
  usePossibleRecentMatches: vi.fn(),
  useRecordExpertReferralResponse: vi.fn(),
  useRecordReportReferral: vi.fn(),
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
  vi.mocked(useFieldReporters).mockReturnValue({ data: [], isError: false } as unknown as ReturnType<typeof useFieldReporters>);
  vi.mocked(usePossibleRecentMatches).mockReturnValue(possibleMatchesResult());
  vi.mocked(useRecordExpertReferralResponse).mockReturnValue(referralMutationResult() as unknown as ReturnType<typeof useRecordExpertReferralResponse>);
  vi.mocked(useRecordReportReferral).mockReturnValue(referralMutationResult());
  vi.mocked(useReport).mockReturnValue(queryResult());
  vi.mocked(useLinkDuplicateReport).mockReturnValue(duplicateMutationResult());
  vi.mocked(useUpdateReportReview).mockReturnValue(mutationResult());
});

describe("CaseReviewPage", () => {
  it("renders the real evidence, model, observation, and review detail", async () => {
    const user = userEvent.setup();
    renderPage();

    const image = screen.getByRole("img", {
      name: `Submitted sugarcane evidence for ${report.referenceCode}`,
    });
    expect(image).toHaveAttribute("src", report.imageUrl);
    const technicalEvidence = screen.getByText("Technical Evidence").closest("details");
    expect(technicalEvidence).not.toHaveAttribute("open");
    expect(within(technicalEvidence!).getByText(report.modelVersion!)).toBeInTheDocument();
    expect(screen.getByText("Checklist consistency")).toBeInTheDocument();
    expect(screen.getByText("Juan Dela Cruz")).toBeInTheDocument();
    expect(screen.getByText("Negros Occidental")).toBeInTheDocument();
    expect(screen.getByText("Bago")).toBeInTheDocument();
    expect(screen.getByText("10.1234567, 122.9876543")).toBeInTheDocument();
    expect(screen.getByText("GPS")).toBeInTheDocument();
    expect(screen.getByText("4.25 m")).toBeInTheDocument();
    expect(screen.getByText("PSR 86")).toBeInTheDocument();
    expect(screen.getByText("6 months")).toBeInTheDocument();
    expect(screen.getByText("12.5 ha")).toBeInTheDocument();
    expect(screen.getByText("42.75%")).toBeInTheDocument();
    expect(
      screen.getByText("Rust symptoms concentrated on the eastern edge."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No image quality warnings were reported."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Staff-Classified Condition is a separate human finding/)).toBeInTheDocument();
    expect(screen.getByText("Symptom agreement")).toBeInTheDocument();
    expect(screen.getByText("Checklist responses: Consistent with the Possible Condition")).toBeInTheDocument();
    expect(
      screen.getByText("Reporter observation: Possible Condition reported as not matching"),
    ).toBeInTheDocument();
    expect(screen.getByText("Reporter flagged AI mismatch")).toBeInTheDocument();
    const reviewSummary = screen.getByRole("region", {
      name: "Review evidence, choose a next action, then save",
    });
    expect(reviewSummary).toHaveTextContent("Case state");
    expect(screen.getByText("Work status")).toHaveClass("review-summary__label");
    expect(reviewSummary.querySelector(".status-badge")).not.toHaveClass("review-summary__label");
    expect(screen.getByText("Sugarcane Smut")).toBeInTheDocument();
    expect(screen.getByText(/Dark whip-like growths/)).toBeInTheDocument();
    expect(screen.getByLabelText("Staff-Classified Condition")).toHaveValue("");
    expect(screen.getByText("Observed at")).toBeInTheDocument();
    expect(screen.getByText("Submitted at")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Completed field validation" }),
    ).not.toBeInTheDocument();

    // D-01: the submitted Possible Condition label and confidence stay behind a
    // closed disclosure so they never lead the initial review.
    const submittedAiEvidence = screen
      .getByText("Possible Condition and confidence")
      .closest("details");
    expect(submittedAiEvidence).not.toHaveAttribute("open");
    expect(
      within(submittedAiEvidence!).getByRole("region", { name: "Possible Condition" }),
    ).not.toBeVisible();

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
        name: `Submitted sugarcane evidence for ${report.referenceCode}`,
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByText("Possible Condition and confidence"));
    expect(submittedAiEvidence).toHaveAttribute("open");
    expect(screen.getByRole("region", { name: "Possible Condition" })).toHaveTextContent(
      "Possible Condition",
    );
    expect(screen.getByText("Decision-support only.")).toBeInTheDocument();
    expect(screen.getAllByText("93%").length).toBeGreaterThan(0);

    await user.click(screen.getByText("Technical Evidence"));
    expect(technicalEvidence).toHaveAttribute("open");
    expect(within(technicalEvidence!).getByText(report.modelVersion!)).toBeInTheDocument();
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

    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getByText("Unavailable — offline no map")).toBeInTheDocument();
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
      screen.getByText(/Reporter-observed evidence only\. The current Model V1 does not detect RSSI/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Reporter observation: RSSI field concern reported (not AI-detected)"),
    ).toBeInTheDocument();
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
    expect(
      within(evidence).getByText(/read-only here and does not verify or close the case/i),
    ).toBeInTheDocument();
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

    expect(screen.getByText("Possible Condition: Smut")).not.toBeVisible();
    await user.click(screen.getByText("Possible Condition and confidence"));
    expect(screen.getByText("Possible Condition: Smut")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Staff-Classified Condition"), "smut");
    await user.type(screen.getByLabelText(/^Review notes/), "Authority confirmed Smut.");
    await user.click(screen.getByRole("radio", { name: /Provide advisory/ }));
    await user.click(screen.getByRole("button", { name: "Save review" }));

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      authorityClassifiedCondition: "smut",
      expectedVersion: smutReport.reviewVersion,
    }));
  });

  it("offers every active Staff-Classified Condition but not legacy Downy mildew", () => {
    renderPage();

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

    const select = screen.getByLabelText("Staff-Classified Condition");
    expect(select).toHaveValue("downy_mildew");
    expect(
      within(select).getByRole("option", {
        name: /Downy mildew \(legacy record; not offered for new review\)/,
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Provide advisory/ }));
    await user.click(screen.getByRole("button", { name: "Save review" }));

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      authorityClassifiedCondition: "downy_mildew",
      expectedVersion: historicalReport.reviewVersion,
    }));
  });

  it("does not select a next action or verification outcome automatically", () => {
    renderPage();

    expect(
      screen
        .getAllByRole("radio")
        .every((radio) => !(radio as HTMLInputElement).checked),
    ).toBe(true);
    expect(screen.getByLabelText("Verification outcome")).toHaveValue("");
    expect(
      screen.getByRole("group", { name: "Next action - choose one" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("No office action selected")).not.toBeInTheDocument();
  });

  it("makes the existing review notes field explicit for intervention details", () => {
    renderPage();

    expect(screen.getByRole("note")).toHaveTextContent(
      /Record intervention or action details.*treatment, pesticide, medicine, technical assistance, or other action/i,
    );
    expect(screen.getByText(/Record treatment, pesticide, medicine, technical assistance, or other action details when applicable/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Review notes/)).toHaveAttribute(
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

    await user.click(screen.getByText("More actions"));
    expect(screen.getByText(/nothing is merged, deleted, or blocked automatically/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use as canonical" }));
    expect(screen.getByLabelText("Canonical case UUID")).toHaveValue("canonical-report");
    await user.type(
      screen.getByLabelText(/^Link reason \(optional\)/),
      " The cases may describe the same field observation. ",
    );
    await user.click(screen.getByRole("button", { name: "Link as possible duplicate" }));

    expect(mutateAsync).toHaveBeenCalledWith({
      canonicalReportUuid: "canonical-report",
      reason: "The cases may describe the same field observation.",
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

    await user.click(screen.getByText("More actions"));

    await user.click(screen.getByRole("button", { name: "Link as possible duplicate" }));

    expect(screen.getByText(/enter a canonical case UUID/i)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("shows the preserved relationship after a case is linked", async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByText("More actions"));

    expect(screen.getByText("Linked as a possible duplicate")).toBeInTheDocument();
    expect(screen.getByText(/Canonical case CG-2026-0002/)).toBeInTheDocument();
    expect(screen.getByText(/submitted record and its audit history remain preserved/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Link as possible duplicate" })).not.toBeInTheDocument();
  });

  it("requires a field reporter when field validation is selected", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn();
    vi.mocked(useUpdateReportReview).mockReturnValue(mutationResult({ mutateAsync }));
    renderPage();

    await user.click(screen.getByRole("radio", { name: /Needs field validation/ }));
    await user.click(screen.getByRole("button", { name: "Save review" }));

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
    await user.selectOptions(
      screen.getByLabelText("Field Inspector assignee"),
      report.submitterUuid!,
    );
    expect(screen.getByText(/original submitter is also the field validator/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save review" }));

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

    await user.selectOptions(
      screen.getByLabelText("Verification outcome"),
      "unable_to_verify",
    );
    await user.click(
      screen.getByRole("button", { name: "Save review" }),
    );

    expect(
      screen.getAllByText(/Add a note explaining why/i).length,
    ).toBeGreaterThan(0);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("renders GOV.UK error summary and prefixes document title on validation failure", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Save review" }));

    const errorSummary = screen.getByRole("alert", { name: "There is a problem" });
    expect(errorSummary).toBeInTheDocument();
    expect(
      within(errorSummary).getByRole("link", { name: /Choose a next action/i }),
    ).toHaveAttribute("href", "#review-next-action");
    expect(document.title).toMatch(/^Error: /);
  });

  it("saves with the loaded version and returns only after success", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(report);
    vi.mocked(useUpdateReportReview).mockReturnValue(
      mutationResult({ mutateAsync }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(
      screen.getByLabelText("Staff-Classified Condition"),
      "smut",
    );
    await user.type(
      screen.getByLabelText(/^Review notes/),
      "Field evidence reviewed.",
    );
    await user.click(
      screen.getByRole("radio", { name: /Provide advisory/ }),
    );
    await user.click(
      screen.getByRole("button", { name: "Save review" }),
    );

    expect(mutateAsync).toHaveBeenCalledWith({
      notes: "Field evidence reviewed.",
      authorityClassifiedCondition: "smut",
      verificationOutcome: undefined,
      actionTaken: "advisory_provided",
      fieldValidationState: "unassigned",
      fieldValidationAssigneeUuid: undefined,
      fieldValidationTargetDate: undefined,
      caseState: undefined,
      metadataCorrections: undefined,
      correctionReason: undefined,
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

  it("records a referral through the guided next action", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue(referredReport);
    vi.mocked(useRecordReportReferral).mockReturnValue(
      referralMutationResult({ mutateAsync }),
    );
    renderPage();

    // Referral fields are revealed only for the Refer to expert choice.
    expect(screen.queryByLabelText("Expert destination")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Refer to expert/ }));
    await user.type(screen.getByLabelText("Expert destination"), " Regional office ");
    await user.type(screen.getByLabelText("Referral reference"), " SRA-2026-0042 ");
    await user.type(screen.getByLabelText("Referral date"), "2026-09-04");
    await user.type(screen.getByLabelText(/Referral note \(optional\)/), " Review the mismatch. ");
    await user.click(screen.getByRole("button", { name: "Save referral" }));

    // One save request through the existing atomic referral endpoint, carrying
    // the visible office classification, verification, and notes snapshot.
    expect(mutateAsync).toHaveBeenCalledWith({
      destination: " Regional office ",
      reference: " SRA-2026-0042 ",
      referralDate: "2026-09-04",
      note: " Review the mismatch. ",
      authorityClassifiedCondition: null,
      verificationOutcome: undefined,
      officeNotes: "",
      expectedVersion: report.reviewVersion,
    });
    expect(
      await screen.findByText("Returned to report queue"),
    ).toBeInTheDocument();
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
    vi.mocked(useReport).mockReturnValue(queryResult({ data: referredReport }));
    vi.mocked(useRecordExpertReferralResponse).mockReturnValue(
      referralMutationResult({ mutateAsync }) as unknown as ReturnType<typeof useRecordExpertReferralResponse>,
    );
    renderPage();

    expect(screen.getAllByText("Awaiting expert input").length).toBeGreaterThan(0);
    await user.type(screen.getByLabelText("Expert response date"), "2026-09-08");
    await user.type(screen.getByLabelText("Expert response note"), " Response received. ");
    await user.type(screen.getByLabelText("Expert finding (optional)"), " Finding recorded. ");
    await user.selectOptions(screen.getByLabelText("Staff-Classified Condition after response"), "smut");
    await user.selectOptions(screen.getByLabelText("Verification outcome after response"), "verified");
    await user.click(screen.getByRole("button", { name: "Record expert response" }));

    expect(mutateAsync).toHaveBeenCalledWith({
      responseDate: "2026-09-08",
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

    expect(screen.queryByLabelText("Field Inspector assignee")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Expert destination")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Provide advisory/ }));
    expect(screen.queryByLabelText("Field Inspector assignee")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Expert destination")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Needs field validation/ }));
    expect(screen.getByLabelText("Field Inspector assignee")).toBeInTheDocument();
    expect(screen.getByLabelText("Target visit date (optional)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Expert destination")).not.toBeInTheDocument();
  });

  it("keeps duplicate linking and metadata correction under More actions", async () => {
    const user = userEvent.setup();
    renderPage();

    const moreActions = screen.getByText("More actions").closest("details");
    expect(moreActions).not.toHaveAttribute("open");
    expect(
      within(moreActions!).getByText("Possible duplicate linkage"),
    ).not.toBeVisible();
    expect(
      within(moreActions!).getByText("Correct operational metadata"),
    ).toBeInTheDocument();

    await user.click(screen.getByText("More actions"));
    expect(moreActions).toHaveAttribute("open");
    expect(within(moreActions!).getByText("Possible duplicate linkage")).toBeVisible();
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

    await user.click(screen.getByRole("button", { name: "Save review" }));
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
    await user.click(screen.getByRole("button", { name: "Save review" }));

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        actionTaken: "no_further_action_required",
        caseState: "closed",
      }),
    );
  });
});
