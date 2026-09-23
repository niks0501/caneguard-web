import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapReportDetail } from "../data/api/mappers/report.mapper";
import { reportDetailResponseSchema } from "../data/api/schemas/report.schema";
import { reportDetailDto } from "../test/fixtures";
import { useFieldReporters } from "../hooks/useFieldReporters";
import {
  useAdvisories,
  useConfirmExpertReferral,
  useExpertDirectory,
  useLinkDuplicateReport,
  usePossibleRecentMatches,
  useReports,
  useUnlinkDuplicateReport,
  useRecordExpertReferralResponse,
  useRecordReportReferral,
  useReport,
  useUpdateReportReview,
} from "../hooks/useReports";
import { CaseReviewPage } from "./CaseReviewPage";

vi.mock("../hooks/useReports", () => ({
  useAdvisories: vi.fn(),
  useConfirmExpertReferral: vi.fn(),
  useExpertDirectory: vi.fn(),
  useLinkDuplicateReport: vi.fn(),
  usePossibleRecentMatches: vi.fn(),
  useReports: vi.fn(),
  useUnlinkDuplicateReport: vi.fn(),
  useRecordExpertReferralResponse: vi.fn(),
  useRecordReportReferral: vi.fn(),
  useReport: vi.fn(),
  useUpdateReportReview: vi.fn(),
}));

vi.mock("../hooks/useFieldReporters", () => ({
  useFieldReporters: vi.fn(() => ({ data: [], isError: false })),
}));

const baseReport = mapReportDetail(
  reportDetailResponseSchema.parse({ data: reportDetailDto }).data,
);

function queryResult(reportData = baseReport) {
  return {
    data: reportData,
    error: null,
    isError: false,
    isPending: false,
    isRefetchError: false,
    isSuccess: true,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useReport>;
}

function renderPage(reportData = baseReport) {
  vi.mocked(useReport).mockReturnValue(queryResult(reportData));
  return render(
    <MemoryRouter initialEntries={[`/reports/${reportData.uuid}`]}>
      <Routes>
        <Route path="/reports/:reportId" element={<CaseReviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Evidence declutter density rules (Phase 1 / A1-A8)", () => {
  beforeEach(() => {
    vi.mocked(useAdvisories).mockReturnValue({ data: [], isError: false } as unknown as ReturnType<typeof useAdvisories>);
    vi.mocked(useFieldReporters).mockReturnValue({ data: [], isError: false } as unknown as ReturnType<typeof useFieldReporters>);
    vi.mocked(usePossibleRecentMatches).mockReturnValue({
      data: { matches: [], message: "", possibleMatch: false, canSubmit: true },
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof usePossibleRecentMatches>);
    vi.mocked(useRecordExpertReferralResponse).mockReturnValue({ mutateAsync: vi.fn(), reset: vi.fn() } as unknown as ReturnType<typeof useRecordExpertReferralResponse>);
    vi.mocked(useRecordReportReferral).mockReturnValue({ mutateAsync: vi.fn(), reset: vi.fn() } as unknown as ReturnType<typeof useRecordReportReferral>);
    vi.mocked(useConfirmExpertReferral).mockReturnValue({ mutateAsync: vi.fn(), reset: vi.fn() } as unknown as ReturnType<typeof useConfirmExpertReferral>);
    vi.mocked(useExpertDirectory).mockReturnValue({ data: [], isError: false } as unknown as ReturnType<typeof useExpertDirectory>);
    vi.mocked(useReports).mockReturnValue({ data: { reports: [], meta: { currentPage: 1, from: null, lastPage: 1, perPage: 8, to: null, total: 0 } }, error: null, isError: false, isPending: false, isFetching: false } as unknown as ReturnType<typeof useReports>);
    vi.mocked(useLinkDuplicateReport).mockReturnValue({ mutateAsync: vi.fn(), reset: vi.fn() } as unknown as ReturnType<typeof useLinkDuplicateReport>);
    vi.mocked(useUnlinkDuplicateReport).mockReturnValue({ mutateAsync: vi.fn(), reset: vi.fn() } as unknown as ReturnType<typeof useUnlinkDuplicateReport>);
    vi.mocked(useUpdateReportReview).mockReturnValue({ mutateAsync: vi.fn(), reset: vi.fn() } as unknown as ReturnType<typeof useUpdateReportReview>);
  });

  it("asserts that a report whose reporterObservationText exceeds 3 lines renders a Show full text control and full text is in DOM before and after toggle", async () => {
    const user = userEvent.setup();
    const longObservation =
      "First sentence is clearly stated and fully visible. Second sentence provides extended narrative explaining the symptom spread. Third sentence details that the farmer observed this over multiple cane rows and requested an inspection.";
    const reportWithLongText = {
      ...baseReport,
      reporterObservationText: longObservation,
    };

    renderPage(reportWithLongText);

    // Assert full text is present in the DOM before toggle
    expect(screen.getByText(longObservation)).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /Show full text/ });
    expect(toggle).toBeInTheDocument();

    // Click toggle to expand
    await user.click(toggle);

    // Assert toggle text switched to Show less and full text remains in DOM
    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
    expect(screen.getByText(longObservation)).toBeInTheDocument();
  });

  it("asserts that reporterObservationText of 'Not provided' never renders a clamp toggle", () => {
    const reportWithoutObservation = {
      ...baseReport,
      reporterObservationText: null,
    };

    renderPage(reportWithoutObservation);

    expect(screen.getAllByText("Not provided").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Show full text/ })).not.toBeInTheDocument();
  });

  it("shows the Possible Condition with a decision-support disclaimer and no prominent confidence", () => {
    renderPage();

    const possibleCondition = screen.getByRole("region", { name: "Possible Condition" });
    expect(possibleCondition).toBeVisible();
    expect(within(possibleCondition).getByText(/AI-assisted result\./)).toBeInTheDocument();
    expect(screen.queryByText("Technical Evidence")).not.toBeInTheDocument();
    expect(screen.queryByText("93%")).not.toBeInTheDocument();
  });

  it("keeps the Possible Condition visible with its badge", () => {
    renderPage();

    const possibleCondition = screen.getByRole("region", { name: "Possible Condition" });
    expect(possibleCondition).toBeVisible();
    expect(possibleCondition).toHaveTextContent("Possible Condition: Rust");
  });

  it("asserts that a farm list with more than 4 rows renders a Show remaining control and row count before expand + 1 == row count after expand", async () => {
    const user = userEvent.setup();
    // baseReport farm section: Farmer or farm owner, Farm reference, Location,
    // Reporter, Submitter role (5 rows).
    const reportWithFarmContext = {
      ...baseReport,
      submitterRole: "field_reporter" as const,
      farmerOrFarmOwnerName: "Juan Dela Cruz",
    };

    renderPage(reportWithFarmContext);

    const farmSection = screen.getByRole("heading", { name: "Farm and location" }).closest("section");
    expect(farmSection).toBeInTheDocument();

    const list = farmSection!.querySelector("dl");
    expect(list).toBeInTheDocument();

    // Query non-hidden detail fields before expand
    const fieldsBefore = list!.querySelectorAll(".detail-field:not([hidden])");
    expect(fieldsBefore.length).toBe(4);

    const toggle = within(farmSection!).getByRole("button", { name: /Show remaining 1 row/i });
    expect(toggle).toBeInTheDocument();

    await user.click(toggle);

    const fieldsAfter = list!.querySelectorAll(".detail-field:not([hidden])");
    expect(fieldsAfter.length).toBe(5);
    expect(fieldsBefore.length + 1).toBe(fieldsAfter.length);
  });
});

