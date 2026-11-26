import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileArchive,
  RefreshCw,
  Settings,
} from "lucide-react";
import { Link } from "react-router";
import { axiosClient } from "../../api/axiosClient";
import { isApiConnectionError, toApiError } from "../../api/ApiError";
import { routes } from "../../app/routes";
import { useAuth } from "../../auth/useAuth";
import { env } from "../../config/env";
import {
  isoWeekDateRangeLabel,
  previousManilaIsoWeekAt,
  recentManilaIsoWeeks,
} from "../../domain/reportingTime";
import { formatDateTime } from "../../lib/formatters";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { WeeklyRssiExport } from "./WeeklyRssiExport";
import {
  listSchema,
  rssiListSchema,
  versionTimeline,
  weekStatus,
  weekStatusLabels,
  type AutomationStatus,
  type ReportVersion,
} from "./weeklyReportHistory";

const diseaseClasses = [
  { key: "healthy", label: "Healthy", color: "var(--kpi-band-1)" },
  { key: "rssi", label: "RSSI", color: "var(--kpi-band-2)" },
  { key: "mosaic", label: "Sugarcane Mosaic", color: "var(--kpi-band-3)" },
  { key: "rust", label: "Sugarcane Rust", color: "var(--kpi-band-4)" },
  { key: "smut", label: "Sugarcane Smut", color: "var(--color-primary-fill)" },
] as const;

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatClock12h(value: string): string {
  const [hour, minute] = value.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value;
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function signedDelta(value: number | null): string {
  if (value === null) return "—";
  return value > 0 ? `+${value}` : String(value);
}

function formatAutomationLine(automation: AutomationStatus | undefined): string {
  if (!automation) return "Auto-build: Mon 6:00 AM PHT";
  if (!automation.enabled) return "Auto-build paused";
  const slot = `${weekdays[automation.day - 1] ?? "Mon"} ${formatClock12h(automation.time)} PHT`;
  if (automation.last_status === "failed") {
    return `Auto-build failed · scheduled ${slot}`;
  }
  const parts = [`Auto-build: ${slot}`];
  if (automation.last_run_at) {
    parts.push(`Last run: ${formatDateTime(automation.last_run_at)}`);
  }
  if (automation.next_run_at) {
    parts.push(`Next: ${formatDateTime(automation.next_run_at)}`);
  }
  return parts.join(" · ");
}

function triggerBlobDownload(blob: Blob, filename: string) {
  if (typeof URL.createObjectURL !== "function") return;
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
}

function approvalConflictMessage(latest: ReportVersion | undefined): string {
  if (!latest) return "This version is no longer current. Refresh the week and review it again.";
  if (latest.stale_reason === "newer_version") return "A newer version of this week's report exists. Review that version instead.";
  if (latest.stale_reason === "evidence_changed") return "Field records changed after this snapshot was built. Refresh the report before approving.";
  if (latest.approved_at) return "This version is already approved.";
  return "This version is no longer current. Refresh the week and review it again.";
}

export function WeeklyReportsHub({ initialWeek }: { initialWeek?: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const allWeeks = useMemo(() => recentManilaIsoWeeks(12), []);
  const defaultWeek = initialWeek && /^\d{4}-W\d{2}$/.test(initialWeek)
    ? initialWeek
    : allWeeks[0] ?? previousManilaIsoWeekAt();

  const [week, setWeek] = useState(defaultWeek);
  const [stripPage, setStripPage] = useState<0 | 1>(0);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [showFiveDiseasePreview, setShowFiveDiseasePreview] = useState(false);
  const [showRssiPreview, setShowRssiPreview] = useState(false);
  const [diseaseFilter, setDiseaseFilter] = useState("");
  const [appendix, setAppendix] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [bundlePending, setBundlePending] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [adhocPeriodType, setAdhocPeriodType] = useState<"monthly" | "custom">("monthly");
  const [adhocMonth, setAdhocMonth] = useState("");
  const [adhocFrom, setAdhocFrom] = useState("");
  const [adhocTo, setAdhocTo] = useState("");

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const enabled = online && env.dataSource === "api" && Boolean(user);

  const overviewQuery = useQuery({
    queryKey: ["district-report-versions", user?.uuid, "overview"],
    retry: false,
    enabled,
    queryFn: async ({ signal }) =>
      listSchema.parse((await axiosClient.get("/api/v1/district-reports", { signal })).data),
  });

  const weekFiveDiseaseQuery = useQuery({
    queryKey: ["district-report-versions", user?.uuid, week],
    retry: false,
    enabled: enabled && /^\d{4}-W\d{2}$/.test(week),
    queryFn: async ({ signal }) =>
      listSchema.parse((await axiosClient.get("/api/v1/district-reports", { params: { week }, signal })).data),
  });

  const weekRssiQuery = useQuery({
    queryKey: ["district-rssi-report-versions", user?.uuid, week],
    retry: false,
    enabled: enabled && /^\d{4}-W\d{2}$/.test(week),
    queryFn: async ({ signal }) =>
      rssiListSchema.parse((await axiosClient.get("/api/v1/district-rssi-reports", { params: { week }, signal })).data),
  });

  const refreshMutation = useMutation({
    retry: false,
    mutationFn: async (target: "both" | "five_disease" | "rssi") => {
      if (!navigator.onLine) throw new Error("Weekly reports require an online connection.");
      if (target === "five_disease" || target === "both") {
        await axiosClient.post("/api/v1/district-reports", {
          week,
          ...(appendix && weekFiveDiseaseQuery.data?.meta.appendix_allowed ? { appendix: true } : {}),
        });
      }
      if (target === "rssi" || target === "both") {
        await axiosClient.post("/api/v1/district-rssi-reports", { week });
      }
    },
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ["district-report-versions", user?.uuid] }),
      queryClient.invalidateQueries({ queryKey: ["district-rssi-report-versions", user?.uuid] }),
    ]),
  });

  const latestFiveDisease = weekFiveDiseaseQuery.data?.data[0];
  const latestRssi = weekRssiQuery.data?.data[0];

  const approveMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!navigator.onLine) throw new Error("Weekly reports require an online connection.");
      if (!latestFiveDisease) throw new Error("Generate a version first.");
      return axiosClient.post(`/api/v1/district-reports/${latestFiveDisease.uuid}/approve`, {
        content_hash: latestFiveDisease.content_hash,
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["district-report-versions", user?.uuid] }),
  });

  const downloadBundle = useCallback(async () => {
    setBundlePending(true);
    setBundleError(null);
    try {
      const response = await axiosClient.get(
        `${env.apiBaseUrl}/api/v1/district-reports/weekly-bundle?week=${encodeURIComponent(week)}`,
        { responseType: "blob" },
      );
      triggerBlobDownload(response.data, `caneguard-weekly-bundle-${week}.zip`);
    } catch (error) {
      if (isApiConnectionError(error)) {
        setBundleError("CaneGuard cannot be reached right now. Check your connection and try again.");
      } else {
        setBundleError("The weekly bundle could not be prepared. Download the individual PDF or CSV files instead.");
      }
    } finally {
      setBundlePending(false);
    }
  }, [week]);

  const isAdmin = user?.role === "admin";
  const automation = weekFiveDiseaseQuery.data?.meta.automation ?? overviewQuery.data?.meta.automation;
  const visibleWeeks = allWeeks.slice(stripPage * 6, stripPage * 6 + 6);
  const byWeek = (target: string) => (overviewQuery.data?.data ?? []).filter((item) => item.week === target);
  const timeline = versionTimeline(weekFiveDiseaseQuery.data?.data ?? []);

  const anyStale = Boolean(
    (latestFiveDisease && !latestFiveDisease.is_current && latestFiveDisease.stale_reason === "evidence_changed")
    || (latestRssi && !latestRssi.is_current && latestRssi.stale_reason === "evidence_changed"),
  );
  const busy = refreshMutation.isPending || approveMutation.isPending || !online;
  const hasAnySnapshot = Boolean(latestFiveDisease || latestRssi);

  const actionError = approveMutation.error ?? refreshMutation.error ?? weekFiveDiseaseQuery.error ?? weekRssiQuery.error;
  const errorStatus = actionError ? toApiError(actionError).status : undefined;
  const errorMessage = errorStatus === 409
    ? approvalConflictMessage(latestFiveDisease)
    : errorStatus === 403
      ? "Your account access changed. Refresh your session before continuing."
      : "The weekly report could not be updated. Try again when the service is available.";

  const fiveDiseasePath = latestFiveDisease ? `${env.apiBaseUrl}/api/v1/district-reports/${latestFiveDisease.uuid}` : "";
  const fiveDiseasePreviewParams = new URLSearchParams({
    ...(diseaseFilter ? { disease: diseaseFilter } : {}),
    ...(appendix && weekFiveDiseaseQuery.data?.meta.appendix_allowed ? { appendix: "1" } : {}),
  });
  const rssiPath = latestRssi ? `${env.apiBaseUrl}/api/v1/district-rssi-reports/${latestRssi.uuid}` : "";

  const totalByClass = diseaseClasses.map((item) => ({
    ...item,
    count: latestFiveDisease?.disease_counts?.[item.key] ?? 0,
  }));
  const classSum = totalByClass.reduce((sum, item) => sum + item.count, 0);

  if (env.dataSource !== "api") return null;

  return (
    <section className="weekly-hub" aria-label="Weekly reports">
      <div className="weekly-hub__meta-bar">
        <div
          className={`weekly-auto-pill${automation?.last_status === "failed" ? " is-failed" : ""}`}
          role="status"
          aria-label="Weekly automation status"
        >
          <Clock aria-hidden="true" size={16} />
          <span>{formatAutomationLine(automation)}</span>
        </div>
        {isAdmin ? (
          <Link className="weekly-settings-link" to={routes.settingsSection("weekly-reporting")}>
            <Settings aria-hidden="true" size={16} />
            <span>Weekly schedule settings</span>
          </Link>
        ) : null}
      </div>

      {!online ? (
        <p className="report-builder__scope" role="status">
          Weekly reports are online-only. Generation and approval require a live connection.
        </p>
      ) : null}

      <div className="weekly-strip-panel" aria-label="Reporting week selector">
        <div className="weekly-strip-panel__header">
          <div>
            <h2>Select reporting week</h2>
            <p className="weekly-strip-panel__sub">
              {week} · {isoWeekDateRangeLabel(week, true)} (Mon–Sun, Asia/Manila)
            </p>
          </div>
          <div className="weekly-strip-panel__pager">
            <Button
              type="button"
              variant="secondary"
              disabled={stripPage === 1}
              onClick={() => setStripPage(1)}
              icon={<ChevronLeft aria-hidden="true" size={16} />}
            >
              Earlier 6 weeks
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={stripPage === 0}
              onClick={() => setStripPage(0)}
              icon={<ChevronRight aria-hidden="true" size={16} />}
            >
              Recent 6 weeks
            </Button>
          </div>
        </div>

        <ol className="weekly-strip" aria-label="Last 12 weeks">
          {visibleWeeks.map((item) => {
            const status = overviewQuery.data ? weekStatus(byWeek(item)) : null;
            return (
              <li key={item}>
                <button
                  type="button"
                  className="weekly-strip__item"
                  aria-pressed={item === week}
                  data-status={status ?? "loading"}
                  onClick={() => {
                    setWeek(item);
                    setBundleError(null);
                    setShowFiveDiseasePreview(false);
                    setShowRssiPreview(false);
                  }}
                >
                  <strong>{item.slice(5)}</strong>
                  <span className="weekly-strip__dates">{isoWeekDateRangeLabel(item)}</span>
                  <span className="weekly-strip__status">
                    {status ? weekStatusLabels[status] : "Loading..."}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {hasAnySnapshot ? (
        <div className="weekly-bundle-bar" aria-label="Gmail hand-off bundle">
          <div>
            <strong>Weekly bundle for Gmail ({week})</strong>
            <p>
              {latestFiveDisease?.approved_at
                ? "Includes the Approved 5-Disease PDF, Weekly RSSI PDF, and Weekly RSSI CSV in one ZIP archive."
                : "Includes the 5-Disease draft PDF, Weekly RSSI PDF, and Weekly RSSI CSV in one ZIP archive."}
            </p>
          </div>
          <Button
            type="button"
            icon={<FileArchive aria-hidden="true" size={18} />}
            disabled={bundlePending || !online}
            onClick={() => void downloadBundle()}
          >
            {bundlePending ? "Preparing bundle..." : "Download Weekly Bundle (.zip)"}
          </Button>
        </div>
      ) : null}
      {bundleError ? <div className="report-builder__error" role="alert">{bundleError}</div> : null}

      {anyStale ? (
        <div className="weekly-stale-banner" role="status">
          <div>
            <strong>Field records changed after this week&apos;s snapshot.</strong>
            <span> Refresh to create a newer version with the latest verified data.</span>
          </div>
          <Button
            type="button"
            variant="secondary"
            icon={<RefreshCw aria-hidden="true" size={16} />}
            disabled={busy}
            onClick={() => refreshMutation.mutate("both")}
          >
            {refreshMutation.isPending ? "Refreshing..." : "Refresh weekly reports"}
          </Button>
        </div>
      ) : null}

      {actionError ? <div className="report-builder__error" role="alert">{errorMessage}</div> : null}

      <div className="weekly-grid">
        {/* 5-DISEASE DISTRICT WEEKLY REPORT */}
        <article className="weekly-panel" aria-label="5-Disease weekly report">
          <div className="weekly-panel__head">
            <div>
              <h3>5-Disease weekly report</h3>
              <p className="weekly-panel__meta">
                {latestFiveDisease
                  ? `${latestFiveDisease.prepared_source === "scheduled" ? "Auto-generated" : `Prepared by ${latestFiveDisease.prepared_name ?? "office staff"}`}${latestFiveDisease.created_at ? ` · ${formatDateTime(latestFiveDisease.created_at)}` : ""} · v${latestFiveDisease.version}`
                  : "All five classes: Healthy, RSSI, Mosaic, Rust, and Smut"}
              </p>
            </div>
            <span
              className="weekly-status-badge"
              data-tone={
                !latestFiveDisease
                  ? "neutral"
                  : !latestFiveDisease.is_current
                    ? "danger"
                    : latestFiveDisease.approved_at
                      ? "approved"
                      : "pending"
              }
            >
              {!latestFiveDisease
                ? "Not generated"
                : !latestFiveDisease.is_current
                  ? "Needs refresh"
                  : latestFiveDisease.approved_at
                    ? "Approved"
                    : "Ready to review"}
            </span>
          </div>

          <ol className="weekly-stepper" aria-label="Official report progress">
            <li data-step-state={latestFiveDisease ? "done" : "current"}>
              <strong>1. Snapshot</strong>
              <span>{latestFiveDisease ? `v${latestFiveDisease.version} saved` : "Awaiting generation"}</span>
            </li>
            <li data-step-state={latestFiveDisease?.approved_at ? "done" : latestFiveDisease ? "current" : "idle"}>
              <strong>2. Officer approval</strong>
              <span>{latestFiveDisease?.approved_at ? (latestFiveDisease.approved_name ?? "Approved") : "Admin sign-off"}</span>
            </li>
            <li data-step-state={latestFiveDisease?.approved_at ? "done" : "idle"}>
              <strong>3. Download for Gmail</strong>
              <span>{latestFiveDisease?.approved_at ? "Sealed A4 PDF ready" : "Available after approval"}</span>
            </li>
          </ol>

          {latestFiveDisease ? (
            <>
              <div className="weekly-stats">
                <div className="weekly-stat">
                  <strong>{latestFiveDisease.headline?.cases ?? 0}</strong>
                  <span>Total cases</span>
                </div>
                <div className="weekly-stat">
                  <strong>{latestFiveDisease.headline?.confirmed ?? 0}</strong>
                  <span>Confirmed</span>
                </div>
                <div className="weekly-stat">
                  <strong>{latestFiveDisease.headline?.late_evidence ?? 0}</strong>
                  <span>Late evidence</span>
                </div>
              </div>

              {classSum > 0 ? (
                <div className="weekly-distribution">
                  <div
                    className="weekly-band-bar"
                    role="img"
                    aria-label={totalByClass.map((c) => `${c.label} ${c.count}`).join(", ")}
                  >
                    {totalByClass.filter((item) => item.count > 0).map((item) => (
                      <span
                        key={item.key}
                        style={{ flex: item.count, background: item.color }}
                      />
                    ))}
                  </div>
                  <div className="weekly-band-legend">
                    {totalByClass.map((item) => (
                      <span key={item.key} className="weekly-band-legend__item">
                        <i style={{ background: item.color }} aria-hidden="true" />
                        {item.label} ({item.count})
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="report-builder__actions">
                {latestFiveDisease.approved_at ? (
                  <a className="btn btn--primary" href={`${fiveDiseasePath}/pdf`}>
                    <Download aria-hidden="true" size={18} />
                    <span>Download approved A4 PDF</span>
                  </a>
                ) : isAdmin ? (
                  <Button
                    type="button"
                    icon={<CheckCircle2 aria-hidden="true" size={18} />}
                    disabled={busy}
                    onClick={() => setConfirmApprove(true)}
                  >
                    Approve &amp; seal report
                  </Button>
                ) : null}

                <Button
                  type="button"
                  variant="secondary"
                  icon={<Eye aria-hidden="true" size={18} />}
                  disabled={!online}
                  onClick={() => setShowFiveDiseasePreview((current) => !current)}
                >
                  {showFiveDiseasePreview ? "Hide preview" : "Preview A4 document"}
                </Button>

                {!latestFiveDisease.approved_at && online ? (
                  <a className="btn btn--secondary" href={`${fiveDiseasePath}/pdf`}>
                    <Download aria-hidden="true" size={18} />
                    <span>Download draft PDF</span>
                  </a>
                ) : null}
              </div>

              {!isAdmin && !latestFiveDisease.approved_at ? (
                <p className="weekly-panel__note">
                  Reviewers can preview and download the draft. An Administrator signs off the official copy.
                </p>
              ) : null}

              {latestFiveDisease.approved_at ? (
                <p className="weekly-panel__note">
                  Approved{latestFiveDisease.approved_name ? ` by ${latestFiveDisease.approved_name}` : ""}
                  {latestFiveDisease.approved_title ? `, ${latestFiveDisease.approved_title}` : ""} · {formatDateTime(latestFiveDisease.approved_at)}
                </p>
              ) : null}

              {showFiveDiseasePreview && online ? (
                <div className="weekly-preview-wrap">
                  <div className="report-builder__actions">
                    <label>
                      <span>Class view</span>
                      <select value={diseaseFilter} onChange={(event) => setDiseaseFilter(event.target.value)}>
                        <option value="">All five classes</option>
                        {diseaseClasses.map((item) => (
                          <option key={item.key} value={item.key}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="report-builder__preview">
                    <iframe
                      title={`Official weekly report version ${latestFiveDisease.version}`}
                      src={`${fiveDiseasePath}/document${fiveDiseasePreviewParams.toString() ? `?${fiveDiseasePreviewParams.toString()}` : ""}`}
                      tabIndex={-1}
                    />
                  </div>
                </div>
              ) : null}

              <details className="weekly-disclosure">
                <summary>Version history &amp; integrity details</summary>
                <div className="weekly-disclosure__body">
                  {weekFiveDiseaseQuery.data?.meta.appendix_allowed ? (
                    <label className="report-builder__check">
                      <input type="checkbox" checked={appendix} onChange={(event) => setAppendix(event.target.checked)} />
                      <span>Include restricted farmer/farm appendix when refreshing</span>
                    </label>
                  ) : null}
                  <p className="weekly-panel__meta">
                    Content hash: <span className="machine-text">{latestFiveDisease.content_hash.slice(0, 12)}</span>
                    {latestFiveDisease.document_sha256 ? (
                      <> · Sealed PDF SHA-256: <span className="machine-text">{latestFiveDisease.document_sha256}</span></>
                    ) : null}
                  </p>
                  <ol className="report-history__timeline" aria-label={`Versions of ${week}`}>
                    {timeline.map(({ version, deltas }) => (
                      <li key={version.uuid}>
                        <strong>Version {version.version}</strong> · {version.version_reason ?? "initial"}
                        {version.is_current ? null : (
                          <span className="report-history__flag">
                            {" · "}
                            {version.stale_reason === "newer_version" ? "Superseded" : "Evidence changed"}
                          </span>
                        )}
                        <div>
                          {version.prepared_source === "scheduled" ? "Auto-generated" : `Prepared by ${version.prepared_name ?? "staff"}`}
                          {version.created_at ? ` · ${formatDateTime(version.created_at)}` : ""}
                        </div>
                        {version.approved_at ? (
                          <div>Approved{version.approved_name ? ` by ${version.approved_name}` : ""} · {formatDateTime(version.approved_at)}</div>
                        ) : null}
                        {version.headline ? (
                          <div>
                            Cases {version.headline.cases} ({signedDelta(deltas.cases)}) · Confirmed {version.headline.confirmed} ({signedDelta(deltas.confirmed)}) · Late evidence {version.headline.late_evidence} ({signedDelta(deltas.late_evidence)})
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
              </details>
            </>
          ) : (
            <div className="weekly-empty">
              <p>No 5-disease snapshot has been created for {week} yet.</p>
              <Button
                type="button"
                disabled={busy}
                onClick={() => refreshMutation.mutate("five_disease")}
              >
                {refreshMutation.isPending ? "Generating..." : "Generate 5-disease snapshot"}
              </Button>
            </div>
          )}
        </article>

        {/* WEEKLY RSSI REPORT (SRA) */}
        <article className="weekly-panel" aria-label="Weekly RSSI report">
          <div className="weekly-panel__head">
            <div>
              <h3>Weekly RSSI report</h3>
              <p className="weekly-panel__meta">
                {latestRssi
                  ? `${latestRssi.prepared_source === "scheduled" ? "Auto-generated" : `Prepared by ${latestRssi.prepared_name ?? "office staff"}`}${latestRssi.created_at ? ` · ${formatDateTime(latestRssi.created_at)}` : ""} · v${latestRssi.version}`
                  : "Dedicated SRA submission (validated vs. suspected RSSI)"}
              </p>
            </div>
            <span
              className="weekly-status-badge"
              data-tone={!latestRssi ? "neutral" : !latestRssi.is_current ? "danger" : "approved"}
            >
              {!latestRssi ? "Not generated" : !latestRssi.is_current ? "Needs refresh" : "Ready to download"}
            </span>
          </div>

          {latestRssi ? (
            <>
              <div className="weekly-stats weekly-stats--two">
                <div className="weekly-stat">
                  <strong>{latestRssi.headline?.validated ?? 0}</strong>
                  <span>Validated RSSI cases</span>
                </div>
                <div className="weekly-stat">
                  <strong>{latestRssi.headline?.suspected ?? 0}</strong>
                  <span>Suspected (separate)</span>
                </div>
              </div>

              <p className="weekly-panel__note">
                Validated totals include only staff-verified RSSI cases. Suspected cases are listed separately, farmer and farm names are omitted, and unconfirmed infestation percentages are not reported.
              </p>

              <div className="report-builder__actions">
                <a className="btn btn--primary" href={`${rssiPath}/pdf`}>
                  <Download aria-hidden="true" size={18} />
                  <span>Download RSSI PDF</span>
                </a>
                <a className="btn btn--secondary" href={`${rssiPath}/csv`}>
                  <Download aria-hidden="true" size={18} />
                  <span>Download RSSI CSV</span>
                </a>
                <Button
                  type="button"
                  variant="secondary"
                  icon={<Eye aria-hidden="true" size={18} />}
                  disabled={!online}
                  onClick={() => setShowRssiPreview((current) => !current)}
                >
                  {showRssiPreview ? "Hide preview" : "Preview report"}
                </Button>
              </div>

              {showRssiPreview && online ? (
                <div className="report-builder__preview">
                  <iframe
                    title={`Weekly RSSI report version ${latestRssi.version}`}
                    src={`${rssiPath}/document`}
                    tabIndex={-1}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <div className="weekly-empty">
              <p>No weekly RSSI snapshot has been saved for {week} yet.</p>
              <Button
                type="button"
                disabled={busy}
                onClick={() => refreshMutation.mutate("rssi")}
              >
                {refreshMutation.isPending ? "Generating..." : "Generate weekly RSSI snapshot"}
              </Button>
            </div>
          )}

          <details className="weekly-disclosure">
            <summary>Monthly or custom RSSI date range</summary>
            <div className="weekly-disclosure__body">
              <div className="report-builder__controls">
                <label>
                  <span>Period</span>
                  <select
                    value={adhocPeriodType}
                    onChange={(event) => setAdhocPeriodType(event.target.value as "monthly" | "custom")}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="custom">Custom range</option>
                  </select>
                </label>
                {adhocPeriodType === "monthly" ? (
                  <label>
                    <span>Month</span>
                    <input type="month" value={adhocMonth} onChange={(event) => setAdhocMonth(event.target.value)} />
                  </label>
                ) : (
                  <>
                    <label>
                      <span>From</span>
                      <input type="date" value={adhocFrom} onChange={(event) => setAdhocFrom(event.target.value)} />
                    </label>
                    <label>
                      <span>To</span>
                      <input type="date" value={adhocTo} onChange={(event) => setAdhocTo(event.target.value)} />
                    </label>
                  </>
                )}
              </div>
              <WeeklyRssiExport
                period={{
                  periodType: adhocPeriodType,
                  week,
                  month: adhocMonth,
                  from: adhocFrom,
                  to: adhocTo,
                }}
                disabled={!online}
              />
            </div>
          </details>
        </article>
      </div>

      {latestFiveDisease && confirmApprove ? (
        <Modal
          id="weekly-report-confirm"
          title="Approve this report version?"
          open
          onClose={() => setConfirmApprove(false)}
          footer={(
            <>
              <Button type="button" variant="secondary" onClick={() => setConfirmApprove(false)}>Cancel</Button>
              <Button
                type="button"
                disabled={approveMutation.isPending}
                onClick={() => {
                  approveMutation.mutate();
                  setConfirmApprove(false);
                }}
              >
                Confirm approval
              </Button>
            </>
          )}
        >
          <dl>
            <dt>Week</dt><dd>{week} ({isoWeekDateRangeLabel(week, true)})</dd>
            <dt>Version</dt><dd>{latestFiveDisease.version}</dd>
            <dt>Content hash</dt><dd className="machine-text">{latestFiveDisease.content_hash.slice(0, 12)}</dd>
          </dl>
          <p>
            Approval records your name and title as the District Mill Officer attestation and seals the official A4 PDF for Gmail hand-off. It cannot be undone.
          </p>
        </Modal>
      ) : null}
    </section>
  );
}
