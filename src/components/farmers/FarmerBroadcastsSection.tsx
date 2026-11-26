import { useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/ApiError";
import { useAuth } from "../../auth/useAuth";
import { knownBarangays } from "../../domain/locationScope";
import { formatDateTime } from "../../lib/formatters";
import { listFarmerBroadcasts, listValidatedAdvisories, publishFarmerBroadcast, retireFarmerBroadcast } from "../../services/farmerBroadcasts.api";
import type { BroadcastCommand, FarmerBroadcast } from "../../services/farmerBroadcasts.api";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { ErrorState, LoadingState } from "../ui/States";

const emptyForm = { advisory_uuid: "", headline_tl: "", headline_en: "", body_tl: "", body_en: "", all: true, barangays: [] as string[], expires_in_days: 14 };

export function FarmerBroadcastsSection() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const query = useQuery({ queryKey: ["farmer-broadcasts", user?.uuid], queryFn: ({ signal }) => listFarmerBroadcasts(signal), retry: false, gcTime: 0 });
  const refresh = () => client.invalidateQueries({ queryKey: ["farmer-broadcasts"] });
  async function retire(row: FarmerBroadcast) {
    setNotice("");
    try {
      await retireFarmerBroadcast(row.uuid);
      setNotice("Broadcast withdrawn.");
    } catch {
      setNotice("Not confirmed. Reload the list and check the broadcast before trying again.");
    }
    await refresh();
  }
  return <section className="accounts-field" aria-label="Barangay broadcasts">
    {notice ? <p role="status">{notice}</p> : null}
    <div className="accounts-actions"><Button onClick={() => { setNotice(""); setOpen(true); }}>Publish broadcast</Button></div>
    {query.isPending ? <LoadingState message="Loading broadcasts…" /> : query.isError ? <ErrorState message="Broadcasts could not be loaded." onRetry={() => void query.refetch()} /> : query.data.length === 0 ? <p role="status">No broadcasts.</p> : <table className="report-table accounts-table">
      <caption className="sr-only">Barangay broadcasts</caption>
      <thead><tr><th scope="col">Headline</th><th scope="col">Barangays</th><th scope="col">Farmers reached</th><th scope="col">Expires</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
      <tbody>{query.data.map(row => <tr key={row.uuid}>
        <td data-label="Headline">{row.headline_en}<br /><small>{row.advisory.code}</small></td>
        <td data-label="Barangays">{row.barangays === null ? "All barangays" : row.barangays.join(", ")}</td>
        <td data-label="Farmers reached">{row.reach}</td>
        <td data-label="Expires">{formatDateTime(row.expires_at)}</td>
        <td data-label="Status">{row.live ? "Live" : row.retired_at ? "Withdrawn" : "Ended"}</td>
        <td data-label="Action">{row.live ? <Button variant="secondary" aria-label={`Withdraw ${row.headline_en}`} onClick={() => void retire(row)}>Withdraw</Button> : null}</td>
      </tr>)}</tbody>
    </table>}
    {open ? <PublishDialog onClose={() => setOpen(false)} onPublished={async () => { setOpen(false); setNotice("Broadcast published."); await refresh(); }} /> : null}
  </section>;
}

function PublishDialog({ onClose, onPublished }: { onClose: () => void; onPublished: () => Promise<void> }) {
  const [form, setForm] = useState(emptyForm);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const advisories = useQuery({ queryKey: ["farmer-inquiries", "advisories"], queryFn: ({ signal }) => listValidatedAdvisories(signal), retry: false });
  const update = (patch: Partial<typeof emptyForm>) => setForm(current => ({ ...current, ...patch }));
  const valid = form.advisory_uuid && form.headline_tl.trim() && form.headline_en.trim() && form.body_tl.trim() && form.body_en.trim() && (form.all || form.barangays.length > 0);
  function pick(uuid: string) {
    const advisory = advisories.data?.find(item => item.uuid === uuid);
    // Start from the validated wording; the office writes the Tagalog.
    update({ advisory_uuid: uuid, headline_en: advisory ? advisory.title : "", body_en: advisory ? advisory.content : "" });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || !valid) return;
    setPending(true);
    setError("");
    const command: BroadcastCommand = {
      advisory_uuid: form.advisory_uuid, headline_tl: form.headline_tl.trim(), headline_en: form.headline_en.trim(), body_tl: form.body_tl.trim(), body_en: form.body_en.trim(),
      all_barangays: form.all, barangays: form.all ? [] : form.barangays, expires_in_days: form.expires_in_days,
    };
    try {
      await publishFarmerBroadcast(command);
      await onPublished();
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status === 422
        ? (failure.errors ? Object.values(failure.errors).flat().join(" ") : failure.message)
        : "Not confirmed. Reload the list and check before publishing again.");
    } finally {
      setPending(false);
    }
  }
  return <Modal id="publish-broadcast" title="Publish broadcast" open onClose={() => { if (!pending) onClose(); }} disabled={pending}>
    <form className="settings-form" onSubmit={submit}>
      {error ? <p role="alert">{error}</p> : null}
      <label className="settings-field"><span>Validated advisory</span>
        <select value={form.advisory_uuid} required disabled={pending} onChange={event => pick(event.target.value)}>
          <option value="">Choose an advisory</option>
          {(advisories.data ?? []).map(advisory => <option key={advisory.uuid} value={advisory.uuid}>{advisory.code} · {advisory.title}</option>)}
        </select>
      </label>
      <label className="settings-field"><span>Headline (Tagalog)</span><input type="text" maxLength={160} value={form.headline_tl} disabled={pending} onChange={event => update({ headline_tl: event.target.value })} /></label>
      <label className="settings-field"><span>Headline (English)</span><input type="text" maxLength={160} value={form.headline_en} disabled={pending} onChange={event => update({ headline_en: event.target.value })} /></label>
      <label className="settings-field"><span>Message (Tagalog)</span><textarea rows={3} maxLength={2000} value={form.body_tl} disabled={pending} onChange={event => update({ body_tl: event.target.value })} /></label>
      <label className="settings-field"><span>Message (English)</span><textarea rows={3} maxLength={2000} value={form.body_en} disabled={pending} onChange={event => update({ body_en: event.target.value })} /></label>
      <fieldset className="settings-field" disabled={pending}>
        <legend>Barangays</legend>
        <label><input type="radio" name="reach" checked={form.all} onChange={() => update({ all: true })} /> All barangays</label>
        <label><input type="radio" name="reach" checked={!form.all} onChange={() => update({ all: false })} /> Selected barangays</label>
        {!form.all ? <div className="accounts-actions">{knownBarangays.map(name => <label key={name}>
          <input type="checkbox" checked={form.barangays.includes(name)} onChange={event => update({ barangays: event.target.checked ? [...form.barangays, name] : form.barangays.filter(item => item !== name) })} /> {name}
        </label>)}</div> : null}
      </fieldset>
      <label className="settings-field"><span>Shown for</span>
        <select value={form.expires_in_days} disabled={pending} onChange={event => update({ expires_in_days: Number(event.target.value) })}>
          {[7, 14, 30, 60].map(days => <option key={days} value={days}>{days} days</option>)}
        </select>
      </label>
      <div className="accounts-actions">
        <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={pending || !valid}>{pending ? "Publishing…" : "Publish"}</Button>
      </div>
    </form>
  </Modal>;
}
