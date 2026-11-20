import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { routes } from "../../app/routes";
import { ApiError } from "../../api/ApiError";
import { useAuth } from "../../auth/useAuth";
import { changeFieldAccess, listFieldAccounts, resendFieldInvite } from "../../services/accountsAdmin.api";
import type { FieldAccount } from "../../services/accountsAdmin.api";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Pagination } from "../ui/Pagination";
import { ErrorState, LoadingState } from "../ui/States";

export function FieldAccountsSection() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search), 300); return () => window.clearTimeout(timer); }, [search]);
  const query = useQuery({ queryKey: ["accounts", user?.uuid, "field", page, debouncedSearch], queryFn: ({ signal }) => listFieldAccounts(page, debouncedSearch, signal), retry: false, gcTime: 0 });
  const result = query.data;
  return <section className="accounts-field" aria-labelledby="accounts-field-heading">
    <h2 id="accounts-field-heading">Field accounts</h2>
    {notice ? <p role="status">{notice}</p> : null}
    <div className="accounts-filters">
      <label className="settings-field"><span>Search field accounts</span><input type="search" maxLength={160} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
    </div>
    {query.isPending ? <LoadingState message="Loading field accounts…" /> : query.isError ? <ErrorState message="Field accounts could not be loaded." onRetry={() => void query.refetch()} /> : result ? <>
      {result.data.length === 0 ? <p role="status">{debouncedSearch.trim() ? "No matching field accounts." : "No field accounts."}</p> : <table className="report-table accounts-table">
        <caption className="sr-only">Field accounts</caption>
        <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
        <tbody>{result.data.map(account => <FieldRow key={`${account.uuid}:${account.access_version}`} account={account} onNotice={setNotice} onSaved={() => client.invalidateQueries({ queryKey: ["accounts"] })} />)}</tbody>
      </table>}
      <Pagination currentPage={result.meta.page} pageCount={Math.max(1, Math.ceil(result.meta.total / result.meta.per_page))} itemCount={result.meta.total} itemLabel="field accounts" onPageChange={setPage} />
    </> : null}
  </section>;
}

const fieldActions = {
  admit: { verb: "Admit", done: "admitted", effect: "This admits the account to the area. The person signs in again." },
  revoke: { verb: "Disable", done: "disabled", effect: "This ends the account's area membership and signs the phone out." },
  restore: { verb: "Re-enable", done: "re-enabled", effect: "This restores the account's area membership. The person signs in again." },
} as const;

function FieldRow({ account, onNotice, onSaved }: { account: FieldAccount; onNotice: (notice: string) => void; onSaved: () => Promise<void> }) {
  const action = (["admit", "revoke", "restore"] as const).find(candidate => account.allowed_actions.includes(candidate));
  const { verb, done, effect } = fieldActions[action ?? "restore"];
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [reference, setReference] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const key = useRef("");
  const id = `field-account-${account.uuid}`;
  function close() {
    if (pending) return;
    setOpen(false);
    setPassword("");
    setReference("");
    setError("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || !action) return;
    setPending(true);
    setError("");
    key.current ||= crypto.randomUUID();
    try {
      await changeFieldAccess(account.uuid, { operation: action, role: account.role, expected_access_version: account.access_version, office_reference: reference, idempotency_key: key.current }, password);
      setOpen(false);
      onNotice(`${account.name} ${done}.`);
      await onSaved();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 422) {
        key.current = "";
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
  const invitePending = account.invite_pending && account.is_active;
  const [resending, setResending] = useState(false);
  async function resend() {
    if (resending) return;
    setResending(true);
    onNotice("");
    try {
      const { invite_sent } = await resendFieldInvite(account.uuid);
      onNotice(invite_sent ? `Set-password link sent to ${account.email}.` : `The set-password email to ${account.email} could not be sent. Try again later.`);
    } catch (failure) {
      onNotice(failure instanceof ApiError && failure.status === 429
        ? "A set-password link was issued a moment ago. Wait a minute before sending another."
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
    <td data-label="Status">{!account.is_active ? "Disabled" : invitePending ? "Invite pending" : account.membership_state === "not_issued" ? "Not admitted" : "Active"}</td>
    <td data-label="Action">
      <Link className="accounts-open" to={routes.accountDetail(account.uuid)} aria-label={`History for ${account.name}`}>History</Link>
      {invitePending ? <Button variant="secondary" disabled={resending} aria-label={`Resend set-password link to ${account.name}`} onClick={() => void resend()}>{resending ? "Sending…" : "Resend link"}</Button> : null}
      {action ? <>
        <Button disabled={pending} aria-label={`${verb} ${account.name}`} onClick={() => { onNotice(""); setError(""); setPassword(""); setOpen(true); }}>{verb}</Button>
        <Modal id={id} title={`${verb} field account`} open={open} onClose={close} disabled={pending}>
          <form className="settings-form" onSubmit={submit}>
            <p><strong>{account.name}</strong> · {account.email}</p>
            <p>{effect}</p>
            {error ? <p id={`${id}-error`} role="alert">{error}</p> : null}
            <label className="settings-field"><span>Office reference</span>
              <input type="text" value={reference} required maxLength={160} disabled={pending} placeholder="e.g. SRA-2026-114" aria-describedby={`${id}-reference-hint`} onChange={event => setReference(event.target.value)} />
            </label>
            <p className="settings-field-hint" id={`${id}-reference-hint`}>Memo or ticket number for the audit record.</p>
            <label className="settings-field"><span>Your current password</span>
              <input type="password" autoComplete="current-password" value={password} required maxLength={255} disabled={pending} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={event => setPassword(event.target.value)} />
            </label>
            <div className="accounts-actions">
              <Button type="button" variant="secondary" disabled={pending} onClick={close}>Cancel</Button>
              <Button type="submit" disabled={pending || !password || !reference.trim()}>{pending ? "Saving…" : `Confirm ${verb.toLowerCase()}`}</Button>
            </div>
          </form>
        </Modal>
      </> : <span>{account.denial_reasons.join(" ")}</span>}
    </td>
  </tr>;
}
