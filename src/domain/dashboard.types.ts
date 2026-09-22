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

export interface ExpertVerificationMetricRate {
  count: number;
  denominator: number;
  rate: number | null;
  percentage: number | null;
}

export interface ExpertVerificationConsultVolume {
  total: number;
  consultedCases: number;
  pending: number;
  inProgress: number;
  completed: number;
  cancelled: number;
}

export interface ExpertVerificationSummary {
  consultVolume: ExpertVerificationConsultVolume;
  expertAgreement: ExpertVerificationMetricRate;
  unableToClassifyRate: ExpertVerificationMetricRate;
  symptomVerificationDisagreement: ExpertVerificationMetricRate;
  advisoryCoverage?: {
    consultCases: number;
    casesWithAdvisory: number;
    coverageRate: number | null;
    deliveredCases: number;
    acknowledgedCases: number;
  };
  timeToFinding?: {
    source: string;
    findings: number;
    averageHours: number | null;
    medianHours: number | null;
    minHours: number | null;
    maxHours: number | null;
  };
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
  expertVerification?: ExpertVerificationSummary;
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
    currentTotal: number;
    delta: number;
  };
  lifecycle: LifecycleDistributions;
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
}

export interface LifecycleDistributions {
  verificationOutcome: Record<string, number>;
  fieldValidationState: Record<string, number>;
  referralState: Record<string, number>;
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
  expertVerification?: ExpertVerificationSummary;
}

export interface DashboardSummary {
  totalSubmitted: number;
  counts: Record<ReviewStatus, number>;
  queues: DashboardQueueCounts;
  riskTriage?: RiskTriageSummary;
  recentReports: DiseaseReport[];
  monthlySummary?: MonthlyCaseSummary;
}

