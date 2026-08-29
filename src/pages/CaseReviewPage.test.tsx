import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { ZodError } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/ApiError";
import { mapReportDetail } from "../data/api/mappers/report.mapper";
import { reportDetailResponseSchema } from "../data/api/schemas/report.schema";
import { reportDetailDto } from "../test/fixtures";
import { useFieldReporters } from "../hooks/useFieldReporters";
import {
  useLinkDuplicateReport,
  usePossibleRecentMatches,
  useReport,
  useUpdateReportReview,
} from "../hooks/useReports";
import { CaseReviewPage } from "./CaseReviewPage";

vi.mock("../hooks/useReports", () => ({
  useLinkDuplicateReport: vi.fn(),
  usePossibleRecentMatches: vi.fn(),
  useReport: vi.fn(),
  useUpdateReportReview: vi.fn(),
}));
vi.mock("../hooks/useFieldReporters", () => ({
  useFieldReporters: vi.fn(() => ({ data: [], isError: false })),
}));

const report = mapReportDetail(
  reportDetailResponseSchema.parse({ data: reportDetailDto }).data,
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
    expect(screen.getAllByText("93%").length).toBeGreaterThan(0);
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
    expect(screen.getByText("Decision-support only.")).toBeInTheDocument();
    expect(screen.getByText("Symptom agreement")).toBeInTheDocument();
    expect(screen.getByText("Checklist responses: Consistent with the possible AI result")).toBeInTheDocument();
    expect(screen.getByText("Reporter observation: Disagrees with the possible AI result")).toBeInTheDocument();
    expect(screen.getByText("Reporter flagged AI mismatch")).toBeInTheDocument();
    const reviewSummary = screen.getByRole("region", { name: "Choose the next safe action" });
    expect(reviewSummary).toHaveTextContent("Selected response");
    expect(screen.getByText("Current status")).toHaveClass("review-summary__label");
    expect(reviewSummary.querySelector(".status-badge")).not.toHaveClass("review-summary__label");
    expect(screen.getByText("Smut")).toBeInTheDocument();
    expect(screen.getByText(/Dark whip-like growths/)).toBeInTheDocument();
    expect(screen.getByLabelText("Authority classification")).toHaveValue("");
    expect(screen.getByText("Observed at")).toBeInTheDocument();
    expect(screen.getByText("Submitted at")).toBeInTheDocument();

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

    await user.click(screen.getByText("Technical Evidence"));
    expect(technicalEvidence).toHaveAttribute("open");
    expect(within(technicalEvidence!).getByText(report.modelVersion!)).toBeInTheDocument();
  });

  it("distinguishes an unasked mismatch state from an explicit no", () => {
    vi.mocked(useReport).mockReturnValue(
      queryResult({ data: { ...report, mismatchReported: null } }),
    );
    const { rerender } = renderPage();

    expect(
      screen.getByText("Mismatch status was not collected for this report."),
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
      screen.getByText("The reporter explicitly indicated no AI mismatch."),
    ).toBeInTheDocument();
  });

  it("does not select an office action or verification outcome automatically", () => {
    renderPage();

    expect(
      screen
        .getAllByRole("radio")
        .every((radio) => !(radio as HTMLInputElement).checked),
    ).toBe(true);
    expect(screen.getByLabelText("Verification outcome")).toHaveValue("");
    expect(screen.getByText("No office action selected")).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Link as possible duplicate" }));

    expect(screen.getByText(/enter a canonical case UUID/i)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
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

  it("requires a field reporter when field validation is selected", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn();
    vi.mocked(useUpdateReportReview).mockReturnValue(mutationResult({ mutateAsync }));
    renderPage();

    await user.selectOptions(screen.getByLabelText("Field validation"), "assigned");
    await user.click(screen.getByRole("button", { name: "Save explicit review" }));

    expect(screen.getByText(/Select a field reporter before saving/i)).toBeInTheDocument();
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

    await user.selectOptions(screen.getByLabelText("Field validation"), "assigned");
    await user.selectOptions(
      screen.getByLabelText("Field reporter assignee"),
      report.submitterUuid!,
    );
    expect(screen.getByText(/original submitter is also the field validator/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save explicit review" }));

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
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
      screen.getByRole("button", { name: "Save explicit review" }),
    );

    expect(
      screen.getByText(/Add a note explaining why/i),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("saves with the loaded version and returns only after success", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(report);
    vi.mocked(useUpdateReportReview).mockReturnValue(
      mutationResult({ mutateAsync }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(
      screen.getByLabelText("Authority classification"),
      "smut",
    );
    await user.type(
      screen.getByLabelText(/^Review notes/),
      "Field evidence reviewed.",
    );
    await user.click(
      screen.getByRole("radio", { name: /Advisory provided/ }),
    );
    await user.click(
      screen.getByRole("button", { name: "Save explicit review" }),
    );

    expect(mutateAsync).toHaveBeenCalledWith({
      notes: "Field evidence reviewed.",
      authorityClassifiedCondition: "smut",
      verificationOutcome: undefined,
      actionTaken: "advisory_provided",
      fieldValidationState: undefined,
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
});
