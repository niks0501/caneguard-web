import type { DashboardSummary } from "../../domain/dashboard.types";

export interface DashboardRepository {
  getSummary(): Promise<DashboardSummary>;
}
