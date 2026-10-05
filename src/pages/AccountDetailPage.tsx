import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/ApiError";
import { useAuth } from "../auth/useAuth";
import { routes } from "../app/routes";
import { DetailField, PageContent, PageHeader } from "../components/layout/Page";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Pagination } from "../components/ui/Pagination";
import { ErrorState, LoadingState } from "../components/ui/States";
import { formatDateTime } from "../lib/formatters";
import { changeAccount, getAccount, getAccountEvents, isSupportedAccount, keyLabels, membershipLabels, roleLabels } from "../services/accountsAdmin.api";
import type { Account, AccountCommand, AccountKey, AccountsPolicy } from "../services/accountsAdmin.api";

function keysText(keys: string[]) { return keys.map(key => keyLabels[key as AccountKey] ?? key).join(", ") || "None"; }

export function AccountDetailPage() {
  const { uuid = "" } = useParams();
  return <AccountDetailSurface key={uuid} uuid={uuid} />;
}

function AccountDetailSurface({ uuid }: { uuid: string }) {
  const auth = useAuth();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["accounts", auth.user?.uuid, uuid], queryFn: ({ signal }) => getAccount(uuid, signal), retry: false, gcTime: 0 });
  const [notice, setNotice] = useState("");
  useEffect(() => { document.title = "Account detail | CaneGuard"; }, []);
  // Keying the whole surface by UUID ensures no prior identity/form/history survives a deep-link change.
  return <PageContent className="accounts-page">
    <Link className="accounts-back" to={routes.accounts}>Back to accounts</Link>
    <div role="status" aria-live="polite">{notice}</div>
    {query.isPending ? <LoadingState message="Loading account…" /> : query.isError ? <ErrorState message="Account details are unavailable or outside your scope." onRetry={() => { void query.refetch(); void auth.restoreSession(); }} /> : query.data ? (
      <AccountWorkspace key={`${uuid}:${query.data.data.access_version}`} account={query.data.data} policy={query.data.policy} onNotice={setNotice} onRefresh={async () => {
        await client.invalidateQueries({ queryKey: ["accounts"] });
        await auth.restoreSession();
        const result = await query.refetch();
        return result.isError ? null : result.data?.data ?? null;
      }} />
    ) : null}
  </PageContent>;
}

