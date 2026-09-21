import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { FileText, Save } from "lucide-react";
import { ApiError } from "../api/ApiError";
import { DetailField, PageContent, PageHeader } from "../components/layout/Page";
import { Button } from "../components/ui/Button";
import { SelectFilter, TextArea } from "../components/ui/FormControls";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States";
import { activeAuthorityClassifiedConditions, authorityClassifiedConditionLabels } from "../domain/report.metadata";
import type { AuthorityClassifiedCondition, SymptomFindingVerdict } from "../domain/report.types";
import { useExpertConsult, useRecordExpertFinding } from "../hooks/useReports";
import { env } from "../config/env";
import { formatDate } from "../lib/formatters";

const verdictLabels: Record<SymptomFindingVerdict, string> = {
  present: "Present",
  absent: "Absent",
  unsure: "Unsure",
};

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExpertCasePage() {
  const { reportId = "" } = useParams();
  const consultQuery = useExpertConsult(reportId);
  const findingMutation = useRecordExpertFinding(reportId);
  const packet = consultQuery.data;
  const [conditionOpinion, setConditionOpinion] = useState<AuthorityClassifiedCondition | "">("");
  const [basis, setBasis] = useState("");
  const [confidence, setConfidence] = useState<"low" | "medium" | "high" | "">("");
  const [recommendation, setRecommendation] = useState("");
  const [responseDate, setResponseDate] = useState(todayInput);
  const [consultStatus, setConsultStatus] = useState<"in_progress" | "completed">("in_progress");
  const [symptomVerdicts, setSymptomVerdicts] = useState<Record<string, { verdict: SymptomFindingVerdict; note: string }>>({});
  const [submitted, setSubmitted] = useState(false);

  const symptomKeys = useMemo(
    () => packet?.reporterObservations.symptomKeys ?? [],
    [packet?.reporterObservations.symptomKeys],
  );

  if (consultQuery.isPending) return <PageContent><LoadingState message="Loading the consult packet..." /></PageContent>;
  if (consultQuery.isError) {
    return (
      <PageContent>
        <ErrorState
          message="This expert consult could not be loaded. Ask the office to re-refer the case if the consult has ended."
          onRetry={() => void consultQuery.refetch()}
        />
      </PageContent>
    );
  }
  if (!packet) return <PageContent><EmptyState /></PageContent>;

  const saveFinding = async () => {
    setSubmitted(true);
    if (!responseDate || packet.version === undefined) return;

    try {
      await findingMutation.mutateAsync({
        conditionOpinion: conditionOpinion || null,
        symptomVerdicts: Object.fromEntries(
          Object.entries(symptomVerdicts).map(([key, finding]) => [key, {
            verdict: finding.verdict,
            note: finding.note.trim() || null,
          }]),
        ),
        basis: basis.trim() || null,
        confidence: confidence || null,
        recommendation: recommendation.trim() || null,
        consultStatus,
        responseDate,
        expectedVersion: packet.version,
      });
    } catch {
      // The mutation error is rendered below without implying the finding saved.
    }
  };

  const mutationMessage = findingMutation.error instanceof ApiError && findingMutation.error.status === 409
    ? "This consult changed while you were working. Refresh the packet before submitting again."
    : findingMutation.error
      ? "The finding could not be saved. No office disposition was changed."
      : null;

  return (
    <PageContent className="expert-case-page">
      <PageHeader
        eyebrow="Expert workspace"
        title={packet.referenceCode}
        description="Review the evidence and return a structured expert proposal. The office keeps the final case decision."
      />

      <main className="expert-case-workspace">
        <section className="review-card expert-case-question" aria-labelledby="expert-question-heading">
          <p className="eyebrow">Office question</p>
          <h2 id="expert-question-heading">{packet.consult.question || "No specific question was provided."}</h2>
          <p className="expert-case-muted">This question is the office's request for this consult. Your finding remains a proposal until the office reviews it.</p>
        </section>

        <section className="review-card expert-case-evidence" aria-labelledby="expert-evidence-heading">
          <div className="section-heading"><div><h2 id="expert-evidence-heading">Case evidence</h2></div></div>
          <div className="expert-case-evidence-grid">
            <div>
              <img className="expert-case-photo" src={packet.photoUrl} alt={`Submitted evidence for ${packet.referenceCode}`} />
            </div>
            <dl className="detail-list">
              <DetailField label="Reported observations">{packet.reporterObservations.reporterObservationText || "Not provided"}</DetailField>
              <DetailField label="Field notes">{packet.reporterObservations.fieldNotes || "Not provided"}</DetailField>
              <DetailField label="Reporter-suspected condition">{packet.reporterSuspectedCondition || "Not provided"}</DetailField>
              <DetailField label="Possible condition"><strong>{packet.aiPossibleCondition.label}</strong><small>{packet.aiPossibleCondition.decisionSupportLabel}</small></DetailField>
              <DetailField label="Location">{[packet.location.barangay, packet.location.municipality, packet.location.province].filter(Boolean).join(", ")}</DetailField>
              <DetailField label="Affected area">{packet.affectedArea.value === null ? "Not measured" : `${packet.affectedArea.value} ${packet.affectedArea.unit}`}</DetailField>
              <DetailField label="Affected portion">{packet.affectedPortion.value === null ? "Not measured" : `${packet.affectedPortion.value} ${packet.affectedPortion.unit}`}</DetailField>
            </dl>
          </div>
          <div className="expert-case-symptoms">
            <h3>Submitted symptoms</h3>
            {symptomKeys.length === 0 ? <p className="expert-case-muted">No symptom keys were submitted.</p> : null}
            {symptomKeys.map((key) => {
              const current = symptomVerdicts[key] ?? { verdict: "unsure" as const, note: "" };
              return (
                <div className="expert-case-symptom" key={key}>
                  <strong>{key.replaceAll("_", " ")}</strong>
                  <SelectFilter
                    label={`Verification for ${key}`}
                    value={current.verdict}
                    onChange={(event) => setSymptomVerdicts((previous) => ({
                      ...previous,
                      [key]: { ...current, verdict: event.target.value as SymptomFindingVerdict },
                    }))}
                  >
                    {Object.entries(verdictLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </SelectFilter>
                  <TextArea
                    id={`symptom-note-${key}`}
                    label="Note (optional)"
                    rows={2}
                    value={current.note}
                    onChange={(event) => setSymptomVerdicts((previous) => ({
                      ...previous,
                      [key]: { ...current, note: event.target.value },
                    }))}
                  />
                </div>
              );
            })}
          </div>
        </section>

        <section className="review-card expert-case-finding" aria-labelledby="expert-finding-heading">
          <div className="section-heading"><div><h2 id="expert-finding-heading">Expert identification</h2></div></div>
          <p className="expert-case-muted">Record your opinion and reasoning. These fields are advisory and do not change the office classification.</p>
          <SelectFilter label="Condition opinion" value={conditionOpinion} onChange={(event) => setConditionOpinion(event.target.value as AuthorityClassifiedCondition | "")}>
            <option value="">Choose an opinion</option>
            {activeAuthorityClassifiedConditions.map((condition) => <option value={condition} key={condition}>{authorityClassifiedConditionLabels[condition]}</option>)}
          </SelectFilter>
          <TextArea id="expert-basis" label="Basis" rows={4} maxLength={2000} value={basis} onChange={(event) => setBasis(event.target.value)} placeholder="Explain why this opinion fits the evidence" />
          <SelectFilter label="Confidence" value={confidence} onChange={(event) => setConfidence(event.target.value as "low" | "medium" | "high" | "")}>
            <option value="">Choose confidence</option>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </SelectFilter>
          <TextArea id="expert-recommendation" label="Recommendation" rows={4} maxLength={2000} value={recommendation} onChange={(event) => setRecommendation(event.target.value)} placeholder="Suggest the next useful action for the office" />
          <label className="select-filter" htmlFor="expert-response-date"><span>Response date</span><input id="expert-response-date" type="date" value={responseDate} onChange={(event) => setResponseDate(event.target.value)} /></label>
          <SelectFilter label="Consult status" value={consultStatus} onChange={(event) => setConsultStatus(event.target.value as "in_progress" | "completed")}>
            <option value="in_progress">Save and keep consult open</option>
            <option value="completed">Complete consult and send proposal</option>
          </SelectFilter>
          {submitted && !responseDate ? <p className="form-error" role="alert">Add the response date.</p> : null}
          {mutationMessage ? <p className="form-error" role="alert">{mutationMessage}</p> : null}
          <Button type="button" icon={<Save aria-hidden="true" />} disabled={findingMutation.isPending} onClick={() => void saveFinding()}>
            {findingMutation.isPending ? "Saving finding..." : "Save expert finding"}
          </Button>
        </section>

        <section className="review-card expert-case-due" aria-labelledby="expert-due-heading">
          <div className="section-heading"><div><h2 id="expert-due-heading">Turnaround</h2></div></div>
          <dl className="detail-list"><DetailField label="Due date">{packet.consult.dueDate || "No due date"}</DetailField><DetailField label="Referral date">{packet.consult.referralDate ? formatDate(packet.consult.referralDate) : "Not provided"}</DetailField></dl>
        </section>

        <section className="review-card expert-case-history" aria-labelledby="expert-history-heading">
          <div className="section-heading"><div><h2 id="expert-history-heading">Earlier consults</h2></div></div>
          {packet.priorConsults.length === 0 ? <p className="expert-case-muted">No completed consults are recorded for this case.</p> : packet.priorConsults.map((prior) => <article className="expert-case-prior" key={prior.id}><strong>{prior.reference}</strong><span>{prior.conditionOpinion || "No condition opinion"}</span><span>{prior.basis || "No basis recorded"}</span></article>)}
        </section>

        <a className="button button--secondary referral-summary-link" href={`${env.apiBaseUrl}/api/v1/reports/${encodeURIComponent(reportId)}/referral/summary`} target="_blank" rel="noreferrer"><FileText aria-hidden="true" /> <span>Print / download referral summary</span></a>
      </main>
    </PageContent>
  );
}
