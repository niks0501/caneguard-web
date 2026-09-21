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