function AccountWorkspace({ account, policy, onNotice, onRefresh }: { account: Account; policy: AccountsPolicy; onNotice: (message: string) => void; onRefresh: () => Promise<Account | null> }) {
  const [role, setRole] = useState(account.membership_state === "active" && account.role !== "farmer" ? account.role : "");
  const [keys, setKeys] = useState<AccountKey[]>(account.membership_state === "active" ? account.stored_grants.filter((key): key is AccountKey => Object.hasOwn(keyLabels, key)) : []);
  const [reference, setReference] = useState("");
  const [confirmation, setConfirmation] = useState<{ command: AccountCommand; title: string; key: string } | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const actions = isSupportedAccount(account) ? account.allowed_actions : [];
  const operation = account.membership_state === "not_issued" ? "admit" : account.membership_state === "revoked" ? "restore" : role === "farmer" ? "revoke" : "replace";
  const canEdit = actions.some(action => ["admit", "replace", "restore"].includes(action));
  const hasOtherApprover = policy.approver !== null && policy.approver.uuid !== account.uuid;
  function prepare(command: AccountCommand, title: string) {
    setError("");
    if (!reference.trim()) { setError("Enter a non-secret office approval reference."); return; }
    setPassword("");
    setUncertain(false);
    setConfirmation({ command, title, key: crypto.randomUUID() });
  }
  function close() { if (!pending) { setPassword(""); setConfirmation(null); setError(""); } }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!confirmation || pending || uncertain) return;
    setPending(true);
    setError("");
    try {
      const result = await changeAccount(account.uuid, confirmation.command, reference, password, confirmation.key);
      setPassword("");
      setConfirmation(null);
      onNotice(result.code === "ACCOUNT_ACCESS_UNCHANGED" ? "Authority unchanged." : "Change saved.");
      const refreshed = await onRefresh();
      if (!refreshed) onNotice("Change saved. Refresh to load current details.");
    } catch (failure) {
      setPassword("");
      if (failure instanceof ApiError && failure.status === 409) {
        setConfirmation(null);
        onNotice(`${failure.message} Reloaded authority must be reviewed before another confirmation.`);
        await onRefresh();
      } else if (!(failure instanceof ApiError) || failure.status === undefined || failure.status >= 500) {
        setUncertain(true);
        setError("Outcome not confirmed. Check current details and history before retrying this same operation.");
      } else {
        setError(failure.errors ? Object.values(failure.errors).flat().join(" ") : failure.message);
      }
    } finally { setPassword(""); setPending(false); }
  }
  const proposedKeys = confirmation && "desired" in confirmation.command ? confirmation.command.desired.grants : keys;
  const changedRole = confirmation && "desired" in confirmation.command ? confirmation.command.desired.role : account.role;
  const authorityChange = confirmation !== null && !("disposition" in confirmation.command);
  return <>
    <PageHeader title={account.name} description={account.email} />
    <section className="accounts-detail" aria-labelledby="account-identity-heading">
      <h2 id="account-identity-heading">Current account</h2>
      <dl className="detail-list">
        <DetailField label="Account UUID"><span className="machine-text">{account.uuid}</span></DetailField>
        <DetailField label={account.origin === "public_signup" ? "Signed up" : "Created"}>{formatDateTime(account.created_at)}</DetailField>
        <DetailField label="Email">{account.email_verified ? "Verified" : "Unverified"}</DetailField>
        <DetailField label="Role">{roleLabels[account.role] ?? `Unsupported: ${account.role}`}</DetailField>
        <DetailField label="District access">{membershipLabels[account.membership_state] ?? "Needs reconciliation"} · {policy.district.name}</DetailField>
        <DetailField label="Effective keys">{keysText(account.effective_grants)}</DetailField>
        <DetailField label="Stored keys">{keysText(account.stored_grants)}</DetailField>
        <DetailField label="Review">{({ new: "Not reviewed", keep_farmer: "Kept as farmer", defer: "Deferred", staff_assigned: "Assigned staff" } as Record<string, string>)[account.review_state] ?? account.review_state}</DetailField>
        <DetailField label="Office sign-in">{account.web_access_allowed ? "Allowed" : "Not allowed"}</DetailField>
      </dl>
      {account.denial_reasons.map(reason => <p key={reason}>{reason}</p>)}
      {!isSupportedAccount(account) ? <p>Unsupported account state. Read only; controlled operator reconciliation required.</p> : null}
    </section>
    {actions.length > 0 ? <section className="accounts-editor" aria-labelledby="account-authority-heading">
      <h2 id="account-authority-heading">Review authority</h2>
      <p>Approval key holder: {policy.approver?.name ?? "None — report approval unavailable"}</p>
      {canEdit ? <>
        <label className="settings-field"><span>Assign role</span><select value={role} onChange={e => { setRole(e.target.value); if (e.target.value !== "admin") setKeys([]); }}>
          <option value="">Select staff role</option>
          {Object.entries(roleLabels).filter(([wire]) => wire !== "farmer" || account.membership_state === "active").map(([wire, label]) => <option key={wire} value={wire}>{label}</option>)}
        </select></label>
        <fieldset className="accounts-keys"><legend>Named keys</legend>
          {Object.entries(keyLabels).map(([key, label]) => <label key={key}>
            <input type="checkbox" checked={keys.includes(key as AccountKey)} disabled={role !== "admin" || (key === "report:approve" && hasOtherApprover)} onChange={event => setKeys(current => event.target.checked ? [...current, key as AccountKey] : current.filter(value => value !== key))} />
            <span>{label}</span>
          </label>)}
        </fieldset>
        {hasOtherApprover ? <p>A second approval key cannot be issued. {policy.transfer_available ? "Use Transfer approval key on an active officer." : "Transfer requires an eligible active approval holder and a different manager; neither affected holder may act. Use controlled operator handover if needed."}</p> : null}
      </> : null}
      <label className="settings-field"><span>Office approval reference</span><input value={reference} maxLength={160} onChange={e => setReference(e.target.value)} required aria-describedby="office-reference-hint" /></label>
      <p id="office-reference-hint">Reference only; no passwords or personal documents.</p>
      {error && !confirmation ? <p role="alert">{error}</p> : null}
      <div className="accounts-actions">
        {canEdit ? <Button disabled={!role} onClick={() => prepare({ operation, expected_access_version: account.access_version, desired: { role, grants: role === "admin" ? keys : [] } }, operation === "admit" ? "Approve & assign" : operation === "restore" ? "Restore district access" : operation === "revoke" ? "Demote to farmer & revoke district access" : "Review role & keys")}>{operation === "admit" ? "Approve & assign" : operation === "restore" ? "Restore district access" : "Review changes"}</Button> : null}
        {actions.includes("keep_farmer") ? <Button variant="secondary" onClick={() => prepare({ disposition: "keep_farmer", expected_access_version: account.access_version }, "Keep as farmer")}>Keep as farmer</Button> : null}
        {actions.includes("defer") ? <Button variant="secondary" onClick={() => prepare({ disposition: "defer", expected_access_version: account.access_version }, "Defer review")}>Defer</Button> : null}
        {actions.includes("reopen") && account.review_state !== "new" ? <Button variant="secondary" onClick={() => prepare({ disposition: "reopen", expected_access_version: account.access_version }, "Return to review")}>Return to review</Button> : null}
        {actions.includes("revoke") ? <Button variant="danger" onClick={() => prepare({ operation: "revoke", expected_access_version: account.access_version, desired: { role: account.role, grants: [] } }, "Revoke district access")}>Revoke district access</Button> : null}
        {actions.includes("transfer") && policy.transfer_available && policy.approver ? <Button variant="secondary" onClick={() => { if (policy.approver) prepare({ from_uuid: policy.approver.uuid, to_uuid: account.uuid, from_expected_access_version: policy.approver.access_version, to_expected_access_version: account.access_version }, "Transfer approval key"); }}>Transfer approval key</Button> : null}
      </div>
    </section> : null}
    <AccountHistory key={account.uuid} uuid={account.uuid} />
    <Modal id="account-confirmation" title={confirmation?.title ?? "Confirm authority"} open={confirmation !== null} onClose={close} disabled={pending}>
      {confirmation ? <form className="settings-form" onSubmit={submit}>
        <p><strong>{account.name}</strong> · {account.email}</p>
        {"from_uuid" in confirmation.command ? <p>Move Approve reports from {policy.approver?.name} ({confirmation.command.from_uuid}) to {account.name} ({account.uuid}). Membership and other keys remain unchanged. The old approval key and both accounts’ credentials will be revoked.</p> : authorityChange ? <dl className="detail-list">
          <DetailField label="Role">{roleLabels[account.role]} → {roleLabels[changedRole]}</DetailField>
          <DetailField label="District access">{membershipLabels[account.membership_state]} → {"operation" in confirmation.command && confirmation.command.operation === "revoke" ? "Revoked" : "Active"}</DetailField>
          <DetailField label="Current keys">{keysText(account.stored_grants)}</DetailField>
          <DetailField label="Confirmed keys">{keysText(proposedKeys)}</DetailField>
          <DetailField label="Added">{keysText(proposedKeys.filter(key => !account.stored_grants.includes(key)))}</DetailField>
          <DetailField label="Removed">{keysText(account.stored_grants.filter(key => !proposedKeys.includes(key as AccountKey)))}</DetailField>
        </dl> : <p>Triage only. No membership, keys, email verification or farmer sign-in changes.</p>}
        <p>Office reference: <strong>{reference}</strong></p>
        {authorityChange && account.impact ? <p>{account.impact.historical_approvals} historical approvals · {account.impact.pending_deliveries} pending deliveries require authority rechecks.</p> : null}
        {authorityChange ? <p>The affected account will be signed out. Old approval authority and pending deliveries are rechecked. Identity and official history remain intact.</p> : null}
        {error ? <p id="account-submit-error" role="alert">{error}</p> : null}
        <label className="settings-field"><span>Your current password</span><input type="password" autoComplete="current-password" value={password} required maxLength={255} disabled={pending || uncertain} aria-invalid={Boolean(error)} aria-describedby={error ? "account-submit-error" : undefined} onChange={e => setPassword(e.target.value)} /></label>
        {uncertain ? <Button type="button" variant="secondary" disabled={pending} onClick={async () => {
          setPending(true);
          const current = await onRefresh();
          setPending(false);
          if (current && current.access_version === account.access_version) { setUncertain(false); setError("Current version is unchanged. You may retry the same keyed operation with a fresh password."); }
          else if (current) { close(); onNotice("Current authority changed. Review the refreshed details and history; do not resubmit blindly."); }
        }}>Check current details and history</Button> : null}
        <div className="accounts-actions"><Button type="button" variant="secondary" disabled={pending} onClick={close}>Cancel</Button><Button type="submit" disabled={pending || uncertain || !password}>{pending ? "Saving…" : `Confirm ${confirmation.title.toLowerCase()}`}</Button></div>
      </form> : null}
    </Modal>
  </>;
}

