import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapReportDetail } from "../data/api/mappers/report.mapper";
import { reportDetailResponseSchema } from "../data/api/schemas/report.schema";
import { reportDetailDto } from "../test/fixtures";
import { useFieldReporters } from "../hooks/useFieldReporters";
import { useFieldSurveys } from "../hooks/fieldSurveys";
import {
  useAdvisories,
  useRecordHandoffNote,
  useLinkDuplicateReport,
  usePossibleRecentMatches,
  useReports,
  useUnlinkDuplicateReport,
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

vi.mock("../hooks/fieldSurveys", () => ({ useFieldSurveys: vi.fn() }));

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

function mockAffectedFieldHooks() {
  vi.mocked(useFieldSurveys).mockReturnValue({
    data: { type: "FeatureCollection", features: [], metadata: { totalCount: 0, returnedCount: 0, limit: 250, truncated: false } },
    error: null, isError: false, isPending: false, isFetching: false, isRefetchError: false, refetch: vi.fn(),
  } as unknown as ReturnType<typeof useFieldSurveys>);
  vi.mocked(useUpdateReportAffectedFields).mockReturnValue({
    error: null, isError: false, isPending: false, mutateAsync: vi.fn(), reset: vi.fn(),
  } as unknown as ReturnType<typeof useUpdateReportAffectedFields>);
}

describe("Evidence declutter density rules (Phase 1 / A1-A8)", () => {
  beforeEach(() => {
    mockAffectedFieldHooks();
    vi.mocked(useAdvisories).mockReturnValue({ data: [], isError: false } as unknown as ReturnType<typeof useAdvisories>);
    vi.mocked(useRecordHandoffNote).mockReturnValue({ mutateAsync: vi.fn(), isPending: false, isError: false } as unknown as ReturnType<typeof useRecordHandoffNote>);
    vi.mocked(useFieldReporters).mockReturnValue({ data: [], isError: false } as unknown as ReturnType<typeof useFieldReporters>);
    vi.mocked(usePossibleRecentMatches).mockReturnValue({
      data: { matches: [], message: "", possibleMatch: false, canSubmit: true },
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof usePossibleRecentMatches>);
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
    expect(within(possibleCondition).queryByText("93%")).not.toBeInTheDocument();
    expect(screen.getByText("93%")).not.toBeVisible();
  });

  it("keeps the Possible Condition visible with its badge", () => {
    renderPage();

    const possibleCondition = screen.getByRole("region", { name: "Possible Condition" });
    expect(possibleCondition).toBeVisible();
    expect(possibleCondition).toHaveTextContent("Rust");
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
    mockAffectedFieldHooks();
    vi.mocked(useAdvisories).mockReturnValue({ data: [], isError: false } as unknown as ReturnType<typeof useAdvisories>);
    vi.mocked(useFieldReporters).mockReturnValue({ data: [], isError: false } as unknown as ReturnType<typeof useFieldReporters>);
    vi.mocked(usePossibleRecentMatches).mockReturnValue({
      data: { matches: [], message: "", possibleMatch: false, canSubmit: true },
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof usePossibleRecentMatches>);
    vi.mocked(useLinkDuplicateReport).mockReturnValue({ mutateAsync: vi.fn(), reset: vi.fn() } as unknown as ReturnType<typeof useLinkDuplicateReport>);
    vi.mocked(useUnlinkDuplicateReport).mockReturnValue({ mutateAsync: vi.fn(), reset: vi.fn() } as unknown as ReturnType<typeof useUnlinkDuplicateReport>);
    vi.mocked(useUpdateReportReview).mockReturnValue({ mutateAsync: vi.fn(), reset: vi.fn() } as unknown as ReturnType<typeof useUpdateReportReview>);
  });

  it("exposes the case history filter as a pressed-state button group, not a tablist", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    const group = screen.getByRole("group", { name: "Filter case history" });
    const all = within(group).getByRole("button", { name: /^All \(/ });
    const review = within(group).getByRole("button", { name: /^Review \(/ });
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(review).toHaveAttribute("aria-pressed", "false");

    await user.click(review);

    expect(review).toHaveAttribute("aria-pressed", "true");
    expect(all).toHaveAttribute("aria-pressed", "false");
  });

  it("filters the history list with the pressed chip and restores it with All", async () => {
    const user = userEvent.setup();
    const report = {
      ...baseReport,
      caseHistory: {
        available: true,
        sources: { reviewEvents: true, corrections: true, assignments: true, consults: true },
        entries: [
          {
            id: "review-1",
            type: "review" as const,
            typeLabel: "Review",
            timestamp: "2026-09-03T02:00:00Z",
            actor: "Reviewer Alvarez",
            fields: [{ label: "Case state", value: "Under review" }],
            notes: null,
          },
          {
            id: "correction-1",
            type: "correction" as const,
            typeLabel: "Correction",
            timestamp: "2026-09-04T02:00:00Z",
            actor: "Clerk Bautista",
            fields: [{ label: "Field", value: "barangay" }],
            notes: null,
          },
        ],
      },
    };
    renderPage(report);

    const group = screen.getByRole("group", { name: "Filter case history" });
    expect(screen.getByText("Reviewer Alvarez")).toBeInTheDocument();
    expect(screen.getByText("Clerk Bautista")).toBeInTheDocument();

    await user.click(within(group).getByRole("button", { name: /^Correction \(/ }));

    expect(screen.getByText("Clerk Bautista")).toBeInTheDocument();
    expect(screen.queryByText("Reviewer Alvarez")).not.toBeInTheDocument();

    await user.click(within(group).getByRole("button", { name: /^All \(/ }));

    expect(screen.getByText("Reviewer Alvarez")).toBeInTheDocument();
    expect(screen.getByText("Clerk Bautista")).toBeInTheDocument();
  });

  it("retires the two-column split and reads evidence first: status, photo, condition, field report, office decision, history", () => {
    renderPage();

    expect(document.querySelector(".review-layout")).toBeNull();
    expect(document.querySelector(".review-sidebar")).toBeNull();
    expect(document.querySelector(".review-main")).toBeNull();

    const flow = document.querySelector(".review-single-column");
    expect(flow).toBeInTheDocument();

    const chips = screen.getByRole("region", { name: "Case status" });
    const photo = screen.getByRole("heading", { name: "Submitted photo" });
    const condition = screen.getByRole("heading", { name: "Possible Condition" });
    const fieldReport = screen.getByRole("heading", { name: "Observed symptoms" });
    const decision = screen.getByRole("heading", { name: "Choose Action" });
    const history = screen.getByRole("heading", { name: "Case history" });

    for (const heading of [photo, condition, fieldReport, decision]) {
      expect(flow!.contains(heading)).toBe(true);
    }
    // Reading order in the DOM matches visual order, and the decision comes
    // after the submitted evidence the reviewer has to acknowledge first.
    expect(chips.compareDocumentPosition(photo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(photo.compareDocumentPosition(condition) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(condition.compareDocumentPosition(fieldReport) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fieldReport.compareDocumentPosition(decision) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(decision.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

});
