import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/useAuth";
import { env } from "../../config/env";
import { recentManilaIsoWeeks } from "../../domain/reportingTime";
import { formatDateTime } from "../../lib/formatters";
import { listSchema, versionTimeline, weekStatus, weekStatusLabels } from "./weeklyReportHistory";

const signed = (value: number | null) => value === null ? "—" : value > 0 ? `+${value}` : String(value);

/** Twelve-week status strip plus the selected week's version timeline. */
export function WeeklyReportHistory({ week, onSelect }: { week: string; onSelect: (week: string) => void }) {
  const { user } = useAuth();
  const weeks = recentManilaIsoWeeks(12);
  const history = useQuery({
    queryKey: ["district-report-versions", user?.uuid, "overview"], retry: false,
    enabled: env.dataSource === "api" && Boolean(user),
    queryFn: async ({ signal }) => listSchema.parse((await axiosClient.get("/api/v1/district-reports", { signal })).data),
  });
  if (env.dataSource !== "api") return null;
  const byWeek = (target: string) => (history.data?.data ?? []).filter(version => version.week === target);
  const timeline = versionTimeline(byWeek(week));

  return <section className="report-history" aria-label="Weekly report history">
    <ol className="report-history__strip" aria-label="Last 12 weeks">
      {weeks.map(item => {
        const status = history.data ? weekStatus(byWeek(item)) : null;
        return <li key={item}>
          <button type="button" aria-pressed={item === week} data-status={status ?? "loading"} onClick={() => onSelect(item)}>
            <strong>{item.slice(5)}</strong>
            <span>{status ? weekStatusLabels[status] : "…"}</span>
          </button>
        </li>;
      })}
    </ol>
    {history.isError ? <p role="alert">Week statuses could not be loaded.</p> : null}
    {history.data ? <ol className="report-history__timeline" aria-label={`Versions of ${week}`}>
      {timeline.map(({ version, deltas }) => <li key={version.uuid}>
        <strong>Version {version.version}</strong> · {version.version_reason ?? "initial"}
        {version.is_current ? null : <span className="report-history__flag"> · {version.stale_reason === "newer_version" ? "Superseded" : "Evidence changed"}</span>}
        <div>Prepared{version.prepared_name ? ` by ${version.prepared_name}` : ""}{version.created_at ? ` · ${formatDateTime(version.created_at)}` : ""}</div>
        {version.approved_at ? <div>Approved{version.approved_name ? ` by ${version.approved_name}` : ""} · {formatDateTime(version.approved_at)}</div> : null}
        {version.transmissions.map(item => <div key={item.id}>Send {item.state} · {formatDateTime(item.completed_at ?? item.created_at)}</div>)}
        {version.headline ? <div>Cases {version.headline.cases} ({signed(deltas.cases)}) · Confirmed {version.headline.confirmed} ({signed(deltas.confirmed)}) · Late evidence {version.headline.late_evidence} ({signed(deltas.late_evidence)})</div> : null}
      </li>)}
    </ol> : null}
  </section>;
}

