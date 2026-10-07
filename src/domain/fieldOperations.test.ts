import { describe, expect, it } from "vitest";
import {
  compareFieldWorkloadItems,
  deriveReasonForVisit,
  fieldOperationSection,
  groupFieldWorkloadByBarangay,
  groupFieldWorkloadBySection,
  hasUsableReportLocation,
  isActiveFieldWorkloadItem,
  mergeFieldWorkload,
  relativeVisitTiming,
  summarizeFieldWorkload,
  type FieldWorkloadItem,
} from "./fieldOperations";

const OFFICE_DATE = "2026-10-07";

function item(overrides: Partial<FieldWorkloadItem> & { uuid: string }): FieldWorkloadItem {
  return {
    referenceCode: `CG-${overrides.uuid}`,
    barangay: "Balaytigui",
    farmReference: null,
    municipality: "Nasugbu",
    province: "Batangas",
    predictedDisease: "rust",
    observedAt: "2026-10-01T02:00:00+08:00",
    submittedAt: "2026-10-01T03:00:00+08:00",
    reviewStatus: "for_field_validation",
    lifecycle: undefined,
    fieldValidationState: "assigned",
    targetVisitDate: null,
    assignee: null,
    finalLatitude: 14.126,
    finalLongitude: 120.6039,
    locationSource: "gps",
    caseState: "open",
    scheduledRevisit: false,
    followUpOutcome: null,
    ...overrides,
  };
}

const assignee = { uuid: "inspector-2", name: "Inspector Two" };

// FO-SECTION matrix from the approved fixture oracle.
const matrix: Array<{
  fixture: string;
  entry: FieldWorkloadItem;
  section: string;
  timing: string | null;
}> = [
  { fixture: "A", entry: item({ uuid: "A", targetVisitDate: "2026-10-04", assignee, fieldValidationState: "assigned" }), section: "overdue", timing: "3 days overdue" },
  { fixture: "B", entry: item({ uuid: "B", targetVisitDate: "2026-10-06", assignee: null, fieldValidationState: "unassigned" }), section: "overdue", timing: "1 day overdue" },
  { fixture: "C", entry: item({ uuid: "C", targetVisitDate: "2026-10-07", assignee: null, fieldValidationState: "unassigned" }), section: "unassigned", timing: "Due today" },
  { fixture: "D", entry: item({ uuid: "D", targetVisitDate: "2026-10-08", assignee: null, fieldValidationState: "unassigned" }), section: "unassigned", timing: "Due tomorrow" },
  { fixture: "E", entry: item({ uuid: "E", targetVisitDate: null, assignee: null, fieldValidationState: "unassigned" }), section: "unassigned", timing: null },
  { fixture: "F", entry: item({ uuid: "F", targetVisitDate: "2026-10-07", assignee, fieldValidationState: "assigned" }), section: "upcoming", timing: "Due today" },
  { fixture: "G", entry: item({ uuid: "G", targetVisitDate: "2026-10-08", assignee, fieldValidationState: "assigned" }), section: "upcoming", timing: "Due tomorrow" },
  { fixture: "H", entry: item({ uuid: "H", targetVisitDate: "2026-10-10", assignee, fieldValidationState: "assigned" }), section: "upcoming", timing: "In 3 days" },
  { fixture: "I", entry: item({ uuid: "I", targetVisitDate: null, assignee, fieldValidationState: "assigned" }), section: "upcoming", timing: null },
  { fixture: "J", entry: item({ uuid: "J", targetVisitDate: null, assignee, fieldValidationState: "in_progress" }), section: "upcoming", timing: null },
];

describe("fieldOperationSection", () => {
  it.each(matrix)("classifies fixture $fixture ($section, $timing)", ({ entry, section, timing }) => {
    expect(fieldOperationSection(entry, OFFICE_DATE)).toBe(section);
    expect(relativeVisitTiming(entry.targetVisitDate, OFFICE_DATE)).toBe(timing);
  });

  it("keeps due-today assigned work out of Overdue", () => {
    expect(fieldOperationSection(item({ uuid: "today", targetVisitDate: OFFICE_DATE, assignee }), OFFICE_DATE))
      .toBe("upcoming");
  });

  it("places overdue-unassigned work only in Overdue", () => {
    const entry = item({ uuid: "overdue-unassigned", targetVisitDate: "2026-09-01", assignee: null });
    expect(fieldOperationSection(entry, OFFICE_DATE)).toBe("overdue");
    const groups = groupFieldWorkloadBySection([entry], OFFICE_DATE);
    expect(groups.overdue).toHaveLength(1);
    expect(groups.unassigned).toHaveLength(0);
    expect(groups.upcoming).toHaveLength(0);
  });

  it("classifies at the Asia/Manila office boundary, not the runtime timezone", () => {
    // The office date is supplied by the caller, so 23:59 in another timezone
    // cannot move a visit between sections.
    expect(fieldOperationSection(item({ uuid: "boundary", targetVisitDate: "2026-10-06", assignee }), OFFICE_DATE)).toBe("overdue");
    expect(fieldOperationSection(item({ uuid: "boundary-2", targetVisitDate: "2026-10-07", assignee }), OFFICE_DATE)).toBe("upcoming");
  });
});

describe("relativeVisitTiming", () => {
  it("does not invent relative timing for undated visits", () => {
    expect(relativeVisitTiming(null, OFFICE_DATE)).toBeNull();
  });

  it("handles month and year transitions", () => {
    expect(relativeVisitTiming("2026-09-30", "2026-10-02")).toBe("2 days overdue");
    expect(relativeVisitTiming("2027-01-01", "2026-12-30")).toBe("In 2 days");
    expect(relativeVisitTiming("2028-03-01", "2028-02-28")).toBe("In 2 days");
  });
});

