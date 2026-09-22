import { formatDate } from "../../lib/formatters";

export function buildReportPickerLabel(report: {
  referenceCode: string;
  barangay: string;
  submittedAt: string;
}): string {
  return `${report.referenceCode} · Barangay ${report.barangay} · ${formatDate(report.submittedAt)}`;
}
