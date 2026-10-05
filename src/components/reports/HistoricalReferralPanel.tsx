import type { DiseaseReport } from "../../domain/report.types";
import { DetailField } from "../layout/Page";
import { ClampedText } from "../ui/ClampedText";

export function HistoricalReferralPanel({ report }: { report: DiseaseReport }) {
  const referrals = report.consults?.length ? report.consults : report.referral ? [report.referral] : [];
  if (!referrals.length) return null;

  return (
    <section className="review-card" aria-labelledby="historical-referral-heading">
      <h2 id="historical-referral-heading">Expert referral (historical)</h2>
      {referrals.map((referral, index) => (
        <dl className="detail-list" key={referral.id ?? index}>
          <DetailField label="Destination">{referral.destination}</DetailField>
          <DetailField label="External reference">{referral.reference ?? "Not recorded"}</DetailField>
          <DetailField label="Sent date">{referral.referralDate}</DetailField>
          <DetailField label="Expert">{referral.expertName ?? "Not recorded"}</DetailField>
          <DetailField label="Historical status">{referral.status ?? "Not recorded"}</DetailField>
          <DetailField label="Handoff note"><ClampedText text={("note" in referral ? referral.note : null) ?? "Not recorded"} /></DetailField>
          <DetailField label="Finding"><ClampedText text={referral.findingSummary ?? ("responseNote" in referral ? referral.responseNote : null) ?? "Not recorded"} /></DetailField>
          <DetailField label="Finding details"><ClampedText text={referral.findingDetails ?? ("responseFinding" in referral ? referral.responseFinding : null) ?? "Not recorded"} /></DetailField>
          <DetailField label="Condition opinion">{referral.conditionOpinion ?? "Not recorded"}</DetailField>
          {Object.entries(referral.symptomVerdicts ?? {}).map(([symptom, finding]) => (
            <DetailField key={symptom} label={symptom}>{finding.verdict}{finding.note ? ` · ${finding.note}` : ""}</DetailField>
          ))}
          <DetailField label="Recommendation"><ClampedText text={referral.findingRecommendation ?? "Not recorded"} /></DetailField>
        </dl>
      ))}
    </section>
  );
}
