import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";
import { ApiError } from "../../api/ApiError";
import { routes } from "../../app/routes";
import { useAuth } from "../../auth/useAuth";
import { changeAccount, roleLabels } from "../../services/accountsAdmin.api";
import type { Account } from "../../services/accountsAdmin.api";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

export function AccountAccessTable({ accounts, onSaved }: { accounts: Account[]; onSaved: () => Promise<void> }) {
  const [notice, setNotice] = useState("");
  return <>
    {notice ? <p role="status">{notice}</p> : null}
    <table className="report-table accounts-table">
      <caption className="sr-only">Web user access</caption>
      <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
      <tbody>{accounts.map(account => <AccountRow key={`${account.uuid}:${account.access_version}`} account={account} onSaved={onSaved} onNotice={setNotice} />)}</tbody>
    </table>
  </>;
}

function AccountRow({ account, onSaved, onNotice }: { account: Account; onSaved: () => Promise<void>; onNotice: (notice: string) => void }) {
  const { user } = useAuth();
  const ownAccount = user?.uuid === account.uuid;
  const [role, setRole] = useState(account.role);
  const [active, setActive] = useState(account.is_active);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const id = `account-${account.uuid}`;
  const changed = role !== account.role || active !== account.is_active;
  function close() {
    if (pending) return;
    setOpen(false);
    setPassword("");
    setError("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || ownAccount) return;
    setPending(true);
    setError("");
    try {
      await changeAccount(account.uuid, { role, is_active: active, expected_access_version: account.access_version }, password);
      setOpen(false);
      onNotice(`Changes saved for ${account.name}.`);
      await onSaved();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 422) {
        setError(failure.errors ? Object.values(failure.errors).flat().join(" ") : failure.message);
      } else {
        setOpen(false);
        onNotice(failure instanceof ApiError && failure.status === 409
          ? "Account changed. Review the refreshed details before saving again."
          : "Save not confirmed. Refresh the account and check its history before trying again.");
        await onSaved();
      }
    } finally {
      setPassword("");
      setPending(false);
    }
  }
  return <tr>
    <td data-label="Name"><Link className="accounts-open" to={routes.accountDetail(account.uuid)}>{account.name}</Link></td>
    <td data-label="Email">{account.email}</td>
    <td data-label="Role"><select aria-label={`Role for ${account.name}`} value={role} disabled={ownAccount || pending || open} onChange={event => setRole(event.target.value as Account["role"])}>
      <option value="reviewer">Reviewer</option><option value="admin">Admin</option>
    </select></td>
    <td data-label="Status"><select aria-label={`Status for ${account.name}`} value={active ? "active" : "disabled"} disabled={ownAccount || pending || open} onChange={event => setActive(event.target.value === "active")}>
      <option value="active">Active</option><option value="disabled">Disabled</option>
    </select></td>
    <td data-label="Action">
      <Button disabled={ownAccount || !changed || pending} aria-label={`Save Changes for ${account.name}`} onClick={() => { onNotice(""); setError(""); setPassword(""); setOpen(true); }}>Save Changes</Button>
      <Modal id={id} title="Confirm account changes" open={open} onClose={close} disabled={pending}>
        <form className="settings-form" onSubmit={submit}>
          <p><strong>{account.name}</strong> · {account.email}</p>
          <p>{roleLabels[account.role]} → {roleLabels[role]} · {account.is_active ? "Active" : "Disabled"} → {active ? "Active" : "Disabled"}</p>
          <p>This account will be signed out. A fresh login is required after re-enabling.</p>
          {error ? <p id={`${id}-error`} role="alert">{error}</p> : null}
          <label className="settings-field"><span>Your current password</span>
            <input type="password" autoComplete="current-password" value={password} required maxLength={255} disabled={pending} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={event => setPassword(event.target.value)} />
          </label>
          <div className="accounts-actions">
            <Button type="button" variant="secondary" disabled={pending} onClick={close}>Cancel</Button>
            <Button type="submit" disabled={pending || !password}>{pending ? "Saving…" : "Confirm changes"}</Button>
          </div>
        </form>
      </Modal>
    </td>
  </tr>;
}
