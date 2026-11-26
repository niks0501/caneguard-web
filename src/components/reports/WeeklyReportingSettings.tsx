import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { axiosClient } from "../../api/axiosClient";
import { toApiError } from "../../api/ApiError";
import { env } from "../../config/env";
import { formatDateTime } from "../../lib/formatters";
import { Button } from "../ui/Button";
import { PasswordInput } from "../ui/FormControls";

const schema = z.object({
  data: z.object({
    reminder_day: z.number().int().nullable(),
    reminder_time: z.string().nullable(),
    auto_generate_enabled: z.boolean().default(true),
    auto_generate_day: z.number().int().default(1),
    auto_generate_time: z.string().default("06:00"),
    last_auto_generated_at: z.string().nullable().optional().default(null),
    last_auto_status: z.enum(["success", "failed"]).nullable().optional().default(null),
    last_auto_week: z.string().nullable().optional().default(null),
    timezone: z.literal("Asia/Manila"),
    can_manage: z.boolean(),
  }),
});

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type ScheduleInput = {
  auto_generate_enabled: boolean;
  auto_generate_day: number;
  auto_generate_time: string;
  reminder_day: number;
  reminder_time: string;
  office_reference: string;
  current_password: string;
};

function clock(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function splitClock(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return {
    hour: String(hour % 12 || 12),
    minute: String(minute).padStart(2, "0"),
    meridiem: hour >= 12 ? "PM" : "AM",
  };
}

function to24h(hour: string, minute: string, meridiem: string) {
  return `${String((Number(hour) % 12) + (meridiem === "PM" ? 12 : 0)).padStart(2, "0")}:${minute}`;
}

function ScheduleForm({
  initialAutoEnabled,
  initialAutoDay,
  initialAutoTime,
  initialDay,
  initialTime,
  onSave,
  busy,
}: {
  initialAutoEnabled: boolean;
  initialAutoDay: number;
  initialAutoTime: string;
  initialDay: number | null;
  initialTime: string | null;
  onSave: (input: ScheduleInput) => void;
  busy: boolean;
}) {
  const autoStart = splitClock(initialAutoTime || "06:00");
  const reminderStart = splitClock(initialTime ?? "09:00");

  const [autoEnabled, setAutoEnabled] = useState(initialAutoEnabled);
  const [autoDay, setAutoDay] = useState(String(initialAutoDay || 1));
  const [autoHour, setAutoHour] = useState(autoStart.hour);
  const [autoMinute, setAutoMinute] = useState(autoStart.minute);
  const [autoMeridiem, setAutoMeridiem] = useState(autoStart.meridiem);

  const [day, setDay] = useState(String(initialDay ?? 1));
  const [hour, setHour] = useState(reminderStart.hour);
  const [minute, setMinute] = useState(reminderStart.minute);
  const [meridiem, setMeridiem] = useState(reminderStart.meridiem);
  const [reference, setReference] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      className="settings-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        onSave({
          auto_generate_enabled: autoEnabled,
          auto_generate_day: Number(autoDay),
          auto_generate_time: to24h(autoHour, autoMinute, autoMeridiem),
          reminder_day: Number(day),
          reminder_time: to24h(hour, minute, meridiem),
          office_reference: reference,
          current_password: password,
        });
        setPassword("");
      }}
    >
      <label className="report-builder__check">
        <input
          type="checkbox"
          checked={autoEnabled}
          onChange={(event) => setAutoEnabled(event.target.checked)}
        />
        <span>Automatically generate weekly 5-disease and RSSI reports</span>
      </label>

      <div className="settings-field-row">
        <label className="settings-field">
          <span>Auto-generation day</span>
          <select value={autoDay} disabled={!autoEnabled} onChange={(event) => setAutoDay(event.target.value)}>
            {days.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
          </select>
        </label>
        <fieldset className="settings-field" disabled={!autoEnabled}>
          <legend>Auto-generation time · PHT</legend>
          <div className="report-builder__actions">
            <label>
              Auto-generation hour
              <select value={autoHour} onChange={(event) => setAutoHour(event.target.value)}>
                {Array.from({ length: 12 }, (_, index) => <option key={index + 1}>{index + 1}</option>)}
              </select>
            </label>
            <label>
              Auto-generation minute
              <select value={autoMinute} onChange={(event) => setAutoMinute(event.target.value)}>
                {Array.from({ length: 60 }, (_, index) => <option key={index}>{String(index).padStart(2, "0")}</option>)}
              </select>
            </label>
            <label>
              Auto-generation AM or PM
              <select value={autoMeridiem} onChange={(event) => setAutoMeridiem(event.target.value)}>
                <option>AM</option>
                <option>PM</option>
              </select>
            </label>
          </div>
        </fieldset>
      </div>

      <div className="settings-field-row">
        <label className="settings-field">
          <span>Preparation day</span>
          <select value={day} onChange={(event) => setDay(event.target.value)}>
            {days.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
          </select>
        </label>
        <fieldset className="settings-field">
          <legend>Preparation time · PHT</legend>
          <div className="report-builder__actions">
            <label>
              Hour
              <select value={hour} onChange={(event) => setHour(event.target.value)}>
                {Array.from({ length: 12 }, (_, index) => <option key={index + 1}>{index + 1}</option>)}
              </select>
            </label>
            <label>
              Minute
              <select value={minute} onChange={(event) => setMinute(event.target.value)}>
                {Array.from({ length: 60 }, (_, index) => <option key={index}>{String(index).padStart(2, "0")}</option>)}
              </select>
            </label>
            <label>
              AM or PM
              <select value={meridiem} onChange={(event) => setMeridiem(event.target.value)}>
                <option>AM</option>
                <option>PM</option>
              </select>
            </label>
          </div>
        </fieldset>
      </div>

      <label className="settings-field">
        <span>Office decision reference</span>
        <input value={reference} maxLength={160} required onChange={(event) => setReference(event.target.value)} />
      </label>
      <label className="settings-field">
        <span>Current password</span>
        <PasswordInput autoComplete="current-password" value={password} required onChange={(event) => setPassword(event.target.value)} />
      </label>
      <div className="settings-form__actions">
        <Button type="submit" disabled={busy}>{busy ? "Saving schedule..." : "Save reporting schedule"}</Button>
      </div>
    </form>
  );
}

