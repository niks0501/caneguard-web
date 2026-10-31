import type { DiseaseReport } from "../../domain/report.types";
import { mockReports } from "./mockReports";

export const cloneMockReport = (report: DiseaseReport): DiseaseReport => ({
  ...report,
  updatedAt: report.updatedAt ?? report.submittedAt,
  reviewVersion: report.reviewVersion ?? 0,
  symptoms: report.symptoms.map((symptom) => ({ ...symptom })),
  reviewEvents: report.reviewEvents
    ? report.reviewEvents.map((event) => ({
        ...event,
        actor: event.actor ? { ...event.actor } : null,
      }))
    : [],
  affectedFields: report.affectedFields?.map((field) => ({
    ...field,
    geometry: {
      type: "Polygon",
      coordinates: field.geometry.coordinates.map((ring) => ring.map(([longitude, latitude]) => [longitude, latitude])),
    },
    inspector: { ...field.inspector },
  })) ?? [],
  referral: report.referral
    ? {
        ...report.referral,
        officeContext: { ...report.referral.officeContext },
      }
    : report.referral,
});

// One mutable copy of the mock fixtures, shared by every mock repository that
// reads or writes review state. Review writes and the queue projections that
// supply `expectedVersion` must read this array so both sides agree on
// `reviewVersion`; hand callers `cloneMockReport` so they cannot mutate it.
export const mockReportStore: DiseaseReport[] = mockReports.map(cloneMockReport);
