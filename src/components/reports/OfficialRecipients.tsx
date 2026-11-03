import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { axiosClient } from "../../api/axiosClient";
import { toApiError } from "../../api/ApiError";
import { env } from "../../config/env";
import { formatDateTime } from "../../lib/formatters";
import { Button } from "../ui/Button";

const schema = z.object({
  data: z.array(z.object({
    id: z.number().int(), recipients: z.array(z.string()), office_reference: z.string(),
    created_at: z.string().nullable(), revoked_at: z.string().nullable(),
  })),
});
type RecipientInput = { recipients: string[]; office_reference: string; current_password: string };
const MAX_RECIPIENTS = 20;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Splits on commas, semicolons and whitespace; blank entries are dropped. */
function parseRecipients(text: string) {
  return text.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
}

function RecipientForm({ onSave, busy }: { onSave: (input: RecipientInput) => void; busy: boolean }) {
  const [text, setText] = useState("");
  const [reference, setReference] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  return <form className="settings-form" onSubmit={(event) => {
    event.preventDefault();
    if (busy) return;
    const recipients = parseRecipients(text);
    if (recipients.length < 1 || recipients.length > MAX_RECIPIENTS) { setProblem(`Enter 1 to ${MAX_RECIPIENTS} email addresses.`); return; }
    const bad = recipients.find((email) => !emailPattern.test(email));
    if (bad) { setProblem(`"${bad}" is not a valid email address.`); return; }
    setProblem(null);
    onSave({ recipients, office_reference: reference, current_password: password });
    setPassword("");
  }}>
    <label className="settings-field"><span>Recipient emails</span><textarea value={text} rows={3} required onChange={(event) => setText(event.target.value)} /></label>
    <label className="settings-field"><span>Office decision reference</span><input value={reference} maxLength={160} required onChange={(event) => setReference(event.target.value)} /></label>
    <label className="settings-field"><span>Current password</span><input type="password" autoComplete="current-password" value={password} required onChange={(event) => setPassword(event.target.value)} /></label>
    {problem ? <p role="alert">{problem}</p> : null}
    <div className="settings-form__actions"><Button type="submit" disabled={busy}>{busy ? "Replacing recipients..." : "Replace recipients"}</Button></div>
  </form>;
}

export function OfficialRecipients() {
  const queryClient = useQueryClient();
  const key = ["district-recipient-sets"];
  const query = useQuery({
    queryKey: key, retry: false, enabled: env.dataSource === "api",
    queryFn: async ({ signal }) => schema.parse((await axiosClient.get("/api/v1/district-recipient-sets", { signal })).data).data,
  });
  const replace = useMutation({
    retry: false,
    mutationFn: async (input: RecipientInput) => {
      if (!navigator.onLine) throw new Error("An online connection is required.");
      return axiosClient.post("/api/v1/district-recipient-sets/replace", input);
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      queryClient.invalidateQueries({ queryKey: ["district-report-versions"] }),
    ]),
  });
  if (env.dataSource !== "api") return null;
  const sets = query.data ?? [];
  const current = sets.find((set) => set.revoked_at === null);
  const history = sets.filter((set) => set.revoked_at !== null);
  const error = replace.error ?? query.error;
  const status = error ? toApiError(error).status : undefined;
  return <section className="settings-card settings-card--wide" aria-labelledby="recipients-heading">
    <div className="section-heading"><h2 id="recipients-heading">Official recipients</h2></div>
    {query.isLoading ? <p role="status">Loading official recipients...</p> : null}
    {query.data ? current
      ? <div aria-label="Current recipients"><p>Current set · {current.office_reference}{current.created_at ? ` · ${formatDateTime(current.created_at)}` : ""}</p><ul>{current.recipients.map((email) => <li key={email}>{email}</li>)}</ul></div>
      : <p>No official recipients configured.</p> : null}
    {history.length ? <details><summary>History ({history.length})</summary><ul>{history.map((set) => <li key={set.id}>{set.office_reference} · {set.recipients.length} {set.recipients.length === 1 ? "recipient" : "recipients"} · revoked {set.revoked_at ? formatDateTime(set.revoked_at) : ""}</li>)}</ul></details> : null}
    {query.data ? <RecipientForm busy={replace.isPending} onSave={(input) => replace.mutate(input)} /> : null}
    {replace.isSuccess ? <p role="status">Recipients replaced. The previous set is revoked.</p> : null}
    {error ? <p role="alert">{status === 403 ? "Your Admin access or password could not be verified." : status === 422 ? "Check the email addresses and office reference." : "The official recipients could not be saved or loaded. Try again when online."}</p> : null}
  </section>;
}