describe("summarizeFieldWorkload / groupFieldWorkloadBySection", () => {
  const entries = matrix.map(({ entry }) => entry);

  it("reconciles the approved default counts and disjoint sections", () => {
    const summary = summarizeFieldWorkload(entries, OFFICE_DATE);
    expect(summary).toEqual({ overdue: 2, unassigned: 3, upcoming: 5, assigned: 6, total: 10 });

    const groups = groupFieldWorkloadBySection(entries, OFFICE_DATE);
    expect(groups.overdue.map((entry) => entry.uuid)).toEqual(["A", "B"]);
    expect(groups.unassigned.map((entry) => entry.uuid)).toEqual(["C", "D", "E"]);
    expect(groups.upcoming.map((entry) => entry.uuid)).toEqual(["F", "G", "H", "I", "J"]);
  });

  it("is invariant to input order", () => {
    const forward = summarizeFieldWorkload(entries, OFFICE_DATE);
    const reversed = summarizeFieldWorkload([...entries].reverse(), OFFICE_DATE);
    expect(reversed).toEqual(forward);
  });

  it("excludes completed and closed work from the active workload", () => {
    const completed = item({ uuid: "done", fieldValidationState: "completed", targetVisitDate: "2026-10-01" });
    const closed = item({ uuid: "closed", caseState: "closed", targetVisitDate: "2026-10-01" });
    expect(isActiveFieldWorkloadItem(completed)).toBe(false);
    expect(isActiveFieldWorkloadItem(closed)).toBe(false);
    const summary = summarizeFieldWorkload([...entries, completed, closed], OFFICE_DATE);
    expect(summary.total).toBe(10);
  });
});

describe("deriveReasonForVisit", () => {
  it("derives only from existing authoritative state", () => {
    expect(deriveReasonForVisit(item({ uuid: "r1", fieldValidationState: "assigned" }))).toBe("Scheduled field validation");
    expect(deriveReasonForVisit(item({ uuid: "r2", fieldValidationState: "in_progress" }))).toBe("Continue field validation");
    expect(deriveReasonForVisit(item({ uuid: "r3", fieldValidationState: "unassigned", reviewStatus: "for_field_validation" }))).toBe("Field validation required");
    expect(deriveReasonForVisit(item({ uuid: "r4", fieldValidationState: "unassigned", reviewStatus: "verified_by_staff" }))).toBeNull();
    expect(deriveReasonForVisit(item({ uuid: "r5", fieldValidationState: "assigned", scheduledRevisit: true }))).toBe("Follow-up visit");
  });
});

describe("hasUsableReportLocation", () => {
  it("accepts only complete, in-range, finite coordinate pairs", () => {
    expect(hasUsableReportLocation({ finalLatitude: 14.1, finalLongitude: 120.6 })).toBe(true);
    expect(hasUsableReportLocation({ finalLatitude: 0, finalLongitude: 0 })).toBe(true);
    expect(hasUsableReportLocation({ finalLatitude: null, finalLongitude: 120.6 })).toBe(false);
    expect(hasUsableReportLocation({ finalLatitude: 14.1, finalLongitude: null })).toBe(false);
    expect(hasUsableReportLocation({ finalLatitude: 91, finalLongitude: 120.6 })).toBe(false);
    expect(hasUsableReportLocation({ finalLatitude: 14.1, finalLongitude: 181 })).toBe(false);
    expect(hasUsableReportLocation({ finalLatitude: Number.NaN, finalLongitude: 120.6 })).toBe(false);
    expect(hasUsableReportLocation({ finalLatitude: Number.POSITIVE_INFINITY, finalLongitude: 120.6 })).toBe(false);
  });
});

describe("mergeFieldWorkload", () => {
  it("keeps every distinct identity and lets the primary read win", () => {
    const primary = [item({ uuid: "one", referenceCode: "PRIMARY" })];
    const secondary = [item({ uuid: "one", referenceCode: "SECONDARY" }), item({ uuid: "two" })];
    const merged = mergeFieldWorkload(primary, secondary);
    expect(merged.map((entry) => entry.uuid).sort()).toEqual(["one", "two"]);
    expect(merged.find((entry) => entry.uuid === "one")?.referenceCode).toBe("PRIMARY");
  });
});

describe("groupFieldWorkloadByBarangay", () => {
  it("reorganizes presentation without changing identities", () => {
    const groups = groupFieldWorkloadByBarangay([
      item({ uuid: "a", barangay: "Bucana" }),
      item({ uuid: "b", barangay: "Balaytigui" }),
      item({ uuid: "c", barangay: "Bucana" }),
    ]);
    expect(groups.map((group) => group.barangay)).toEqual(["Balaytigui", "Bucana"]);
    expect(groups[1].items.map((entry) => entry.uuid)).toEqual(["a", "c"]);
  });
});

describe("compareFieldWorkloadItems", () => {
  it("orders undated work last and stays deterministic", () => {
    const dated = item({ uuid: "1", targetVisitDate: "2026-10-08" });
    const undated = item({ uuid: "2", targetVisitDate: null });
    expect(compareFieldWorkloadItems(dated, undated)).toBeLessThan(0);
    expect(compareFieldWorkloadItems(item({ uuid: "x", targetVisitDate: "2026-10-08" }), item({ uuid: "y", targetVisitDate: "2026-10-08" }))).toBeLessThan(0);
  });
});
