import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Cloud,
  Info,
  MapPin,
  Save,
  ScanLine,
  Smartphone,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { routes } from "../app/routes";
import { DetailField, PageContent, PageHeader } from "../components/layout/Page";
import { ConfidenceDisplay } from "../components/reports/ConfidenceDisplay";
import { EvidenceThumbnail } from "../components/reports/EvidenceThumbnail";
import { DiseaseBadge, ReviewStatusBadge } from "../components/reports/ReportBadges";
import { SymptomResponseItem } from "../components/reports/SymptomResponseItem";
import { Button } from "../components/ui/Button";
import { TextArea } from "../components/ui/FormControls";
import { ErrorState, ImagePendingState, LoadingState } from "../components/ui/States";
import {
  imageStatusLabels,
  reviewStatusLabels,
  submitterRoleLabels,
} from "../domain/report.metadata";
import type { DiseaseReport, ReviewStatus } from "../domain/report.types";
import { formatDateTime } from "../lib/formatters";
import { reportsRepository } from "../services/reports.service";

type ReviewAction = Exclude<ReviewStatus, "pending_review">;

const actions: Array<{ value: ReviewAction; description: string }> = [
  { value: "acknowledged", description: "Record the observation without field follow-up." },
  { value: "needs_field_verification", description: "Flag this report for an on-site observation." },
  { value: "insufficient_evidence", description: "Request clearer or more complete evidence." },
  { value: "closed", description: "Complete office review of this submission." },
];

export function CaseReviewPage() {
  const { reportId = "" } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState<DiseaseReport | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [notes, setNotes] = useState("");
  const [selectedAction, setSelectedAction] = useState<ReviewAction>("acknowledged");
  const [isSaving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    reportsRepository
      .getReportById(reportId)
      .then((data) => {
        if (!active) return;
        if (!data) {
          setState("missing");
          return;
        }
        setReport(data);
        setNotes(data.reviewNotes ?? "");
        if (data.reviewStatus !== "pending_review") setSelectedAction(data.reviewStatus);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [reportId]);

  const saveReview = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await reportsRepository.updateReview(reportId, {
        status: selectedAction,
        notes,
        reviewedBy: "Maria Santos",
      });
      navigate(routes.reports, { state: { notice: `${reportId} was updated to ${reviewStatusLabels[selectedAction]}.` } });
    } catch {
      setSaveError("The mock review could not be saved. Please try again.");
      setSaving(false);
    }
  };

  if (state === "loading") return <PageContent><LoadingState message="Loading report evidence..." /></PageContent>;
  if (state === "missing") return <PageContent><ErrorState message="This report does not exist in the current submitted report queue." /></PageContent>;
  if (state === "error" || !report) return <PageContent><ErrorState /></PageContent>;

  return (
    <PageContent>
      <Link className="back-link" to={routes.reports}><ArrowLeft aria-hidden="true" />Back to submitted reports</Link>
      <PageHeader
        eyebrow="Case review"
        title={report.id}
        description="Examine the submitted evidence before recording an office response."
        actions={<ReviewStatusBadge status={report.reviewStatus} />}
      />

      <div className="review-layout">
        <div className="review-main">
          <section className="review-card evidence-card" aria-labelledby="evidence-heading">
            <div className="section-heading"><div><p className="eyebrow">Submitted evidence</p><h2 id="evidence-heading">Field image</h2></div><span className="source-label"><Smartphone aria-hidden="true" />Mobile capture</span></div>
            <div className="evidence-stage">
              {report.imageStatus === "available" ? (
                <EvidenceThumbnail status="available" label={`Submitted sugarcane evidence for ${report.id}`} />
              ) : (
                <ImagePendingState status={report.imageStatus} />
              )}
            </div>
            <div className="evidence-meta">
              <span><Cloud aria-hidden="true" />{imageStatusLabels[report.imageStatus]}</span>
              <span>Captured {formatDateTime(report.capturedAt)}</span>
            </div>
          </section>

          <section className="review-card" aria-labelledby="symptoms-heading">
            <div className="section-heading"><div><p className="eyebrow">Guided observation</p><h2 id="symptoms-heading">Submitted symptom responses</h2></div><ClipboardList aria-hidden="true" /></div>
            <ul className="symptom-list">
              {report.symptoms.map((response) => <SymptomResponseItem response={response} key={response.id} />)}
            </ul>
          </section>

          <section className="review-card" aria-labelledby="notes-heading">
            <div className="section-heading"><div><p className="eyebrow">Field context</p><h2 id="notes-heading">Submitter note</h2></div></div>
            <blockquote>{report.fieldNotes ?? "No field note was included with this submission."}</blockquote>
          </section>
        </div>

        <aside className="review-sidebar" aria-label="Report assessment and office review">
          <section className="review-card model-card">
            <div className="section-heading"><div><p className="eyebrow">Model-supported result</p><h2>Image assessment</h2></div><ScanLine aria-hidden="true" /></div>
            <DiseaseBadge disease={report.predictedDisease} />
            <ConfidenceDisplay confidence={report.confidence} />
            <div className="decision-reminder"><Info aria-hidden="true" /><p><strong>Decision-support only</strong><span>This result is not a diagnosis. Compare it with the submitted observations and field context.</span></p></div>
          </section>

          <section className="review-card">
            <div className="section-heading"><div><p className="eyebrow">Submission details</p><h2>Report context</h2></div><MapPin aria-hidden="true" /></div>
            <dl className="detail-list">
              <DetailField label="Barangay">{report.barangay}</DetailField>
              <DetailField label="Farm reference">{report.farmReference ?? "Not provided"}</DetailField>
              <DetailField label="Submitted by">{report.submittedByName}</DetailField>
              <DetailField label="Submitter role">{submitterRoleLabels[report.submitterRole]}</DetailField>
              <DetailField label="Submitted at">{formatDateTime(report.submittedAt)}</DetailField>
              {report.reviewedBy ? <DetailField label="Last reviewed by">{report.reviewedBy}</DetailField> : null}
            </dl>
          </section>

          <section className="review-card office-review" aria-labelledby="office-review-heading">
            <div className="section-heading"><div><p className="eyebrow">Office response</p><h2 id="office-review-heading">Record review action</h2></div><CheckCircle2 aria-hidden="true" /></div>
            <fieldset className="review-actions">
              <legend>Select an action</legend>
              {actions.map((action) => (
                <label className={selectedAction === action.value ? "is-selected" : ""} key={action.value}>
                  <input type="radio" name="review-action" value={action.value} checked={selectedAction === action.value} onChange={() => setSelectedAction(action.value)} />
                  <span><strong>{reviewStatusLabels[action.value]}</strong><small>{action.description}</small></span>
                </label>
              ))}
            </fieldset>
            <TextArea id="review-notes" label="Review notes" hint="Use neutral, observable language. Notes remain in this browser session." rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add context for this office response..." />
            {saveError ? <p className="form-error" role="alert">{saveError}</p> : null}
            <Button type="button" icon={<Save aria-hidden="true" />} disabled={isSaving} onClick={saveReview}>
              {isSaving ? "Saving review..." : "Save review action"}
            </Button>
          </section>
        </aside>
      </div>
    </PageContent>
  );
}
