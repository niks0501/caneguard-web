import type { OperationalQueue } from "./operationalQueue";
import type { DiseaseReport, ReviewStatus } from "./report.types";

export type DashboardQueueCounts = Record<OperationalQueue, number>;

export interface RiskTriageSummary {
  enabled: boolean;
  greenMinConfidence: number | null;
  reviewedCases: number;
  calibrationCases: number;
  greenMisfires: number;
  measuredAt: string;
  nextMeasurementDueAt: string;
  note: string;
  bands: { green: number; amber: number; red: number };
}

export interface ReportAnalyticsPeriod {
  from: string;
  to: string;
  granularity: "day" | "week";
  label: string;
  timezone: string;
  timezoneLabel: string;
  days: number;
  partial: boolean;
}

export interface ReportAnalyticsSeriesPoint {
  label: string;
  count: number;
}

export interface ReportAnalytics {
  period: ReportAnalyticsPeriod;
  totalSubmitted: number;
  series: ReportAnalyticsSeriesPoint[];
  comparison: {
    previousFrom: string;
    previousTo: string;
    previousTotal: number;
    previousSeries?: ReportAnalyticsSeriesPoint[];
    currentSeries?: ReportAnalyticsSeriesPoint[];
    currentTotal: number;
    delta: number;
  };
  reportedConcern: ReportedConcernCount[];
  possibleCondition: PossibleConditionCount[];
  verificationOutcome: VerificationOutcomeSplit;
  validationByBarangay: BarangayValidationRow[];
  barangayScope: BarangayScope;
  validationWorkload: ValidationWorkload;
  reviewBacklog: ReviewBacklog;
  validationTurnaround: ValidationTurnaround;
  reviewTime: ReviewTimeComparison;
}

export interface ReportAnalyticsParams {
  from: string;
  to: string;
  granularity?: "day" | "week";
  comparison?: "previous_month";
}

export interface ValidationWorkload {
  assignees: Array<{
    assigneeId: number;
    name: string;
    openReports: number;
  }>;
  unassigned: number;
}

export interface ReviewBacklog {
  totalWaiting: number;
  /** Waiting longer than `targetDays`. */
  pastTarget: number;
  targetDays: number;
  buckets: ReportAnalyticsSeriesPoint[];
  oldestWaitingDays: number | null;
}

export interface ReportedConcernCount {
  concern: string;
  label: string;
  count: number;
  share: number;
}

export interface PossibleConditionCount {
  condition: string;
  count: number;
}

export interface VerificationOutcomeSplit {
  not_determined: number;
  verified: number;
  unable_to_verify: number;
}

export interface BarangayValidationRow {
  barangay: string;
  submitted: number;
  open: number;
  pastTargetDate: number;
  scheduled: number;
  unscheduled: number;
}

export interface BarangayScope {
  municipality: string;
  province: string;
  barangays: string[];
}

/** Submitted-to-reviewed durations for one window. */
export interface ReviewTime {
  source: string;
  reviewedCases: number;
  averageHours: number | null;
  medianHours: number | null;
  minHours: number | null;
  maxHours: number | null;
}

export interface ReviewTimeComparison {
  targetDays: number;
  current: ReviewTime;
  previous: ReviewTime;
}

export interface ValidationTurnaround {
  source: string;
  completed: number;
  /** Visits made within `targetDays` of assignment. */
  withinTarget: number;
  targetDays: number;
  averageHours: number | null;
  medianHours: number | null;
  minHours: number | null;
  maxHours: number | null;
  buckets: ReportAnalyticsSeriesPoint[];
}

export interface MonthlyReportSummary {
  month: string;
  period: {
    from: string;
    to: string;
  };
  reportedCases: number;
}

export interface DashboardSummary {
  totalSubmitted: number;
  counts: Record<ReviewStatus, number>;
  queues: DashboardQueueCounts;
  riskTriage?: RiskTriageSummary;
  recentReports: DiseaseReport[];
}

