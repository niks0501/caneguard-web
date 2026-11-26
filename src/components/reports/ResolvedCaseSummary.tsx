import { Printer, RotateCcw } from "lucide-react";
import { actionTakenLabels } from "../../domain/report.metadata";
import type { DiseaseReport } from "../../domain/report.types";
import { formatDateTime } from "../../lib/formatters";
import { Button } from "../ui/Button";

const stamp = (value?: string | null) => (value ? formatDateTime(value) : "Time not recorded");

export function ResolvedCaseSummary({ report, onReopen }: { report: DiseaseReport; onReopen: () => void }) {
  const visit = report.fieldValidationAssignment?.completion;
  const action = report.actionTaken ? actionTakenLabels[report.actionTaken] : "Case closed";
  const reviewer = report.reviewedBy ?? "Reviewer not recorded";
  const timeline = [
    { label: "Reported", who: report.submittedByName, at: report.submittedAt },
    { label: "Reviewed", who: "First opened", at: report.firstReviewedAt },
    {
      label: "Field check",
      who: visit ? report.fieldValidationAssignment?.assignee.name ?? "Inspector" : "No visit needed",
      at: visit?.visitedAt,
    },
    { label: "Resolved", who: reviewer, at: report.reviewedAt },
  ];
  return (
    <section className="resolved-summary" aria-labelledby="resolved-summary-heading">
      <div className="resolved-summary__banner">
        <div>
          <h2 id="resolved-summary-heading">Resolved · {action}</h2>
          <p>{reviewer} · {stamp(report.reviewedAt)}</p>
        </div>
        <div className="resolved-summary__actions">
          <Button type="button" variant="secondary" icon={<Printer aria-hidden="true" />} onClick={() => window.print()}>Print</Button>
          <Button type="button" icon={<RotateCcw aria-hidden="true" />} onClick={onReopen}>Reopen…</Button>
        </div>
      </div>
      <ol className="resolved-summary__timeline" aria-label="Case timeline">
        {timeline.map((row) => (
          <li key={row.label}>
            <strong>{row.label}</strong>
            <span>{row.who}</span>
            <span>{row.at ? stamp(row.at) : "—"}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
