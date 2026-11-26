import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { routes } from "../../app/routes";
import { ApiError } from "../../api/ApiError";
import { useAuth } from "../../auth/useAuth";
import { knownBarangays } from "../../domain/locationScope";
import { changeFarmerAccount, farmerStatuses, listFarmerAccounts, resendFieldInvite } from "../../services/accountsAdmin.api";
import type { FarmerAccount, FarmerFilters } from "../../services/accountsAdmin.api";
import { Button } from "../ui/Button";
import { PasswordInput } from "../ui/FormControls";
import { Modal } from "../ui/Modal";
import { Pagination } from "../ui/Pagination";
import { ErrorState, LoadingState } from "../ui/States";

export function FarmerAccountsSection() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [barangay, setBarangay] = useState("");
  const [status, setStatus] = useState<FarmerFilters["status"]>("");
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search), 300); return () => window.clearTimeout(timer); }, [search]);
  const filters: FarmerFilters = { page, search: debouncedSearch, barangay, status };
  const query = useQuery({ queryKey: ["accounts", user?.uuid, "farmers", filters], queryFn: ({ signal }) => listFarmerAccounts(filters, signal), retry: false, gcTime: 0 });
  const result = query.data;
  const filtered = Boolean(debouncedSearch.trim() || barangay || status);
  return <section className="accounts-field" aria-labelledby="accounts-farmers-heading">
    <h2 id="accounts-farmers-heading">Farmer accounts</h2>
    {notice ? <p role="status">{notice}</p> : null}
    <div className="accounts-filters">
      <label className="settings-field"><span>Search farmer accounts</span><input type="search" maxLength={160} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      <label className="settings-field"><span>Home barangay</span>
        <select value={barangay} onChange={event => { setBarangay(event.target.value); setPage(1); }}>
          <option value="">All barangays</option>
          {knownBarangays.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <label className="settings-field"><span>Account status</span>
        <select value={status} onChange={event => { setStatus(event.target.value as FarmerFilters["status"]); setPage(1); }}>
          <option value="">All statuses</option>
          {Object.entries(farmerStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
    </div>
    {query.isPending ? <LoadingState message="Loading farmer accounts…" /> : query.isError ? <ErrorState message="Farmer accounts could not be loaded." onRetry={() => void query.refetch()} /> : result ? <>
      {result.data.length === 0 ? <p role="status">{filtered ? "No matching farmer accounts." : "No farmer accounts."}</p> : <table className="report-table accounts-table">
        <caption className="sr-only">Farmer accounts</caption>
        <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Home barangay</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
        <tbody>{result.data.map(account => <FarmerRow key={`${account.uuid}:${account.access_version}`} account={account} onNotice={setNotice} onSaved={() => client.invalidateQueries({ queryKey: ["accounts"] })} />)}</tbody>
      </table>}
      <Pagination currentPage={result.meta.page} pageCount={Math.max(1, Math.ceil(result.meta.total / result.meta.per_page))} itemCount={result.meta.total} itemLabel="farmer accounts" onPageChange={setPage} />
    </> : null}
  </section>;
}

function FarmerRow({ account, onNotice, onSaved }: { account: FarmerAccount; onNotice: (notice: string) => void; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [resending, setResending] = useState(false);
  const id = `farmer-account-${account.uuid}`;
  const disabling = account.is_active;
  const verb = disabling ? "Disable" : "Re-enable";
  function close() {
    if (pending) return;
    setOpen(false);
    setPassword("");
    setError("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await changeFarmerAccount(account.uuid, { is_active: !account.is_active, expected_access_version: account.access_version }, password);
      setOpen(false);
      onNotice(`${account.name} ${disabling ? "disabled" : "re-enabled"}.`);
      await onSaved();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 422) {
        setError(failure.errors ? Object.values(failure.errors).flat().join(" ") : failure.message);
      } else {
        setOpen(false);
        onNotice(failure instanceof ApiError && failure.status === 409
          ? "Account changed. Reload the list and review it before trying again."
          : "Change not confirmed. Reload the list and check the account before trying again.");
        await onSaved();
      }
    } finally {
      setPassword("");
      setPending(false);
    }
  }
  async function resend() {
    if (resending) return;
    setResending(true);
    onNotice("");
    try {
      const { invite_sent } = await resendFieldInvite(account.uuid);
      onNotice(invite_sent ? "Set-password link sent." : "The set-password email could not be sent. If mail is unavailable, an operator can issue a set-password link by following the production runbook's fallback steps.");
    } catch (failure) {
      onNotice(failure instanceof ApiError && failure.status === 429
        ? "Wait a minute before sending another set-password link."
        : failure instanceof ApiError && failure.status === 409
          ? "This account has no pending invite. Reload the list."
          : "The link was not confirmed sent. Check the account before trying again.");
    } finally {
      setResending(false);
    }
  }
  return <tr>
    <td data-label="Name">{account.name}</td>
    <td data-label="Email">{account.email}</td>
    <td data-label="Home barangay">{account.barangay ?? "Not set"}</td>
    <td data-label="Status">{farmerStatuses[account.status]}</td>
    <td data-label="Action">
      <div className="accounts-row-actions">
        <Link className="accounts-open button button--secondary" to={routes.accountDetail(account.uuid)} aria-label={`History for ${account.name}`}>History</Link>
        {account.status === "invite_pending" ? <Button variant="secondary" disabled={resending} aria-label={`Resend set-password link to ${account.name}`} onClick={() => void resend()}>{resending ? "Sending…" : "Resend link"}</Button> : null}
        <Button disabled={pending} aria-label={`${verb} ${account.name}`} onClick={() => { onNotice(""); setError(""); setPassword(""); setOpen(true); }}>{verb}</Button>
      </div>
      <Modal id={id} title={`${verb} farmer account`} open={open} onClose={close} disabled={pending}>
        <form className="settings-form" onSubmit={submit}>
          <p><strong>{account.name}</strong> · {account.email}</p>
          <p>{disabling ? "This signs the farmer out of the phone and blocks sign-in until the account is re-enabled. Scans already on their phone stay there." : "This lets the farmer sign in on the phone again."}</p>
          {error ? <p id={`${id}-error`} role="alert">{error}</p> : null}
          <label className="settings-field"><span>Your current password</span>
            <PasswordInput autoComplete="current-password" value={password} required maxLength={255} disabled={pending} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={event => setPassword(event.target.value)} />
          </label>
          <div className="accounts-actions">
            <Button type="button" variant="secondary" disabled={pending} onClick={close}>Cancel</Button>
            <Button type="submit" disabled={pending || !password}>{pending ? "Saving…" : `Confirm ${verb.toLowerCase()}`}</Button>
          </div>
        </form>
      </Modal>
    </td>
  </tr>;
}
