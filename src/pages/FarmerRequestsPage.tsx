import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/ApiError";
import { useAuth } from "../auth/useAuth";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Pagination } from "../components/ui/Pagination";
import { ErrorState, LoadingState } from "../components/ui/States";
import { FarmerBroadcastsSection } from "../components/farmers/FarmerBroadcastsSection";
import { PageContent, PageHeader } from "../components/layout/Page";
import { env } from "../config/env";
import { knownBarangays } from "../domain/locationScope";
import { formatDateTime } from "../lib/formatters";
import { concernLabels, hintLabels, inquiryStatuses, listFarmerInquiries, listValidatedAdvisories, replyToInquiry, startInquiryReview } from "../services/farmerInquiries.api";
import type { FarmerInquiry, InquiryFilters } from "../services/farmerInquiries.api";

export function FarmerRequestsPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [filters, setFilters] = useState<InquiryFilters>({ page: 1, status: "", barangay: "" });
  const [openUuid, setOpenUuid] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => { document.title = "Farmer requests | CaneGuard"; }, []);
  const query = useQuery({ queryKey: ["farmer-inquiries", user?.uuid, filters], queryFn: ({ signal }) => listFarmerInquiries(filters, signal), retry: false, gcTime: 0 });
  const result = query.data;
  const open = result?.data.find(item => item.uuid === openUuid) ?? null;
  const refresh = () => client.invalidateQueries({ queryKey: ["farmer-inquiries"] });
  return <PageContent className="accounts-page">
    <PageHeader title="Farmer requests" description={result ? `${result.meta.waiting} waiting for a reply. Not part of cases, maps or reports.` : undefined} />
    {notice ? <p role="status">{notice}</p> : null}
    <div className="accounts-filters">
      <label className="settings-field"><span>Status</span>
        <select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value as InquiryFilters["status"], page: 1 })}>
          <option value="">All statuses</option>
          {Object.entries(inquiryStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="settings-field"><span>Barangay</span>
        <select value={filters.barangay} onChange={event => setFilters({ ...filters, barangay: event.target.value, page: 1 })}>
          <option value="">All barangays</option>
          {knownBarangays.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
    </div>
    {query.isPending ? <LoadingState message="Loading farmer requests…" /> : query.isError ? <ErrorState message="Farmer requests could not be loaded." onRetry={() => void query.refetch()} /> : result ? <>
      {result.data.length === 0 ? <p role="status">{filters.status || filters.barangay ? "No matching farmer requests." : "No farmer requests."}</p> : <table className="report-table accounts-table">
        <caption className="sr-only">Farmer requests</caption>
        <thead><tr><th scope="col">Farmer</th><th scope="col">Barangay</th><th scope="col">AI hint (unverified)</th><th scope="col">Received</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
        <tbody>{result.data.map(item => <tr key={item.uuid}>
          <td data-label="Farmer">{item.farmer.name}</td>
          <td data-label="Barangay">{item.barangay}</td>
          <td data-label="AI hint (unverified)">{item.ai_hint ? hintLabels[item.ai_hint.label] ?? item.ai_hint.label : "None"}</td>
          <td data-label="Received">{item.created_at ? formatDateTime(item.created_at) : ""}</td>
          <td data-label="Status">{inquiryStatuses[item.status]}</td>
          <td data-label="Action"><Button variant="secondary" aria-label={`Open request from ${item.farmer.name}`} onClick={() => { setNotice(""); setOpenUuid(item.uuid); }}>Open</Button></td>
        </tr>)}</tbody>
      </table>}
      <Pagination currentPage={result.meta.page} pageCount={Math.max(1, Math.ceil(result.meta.total / result.meta.per_page))} itemCount={result.meta.total} itemLabel="farmer requests" onPageChange={page => setFilters({ ...filters, page })} />
    </> : null}
    <FarmerBroadcastsSection />
    {open ? <RequestDialog key={`${open.uuid}:${open.lock_version}`} item={open} onClose={() => setOpenUuid(null)} onNotice={setNotice} onChanged={refresh} /> : null}
  </PageContent>;
}

function RequestDialog({ item, onClose, onNotice, onChanged }: { item: FarmerInquiry; onClose: () => void; onNotice: (notice: string) => void; onChanged: () => Promise<void> }) {
  const [advisoryUuid, setAdvisoryUuid] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const advisories = useQuery({ queryKey: ["farmer-inquiries", "advisories"], queryFn: ({ signal }) => listValidatedAdvisories(signal), retry: false, enabled: item.status !== "replied" });
  const replied = item.status === "replied";
  async function run(action: () => Promise<unknown>, done: string) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await action();
      onNotice(done);
      await onChanged();
      if (done === "Reply sent.") onClose();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        onClose();
        onNotice("This request changed. Reopen it to see the latest.");
        await onChanged();
      } else if (failure instanceof ApiError && failure.status === 422) {
        setError(failure.errors ? Object.values(failure.errors).flat().join(" ") : failure.message);
      } else {
        setError("Not confirmed. Reload the list and check the request before trying again.");
      }
    } finally {
      setPending(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void run(() => replyToInquiry(item.uuid, { expected_lock_version: item.lock_version, ...(advisoryUuid ? { advisory_uuid: advisoryUuid } : {}), ...(body.trim() ? { body: body.trim() } : {}) }), "Reply sent.");
  }
  return <Modal id="farmer-request" title={`Request from ${item.farmer.name}`} open onClose={() => { if (!pending) onClose(); }} disabled={pending}>
    <div className="settings-form">
      <dl className="accounts-summary">
        <dt>Barangay</dt><dd>{item.barangay}{item.landmark ? ` · ${item.landmark}` : ""}</dd>
        <dt>Received</dt><dd>{item.created_at ? formatDateTime(item.created_at) : ""}</dd>
        {item.concern ? <><dt>Concern</dt><dd>{concernLabels[item.concern] ?? item.concern}</dd></> : null}
        {item.note ? <><dt>Note</dt><dd>{item.note}</dd></> : null}
        <dt>AI hint (unverified)</dt><dd>{item.ai_hint ? `${hintLabels[item.ai_hint.label] ?? item.ai_hint.label}${item.ai_hint.confidence_percent === null ? "" : ` · ${item.ai_hint.confidence_percent}%`}` : "None"}</dd>
      </dl>
      <div className="accounts-actions">
        {item.photos.map(photo => <img key={photo.position} src={`${env.apiBaseUrl.replace(/\/$/, "")}${photo.url}`} alt={`Farmer photo ${photo.position}`} loading="lazy" style={{ maxWidth: "100%", maxHeight: 240 }} />)}
      </div>
      {item.replies.map(reply => <p key={reply.uuid}><strong>{reply.advisory_title ?? "Office note"}</strong> · {reply.author_name ?? "Office"}: {reply.body}</p>)}
      {error ? <p role="alert">{error}</p> : null}
      {replied ? <div className="accounts-actions"><Button type="button" variant="secondary" onClick={onClose}>Close</Button></div> : <form className="settings-form" onSubmit={submit}>
        {item.status === "new" ? <Button type="button" variant="secondary" disabled={pending} onClick={() => void run(() => startInquiryReview(item.uuid, item.lock_version), "Marked as reviewing.")}>Start reviewing</Button> : <p>Reviewing{item.reviewed_by ? `: ${item.reviewed_by}` : ""}</p>}
        <label className="settings-field"><span>Validated advisory</span>
          <select value={advisoryUuid} disabled={pending} onChange={event => setAdvisoryUuid(event.target.value)}>
            <option value="">None</option>
            {(advisories.data ?? []).map(advisory => <option key={advisory.uuid} value={advisory.uuid}>{advisory.code} · {advisory.title}</option>)}
          </select>
        </label>
        <label className="settings-field"><span>Note to the farmer</span>
          <textarea value={body} maxLength={1000} rows={4} disabled={pending} onChange={event => setBody(event.target.value)} />
        </label>
        <div className="accounts-actions">
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending || (!advisoryUuid && !body.trim())}>{pending ? "Sending…" : "Send reply"}</Button>
        </div>
      </form>}
    </div>
  </Modal>;
}