function AccountHistory({ uuid }: { uuid: string }) {
  const [page, setPage] = useState(1);
  const auth = useAuth();
  const query = useQuery({ queryKey: ["accounts", auth.user?.uuid, uuid, "events", page], queryFn: ({ signal }) => getAccountEvents(uuid, page, signal), retry: false, gcTime: 0 });
  return <section className="accounts-history" aria-labelledby="account-history-heading">
    <h2 id="account-history-heading">Access history</h2>
    {query.isPending ? <LoadingState message="Loading access history…" /> : query.isError ? <ErrorState message="Access history could not be loaded." onRetry={() => void query.refetch()} /> : query.data ? <>
      {query.data.meta.history_completeness !== "since_registration" ? <p>Earlier grant history unavailable.</p> : null}
      {query.data.data.length === 0 ? <p>No recorded access decisions.</p> : <ol className="accounts-timeline">{query.data.data.map(event => <li key={event.id}>
        <header><strong>{event.action.replaceAll("_", " ")}</strong><time dateTime={event.occurred_at}>{formatDateTime(event.occurred_at)}</time></header>
        <p>{event.actor.name ?? "Controlled operator"} · {event.office_reference}</p>
        <p>{roleLabels[event.before.role] ?? event.before.role} → {roleLabels[event.after.role] ?? event.after.role}; {membershipLabels[event.before.membership_state] ?? event.before.membership_state} → {membershipLabels[event.after.membership_state] ?? event.after.membership_state}</p>
        <p>Keys: {keysText(event.before.grants.filter(g => !g.revoked).map(g => g.ability))} → {keysText(event.after.grants.filter(g => !g.revoked).map(g => g.ability))}</p>
        <details><summary>Decision evidence</summary><p className="machine-text">Operation {event.operation_id} · {event.contract_version}</p><p>Review: {event.before.review_state} → {event.after.review_state}</p><ul>{event.after.grants.map(grant => <li key={grant.id}>{keyLabels[grant.ability as AccountKey] ?? grant.ability}: ID {grant.id}, revision {grant.revision}, {grant.revoked ? "revoked" : "current"}</li>)}</ul></details>
      </li>)}</ol>}
      {query.data.meta.total > query.data.meta.per_page ? <Pagination currentPage={page} pageCount={Math.ceil(query.data.meta.total / query.data.meta.per_page)} itemCount={query.data.meta.total} itemLabel="decisions" onPageChange={setPage} /> : null}
    </> : null}
  </section>;
}
