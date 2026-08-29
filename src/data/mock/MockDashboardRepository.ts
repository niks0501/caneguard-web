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
    const queues = {
      needs_review: 0,
      needs_visit: 0,
      follow_up_due: 0,
    };

    mockReports.forEach((report) => {
      counts[report.reviewStatus] += 1;
      if (report.reviewStatus === "submitted_unverified") {
        queues.needs_review += 1;
      }
      if (report.reviewStatus === "for_field_validation") {
        queues.needs_visit += 1;
      }
    });

    return {
      totalSubmitted: mockReports.length,
      counts,
      queues,
      recentReports: mockReports.slice(0, 5),
    };
  }
}
