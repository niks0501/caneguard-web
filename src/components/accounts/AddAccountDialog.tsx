import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../../api/ApiError";
import { createAccount, newAccountRoles } from "../../services/accountsAdmin.api";
import type { NewAccountRole } from "../../services/accountsAdmin.api";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

const emptyForm = { name: "", email: "", role: "reviewer" as NewAccountRole, password: "" };
const nextSteps: Record<NewAccountRole, string> = {
  farmer: "Next step: Farmer mobile sign-in is currently limited, so hold this account and contact support instead of sending them to mobile sign-in.",
  field_reporter: "Next step: Tell them to sign in through the mobile app.",
  reviewer: "Next step: Tell them to sign in at the web sign-in page, then use the web workspace.",
  admin: "Next step: Tell them to sign in at the web sign-in page, then use the web workspace.",
};
const inviteFallbacks: Record<NewAccountRole, string> = {
  farmer: "They can still set a password from the sign-in page.",
  field_reporter: "They can request a link from the sign-in page.",
  reviewer: "They can request a link from the sign-in page.",
  admin: "They can request a link from the sign-in page.",
};

export function AddAccountDialog({ onCreated }: { onCreated: (notice: string) => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const id = "add-account";
  const update = (patch: Partial<typeof emptyForm>) => setForm(current => ({ ...current, ...patch }));
  function close() {
    if (pending) return;
    setOpen(false);
    setForm(emptyForm);
    setError("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const { name, email, role, password } = form;
      const created = await createAccount({ name: name.trim(), email: email.trim(), role }, password);
      setOpen(false);
      setForm(emptyForm);
      const inviteNotice = created.invite_sent
        ? `Account created for ${created.data.name}. A set-password link was emailed to ${created.data.email}.`
        : `Account created for ${created.data.name}, but the set-password email could not be sent. ${inviteFallbacks[created.data.role]}`;
      await onCreated(`${inviteNotice} ${nextSteps[created.data.role]}`);
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status === 422
        ? (failure.errors ? Object.values(failure.errors).flat().join(" ") : failure.message)
        : "Account creation not confirmed. Search for the email before trying again.");
      update({ password: "" });
    } finally {
      setPending(false);
    }
  }
  return <>
    <Button onClick={() => setOpen(true)}>Add account</Button>
    <Modal id={id} title="Add account" open={open} onClose={close} disabled={pending}>
      <form className="settings-form" onSubmit={submit}>
        {error ? <p id={`${id}-error`} role="alert">{error}</p> : null}
        <label className="settings-field"><span>Full name</span>
          <input type="text" autoComplete="off" value={form.name} required maxLength={255} disabled={pending} onChange={event => update({ name: event.target.value })} />
        </label>
        <label className="settings-field"><span>Work email</span>
          <input type="email" autoComplete="off" value={form.email} required maxLength={255} disabled={pending} onChange={event => update({ email: event.target.value })} />
        </label>
        <label className="settings-field"><span>Role</span>
          <select value={form.role} disabled={pending} onChange={event => update({ role: event.target.value as NewAccountRole })}>
            {Object.entries(newAccountRoles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="settings-field"><span>Your current password</span>
          <input type="password" autoComplete="current-password" value={form.password} required maxLength={255} disabled={pending} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={event => update({ password: event.target.value })} />
        </label>
        <div className="accounts-actions">
          <Button type="button" variant="secondary" disabled={pending} onClick={close}>Cancel</Button>
          <Button type="submit" disabled={pending || !form.name.trim() || !form.email.trim() || !form.password}>{pending ? "Creating…" : "Create account"}</Button>
        </div>
      </form>
    </Modal>
  </>;
}
