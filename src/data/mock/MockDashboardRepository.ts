import type { DashboardRepository } from "../contracts/DashboardRepository";
import type { DashboardSummary } from "../../domain/dashboard.types";
import type { ReviewStatus } from "../../domain/report.types";
import { mockReports } from "./mockReports";

export class MockDashboardRepository implements DashboardRepository {
  async getSummary(): Promise<DashboardSummary> {
    const counts: Record<ReviewStatus, number> = {
      submitted_unverified: 0,
      for_field_validation: 0,
      verified_by_staff: 0,
      unable_to_verify: 0,
      resolved: 0,
    };

    mockReports.forEach((report) => {
      counts[report.reviewStatus] += 1;
    });

    return {
      totalSubmitted: mockReports.length,
      counts,
      recentReports: mockReports.slice(0, 5),
    };
  }
}
