import { describe, expect, it } from "vitest";
import {
  parseReportListUrl,
  reportListPageSize,
} from "./reportListUrlState";

describe("parseReportListUrl", () => {
  it("maps canonical URL state to repository filters", () => {
    const state = parseReportListUrl(
      new URLSearchParams({
        page: "2",
        queue: "needs_review",
        search: "CG-2026",
        status: "submitted_unverified",
        predicted_label: "rust",
        barangay: "Mabini",
        date_from: "2026-07-01",
        date_to: "2026-07-27",
        sort: "oldest",
        case_state: "open",
        verification_outcome: "not_determined",
        field_validation_state: "assigned",
        authority_classified_condition: "rust",
        concern: "rssi",
      }),
    );

    expect(state).toEqual({
      filters: {
        page: 2,
        perPage: reportListPageSize,
        queue: "needs_review",
        search: "CG-2026",
        status: "submitted_unverified",
        disease: "rust",
        barangay: "Mabini",
        dateFrom: "2026-07-01",
        dateTo: "2026-07-27",
        caseState: "open",
        verificationOutcome: "not_determined",
        fieldValidationState: "assigned",
        staffClassifiedCondition: "rust",
        reportedConcern: "rssi",
        sort: "oldest",
      },
      hasActiveFilters: true,
      invalid: false,
    });
  });

  it("opens the unscoped reviewer queue on the due-soonest case", () => {
    expect(parseReportListUrl(new URLSearchParams()).filters.sort).toBe("due_soonest");
  });

  it("maps the one workflow status and the reviewer filter", () => {
    const state = parseReportListUrl(
      new URLSearchParams({ workflow_status: "needs_review", reviewer: "officer-1" }),
    );

    expect(state.filters.workflowStatus).toBe("needs_review");
    expect(state.filters.reviewer).toBe("officer-1");
    expect(state.hasActiveFilters).toBe(true);
    expect(state.invalid).toBe(false);
  });

  it.each([
    ["workflow_status=not_a_workflow_state"],
    [`reviewer=${"a".repeat(121)}`],
  ])("rejects an invalid reviewer-queue filter: %s", (query) => {
    expect(parseReportListUrl(new URLSearchParams(query)).invalid).toBe(true);
  });

  it("defaults the follow-up queue to the nearest due date", () => {
    expect(
      parseReportListUrl(new URLSearchParams("queue=follow_up_due")).filters.sort,
    ).toBe("due_soonest");
  });

  it("no longer accepts confidence sorting", () => {
    expect(
      parseReportListUrl(new URLSearchParams("sort=confidence_desc")).invalid,
    ).toBe(true);
  });

  it("accepts the V2 smut model label", () => {
    const state = parseReportListUrl(
      new URLSearchParams("predicted_label=smut"),
    );

    expect(state.filters.disease).toBe("smut");
    expect(state.invalid).toBe(false);
  });

  it.each([
    ["page=0"],
    ["page=not-a-number"],
    ["status=confirmed"],
    ["queue=not-a-queue"],
    ["date_from=2026-07-31&date_to=2026-07-01"],
    ["date_from=2026-02-30"],
    ["sort=random"],
  ])("rejects an invalid known query: %s", (query) => {
    expect(parseReportListUrl(new URLSearchParams(query)).invalid).toBe(true);
  });

  it("preserves spaces needed while editing text filters", () => {
    const state = parseReportListUrl(
      new URLSearchParams({
        search: "Ana ",
        barangay: "San Isidro",
      }),
    );

    expect(state.filters.search).toBe("Ana ");
    expect(state.filters.barangay).toBe("San Isidro");
  });

  it("accepts the reporter-concern saved view and rejects unknown concern values", () => {
    expect(parseReportListUrl(new URLSearchParams("concern=rssi")).filters.reportedConcern)
      .toBe("rssi");
    expect(parseReportListUrl(new URLSearchParams("concern=rust")).invalid).toBe(true);
  });

  it("validates the date-only calendar month in the shared URL grammar", () => {
    expect(parseReportListUrl(new URLSearchParams("calendar_month=2026-09")).calendarMonth)
      .toBe("2026-09");
    expect(parseReportListUrl(new URLSearchParams("calendar_month=2026-13")).invalid)
      .toBe(true);
  });
});
