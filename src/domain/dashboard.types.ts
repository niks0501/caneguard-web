import type { DiseaseReport, ReviewStatus } from "./report.types";
import type { OperationalQueue } from "./operationalQueue";

export type DashboardQueueCounts = Record<OperationalQueue, number>;

export interface DashboardSummary {
  totalSubmitted: number;
  counts: Record<ReviewStatus, number>;
  queues: DashboardQueueCounts;
  recentReports: DiseaseReport[];
}
