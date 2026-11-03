import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { axiosClient } from "../../api/axiosClient";
import { toApiError } from "../../api/ApiError";
import { env } from "../../config/env";
import { Button } from "../ui/Button";

const schema = z.object({ data: z.object({ reminder_day: z.number().int().nullable(), reminder_time: z.string().nullable(), timezone: z.literal("Asia/Manila"), can_manage: z.boolean() }) });
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
type ScheduleInput = { reminder_day: number; reminder_time: string; office_reference: string; current_password: string };
function clock(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function ScheduleForm({ initialDay, initialTime, onSave, busy }: { initialDay: number | null; initialTime: string | null; onSave: (input: ScheduleInput) => void; busy: boolean }) {
  const [initialHour, initialMinute] = (initialTime ?? "09:00").split(":").map(Number);
  const [day, setDay] = useState(String(initialDay ?? 1));
  const [hour, setHour] = useState(String(initialHour % 12 || 12));
  const [minute, setMinute] = useState(String(initialMinute).padStart(2, "0"));
  const [meridiem, setMeridiem] = useState(initialHour >= 12 ? "PM" : "AM");
  const [reference, setReference] = useState("");
  const [password, setPassword] = useState("");
  return <form className="settings-form" onSubmit={(event) => {
    event.preventDefault();
    if (busy) return;
    const time = `${String((Number(hour) % 12) + (meridiem === "PM" ? 12 : 0)).padStart(2, "0")}:${minute}`;
    onSave({ reminder_day: Number(day), reminder_time: time, office_reference: reference, current_password: password });
    setPassword("");
  }}>
    <div className="settings-field-row">
      <label className="settings-field"><span>Preparation day</span><select value={day} onChange={(event) => setDay(event.target.value)}>{days.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></label>
      <fieldset className="settings-field"><legend>Preparation time · PHT</legend><div className="report-builder__actions">
        <label>Hour <select value={hour} onChange={(event) => setHour(event.target.value)}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select></label>
        <label>Minute <select value={minute} onChange={(event) => setMinute(event.target.value)}>{Array.from({ length: 60 }, (_, index) => <option key={index}>{String(index).padStart(2, "0")}</option>)}</select></label>
        <label>AM or PM <select value={meridiem} onChange={(event) => setMeridiem(event.target.value)}><option>AM</option><option>PM</option></select></label>
      </div></fieldset>
    </div>
    <label className="settings-field"><span>Office decision reference</span><input value={reference} maxLength={160} required onChange={(event) => setReference(event.target.value)} /></label>
    <label className="settings-field"><span>Current password</span><input type="password" autoComplete="current-password" value={password} required onChange={(event) => setPassword(event.target.value)} /></label>
    <div className="settings-form__actions"><Button type="submit" disabled={busy}>{busy ? "Saving schedule..." : "Save reporting schedule"}</Button></div>
  </form>;
}

export function WeeklyReportingSettings() {
  const query = useQuery({
    queryKey: ["district-reporting-settings"], retry: false, enabled: env.dataSource === "api",
    queryFn: async ({ signal }) => schema.parse((await axiosClient.get("/api/v1/district-reporting-settings", { signal })).data).data,
  });
  const save = useMutation({
    retry: false,
    mutationFn: async (input: ScheduleInput) => {
      if (!navigator.onLine) throw new Error("An online connection is required.");
      return axiosClient.put("/api/v1/district-reporting-settings", input);
    },
    onSuccess: () => query.refetch(),
  });
  if (env.dataSource !== "api") return null;
  const settings = query.data;
  const error = save.error ?? query.error;
  return <section className="settings-card settings-card--wide" aria-labelledby="weekly-settings-heading">
    <div className="section-heading"><h2 id="weekly-settings-heading">Weekly reporting schedule</h2></div>
    <p>Monday–Sunday receipt weeks, Asia/Manila. This preparation schedule never approves or sends a report automatically.</p>
    {query.isLoading ? <p role="status">Loading reporting schedule...</p> : null}
    {settings ? <p>Current schedule: {settings.reminder_day && settings.reminder_time ? `${days[settings.reminder_day - 1]} at ${clock(settings.reminder_time)} PHT` : "Not configured"}</p> : null}
    {settings?.can_manage ? <ScheduleForm key={`${settings.reminder_day}:${settings.reminder_time}`} initialDay={settings.reminder_day} initialTime={settings.reminder_time} busy={save.isPending} onSave={(input) => save.mutate(input)} /> : null}
    {save.isSuccess ? <p role="status">Reporting schedule saved. Sending remains manual.</p> : null}
    {error ? <p role="alert">{toApiError(error).status === 403 ? "Your Admin access or password could not be verified." : "The reporting schedule could not be saved or loaded. Try again when online."}</p> : null}
  </section>;
}