export function WeeklyReportingSettings() {
  const query = useQuery({
    queryKey: ["district-reporting-settings"],
    retry: false,
    enabled: env.dataSource === "api",
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

  return (
    <section className="settings-card settings-card--wide" aria-labelledby="weekly-settings-heading">
      <div className="section-heading"><h2 id="weekly-settings-heading">Weekly reporting schedule</h2></div>
      <p>Monday–Sunday receipt weeks, Asia/Manila. Automatically builds weekly 5-disease and RSSI snapshots; never approves or sends a report automatically.</p>
      {query.isLoading ? <p role="status">Loading reporting schedule...</p> : null}
      {settings ? (
        <>
          <p>
            Auto-generation: {settings.auto_generate_enabled
              ? `${days[settings.auto_generate_day - 1]} at ${clock(settings.auto_generate_time)} PHT`
              : "Paused"}
            {settings.last_auto_generated_at ? ` · Last run: ${formatDateTime(settings.last_auto_generated_at)}` : ""}
          </p>
          <p>Current schedule: {settings.reminder_day && settings.reminder_time ? `${days[settings.reminder_day - 1]} at ${clock(settings.reminder_time)} PHT` : "Not configured"}</p>
        </>
      ) : null}
      {settings?.can_manage ? (
        <ScheduleForm
          key={`${settings.auto_generate_enabled}:${settings.auto_generate_day}:${settings.auto_generate_time}:${settings.reminder_day}:${settings.reminder_time}`}
          initialAutoEnabled={settings.auto_generate_enabled}
          initialAutoDay={settings.auto_generate_day}
          initialAutoTime={settings.auto_generate_time}
          initialDay={settings.reminder_day}
          initialTime={settings.reminder_time}
          busy={save.isPending}
          onSave={(input) => save.mutate(input)}
        />
      ) : null}
      {save.isSuccess ? <p role="status">Reporting schedule saved. Download verified reports to send via Gmail.</p> : null}
      {error ? (
        <p role="alert">
          {toApiError(error).status === 403
            ? "Your Admin access or password could not be verified."
            : "The reporting schedule could not be saved or loaded. Try again when online."}
        </p>
      ) : null}
    </section>
  );
}
