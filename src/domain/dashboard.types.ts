import type { OperationalQueue } from "./operationalQueue";
import type { DiseaseKey, DiseaseReport, ReviewStatus } from "./report.types";

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

export interface MonthlyCaseSummary {
  month: string;
  period: {
    from: string;
    to: string;
  };
  reportedCases: number;
  casesByBarangay: Array<{
    barangay: string;
    reportedCases: number;
  }>;
  casesByPossibleCondition: Array<{
    possibleCondition: DiseaseKey;
    reportedCases: number;
  }>;
  estimatedAffectedHectares: number;
  reportsContainingFarmerFarmInformation: number;
  fieldValidationCounts: {
    unassigned: number;
    assigned: number;
    inProgress: number;
    completed: number;
    requiringValidation: number;
  };
  closedCases: number;
  reviewTime: {
    source: string;
    reviewedCases: number;
    averageHours: number | null;
    medianHours: number | null;
    minHours: number | null;
    maxHours: number | null;
  };
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
  casesByBarangay: Array<{
    barangay: string;
    reportedCases: number;
  }>;
  casesByPossibleCondition: Array<{
    possibleCondition: DiseaseKey;
    reportedCases: number;
  }>;
  caseState: {
    open: number;
    closed: number;
  };
  comparison: {
    previousFrom: string;
    previousTo: string;
    previousTotal: number;
    previousSeries?: ReportAnalyticsSeriesPoint[];
    currentSeries?: ReportAnalyticsSeriesPoint[];
    currentTotal: number;
    delta: number;
  };
  lifecycle: LifecycleDistributions;
  reportedConcern: ReportedConcernCount[];
  possibleCondition: PossibleConditionCount[];
  verificationOutcome: VerificationOutcomeSplit;
  validationByBarangay: BarangayValidationRow[];
  barangayScope: BarangayScope;
  area: AreaEstimate;
  validationWorkload: ValidationWorkload;
  validationSchedule: ValidationSchedule;
  reviewBacklog: ReviewBacklog;
  validationTurnaround: ValidationTurnaround;
}

export interface ReportAnalyticsParams {
  from: string;
  to: string;
  granularity?: "day" | "week";
  comparison?: "previous_month";
}

export interface LifecycleDistributions {
  verificationOutcome: Record<string, number>;
  fieldValidationState: Record<string, number>;
}

export interface AreaEstimate {
  estimatedHectares: number;
  contributingReports: number;
  measuredReports: number;
  measuredHectares: number;
  notMeasuredReports: number;
  notMeasuredHectares: number;
  linkedDuplicatesExcluded: number;
  overlapNote: string;
}

export interface ValidationWorkload {
  assignees: Array<{
    assigneeId: number;
    name: string;
    openReports: number;
  }>;
  unassigned: number;
}

export interface ValidationSchedule {
  unscheduled: number;
  scheduled: number;
  dueToday: number;
  pastTargetDate: number;
  today: string;
}

export interface ReviewBacklog {
  totalWaiting: number;
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

export interface ValidationTurnaround {
  source: string;
  completed: number;
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
  monthlySummary?: MonthlyCaseSummary;
}

