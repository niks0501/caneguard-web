import type { DiseaseReport, ReviewStatus } from "./report.types";

export interface DashboardSummary {
  totalSubmitted: number;
  counts: Record<ReviewStatus, number>;
  recentReports: DiseaseReport[];
}
