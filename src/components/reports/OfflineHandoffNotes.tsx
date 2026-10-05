import { useEffect, useState, type FormEvent } from "react";
import type { DiseaseReport } from "../../domain/report.types";
import { useRecordHandoffNote } from "../../hooks/useReports";
import { env } from "../../config/env";
import { DetailField } from "../layout/Page";
import { Button } from "../ui/Button";
import { TextArea } from "../ui/FormControls";
import { formatDate } from "../../lib/formatters";

export function OfflineHandoffNotes({ report }: { report: DiseaseReport }) {
  const mutation = useRecordHandoffNote(report.uuid);
  const [destination, setDestination] = useState("");
  const [reference, setReference] = useState("");
  const [sentDate, setSentDate] = useState("");
  const [note, setNote] = useState("");
  const [advice, setAdvice] = useState("");
  const [saved, setSaved] = useState(false);
  const summaryUrl = `${env.apiBaseUrl.replace(/\/$/, "")}/api/v1/reports/${encodeURIComponent(report.uuid)}/referral/summary`;

  const dirty = Boolean(destination || reference || sentDate || note || advice);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (report.reviewVersion === undefined) return;
    setSaved(false);
    try {
      await mutation.mutateAsync({ destination, reference, sentDate, note, adviceReceivedNote: advice, expectedVersion: report.reviewVersion });
      setDestination(""); setReference(""); setSentDate(""); setNote(""); setAdvice("");
      setSaved(true);
    } catch { /* The durable save was not confirmed; preserve the draft. */ }
  }

  return (
    <section className="review-card" aria-labelledby="offline-handoff-heading">
      <div className="section-heading">
        <h2 id="offline-handoff-heading">Offline handoff notes</h2>
        <div className="decision-summary__actions">
          <a className="button button--secondary" href={summaryUrl} target="_blank" rel="noreferrer">Print case summary</a>
          <a className="button button--secondary" href={`${summaryUrl}?download=1`}>Download case summary</a>
        </div>
      </div>
      {(report.handoffNotes ?? []).map((handoff) => (
        <dl className="detail-list" key={handoff.id}>
          <DetailField label="Destination">{handoff.destination}</DetailField>
          <DetailField label="External reference">{handoff.reference ?? "Not recorded"}</DetailField>
          <DetailField label="Sent date">{formatDate(handoff.sent_date)}</DetailField>
          <DetailField label="Note">{handoff.note ?? "Not recorded"}</DetailField>
          <DetailField label="Advice received note">{handoff.advice_received_note ?? "Not recorded"}</DetailField>
        </dl>
      ))}
      <details>
        <summary>Add handoff note</summary>
        <form className="review-subform" onSubmit={save}>
          <label className="select-filter" htmlFor="handoff-destination"><span>Destination</span><input id="handoff-destination" required maxLength={160} value={destination} onChange={(event) => setDestination(event.target.value)} /></label>
          <label className="select-filter" htmlFor="handoff-reference"><span>External reference (optional)</span><input id="handoff-reference" maxLength={160} value={reference} onChange={(event) => setReference(event.target.value)} /></label>
          <label className="select-filter" htmlFor="handoff-sent-date"><span>Sent date</span><input id="handoff-sent-date" required type="date" value={sentDate} onChange={(event) => setSentDate(event.target.value)} /></label>
          <TextArea id="handoff-note" label="Note (optional)" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
          <TextArea id="handoff-advice" label="Advice received note (optional)" maxLength={1000} value={advice} onChange={(event) => setAdvice(event.target.value)} />
          {mutation.isError ? <p className="form-error" role="alert">The handoff note was not saved. Refresh the case and try again.</p> : null}
          {saved ? <p role="status">Handoff note saved.</p> : null}
          <Button type="submit" disabled={mutation.isPending || report.reviewVersion === undefined}>{mutation.isPending ? "Saving note..." : "Save handoff note"}</Button>
        </form>
      </details>
    </section>
  );
}