describe("Evidence declutter bottom unification (Phase 4 / C1-C6)", () => {
  beforeEach(() => {
    vi.mocked(useAdvisories).mockReturnValue({ data: [], isError: false } as unknown as ReturnType<typeof useAdvisories>);
    vi.mocked(useFieldReporters).mockReturnValue({ data: [], isError: false } as unknown as ReturnType<typeof useFieldReporters>);
    vi.mocked(usePossibleRecentMatches).mockReturnValue({
      data: { matches: [], message: "", possibleMatch: false, canSubmit: true },
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof usePossibleRecentMatches>);
    vi.mocked(useConfirmExpertReferral).mockReturnValue({ mutateAsync: vi.fn(), reset: vi.fn() } as unknown as ReturnType<typeof useConfirmExpertReferral>);
    vi.mocked(useExpertDirectory).mockReturnValue({ data: [], isError: false } as unknown as ReturnType<typeof useExpertDirectory>);
    vi.mocked(useRecordExpertReferralResponse).mockReturnValue({ mutateAsync: vi.fn(), reset: vi.fn() } as unknown as ReturnType<typeof useRecordExpertReferralResponse>);
    vi.mocked(useRecordReportReferral).mockReturnValue({ mutateAsync: vi.fn(), reset: vi.fn() } as unknown as ReturnType<typeof useRecordReportReferral>);
    vi.mocked(useLinkDuplicateReport).mockReturnValue({ mutateAsync: vi.fn(), reset: vi.fn() } as unknown as ReturnType<typeof useLinkDuplicateReport>);
    vi.mocked(useUnlinkDuplicateReport).mockReturnValue({ mutateAsync: vi.fn(), reset: vi.fn() } as unknown as ReturnType<typeof useUnlinkDuplicateReport>);
    vi.mocked(useUpdateReportReview).mockReturnValue({ mutateAsync: vi.fn(), reset: vi.fn() } as unknown as ReturnType<typeof useUpdateReportReview>);
  });

  it("retires the two-column split: no review-layout or review-sidebar remains and the flow reads hero, status, photo, condition, field report, office decision, history", () => {
    renderPage();

    expect(document.querySelector(".review-layout")).toBeNull();
    expect(document.querySelector(".review-sidebar")).toBeNull();
    expect(document.querySelector(".review-main")).toBeNull();

    const flow = document.querySelector(".review-single-column");
    expect(flow).toBeInTheDocument();

    const hero = screen.getByRole("heading", { name: "What this case needs from me" });
    const chips = screen.getByRole("region", { name: "Case status" });
    const photo = screen.getByRole("heading", { name: "Submitted photo" });
    const condition = screen.getByRole("heading", { name: "Possible Condition" });
    const fieldReport = screen.getByRole("heading", { name: "Field report" });
    const decision = screen.getByRole("heading", { name: "Office decision" });

    for (const heading of [photo, condition, fieldReport, decision]) {
      expect(flow!.contains(heading)).toBe(true);
    }
    // Reading order in the DOM matches visual order: hero, status, photo,
    // condition, field report, office decision.
    expect(hero.compareDocumentPosition(chips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chips.compareDocumentPosition(photo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(photo.compareDocumentPosition(condition) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(condition.compareDocumentPosition(fieldReport) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fieldReport.compareDocumentPosition(decision) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

});
