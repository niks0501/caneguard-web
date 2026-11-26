import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { toApiError } from "../../api/ApiError";
import { useAuth } from "../../auth/useAuth";
import { env } from "../../config/env";
import { formatDateTime } from "../../lib/formatters";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { listSchema, type ReportVersion } from "./weeklyReportHistory";

const diseases = [["", "All five classes"], ["healthy", "Healthy"], ["rssi", "RSSI"], ["mosaic", "Sugarcane Mosaic"], ["rust", "Sugarcane Rust"], ["smut", "Sugarcane Smut"]];

const staleConflict = "This version or its approval is no longer current. Prepare a new version and review it again.";

function conflictMessage(latest: ReportVersion | undefined, kind: "prepare" | "approve" | undefined) {
  if (!latest) return staleConflict;
  if (latest.stale_reason === "newer_version") return "A newer version of this week's report exists. Review that version instead.";
  if (latest.stale_reason === "evidence_changed") return "Evidence changed after this version was prepared. Prepare a new version and review it again.";
  if (kind === "approve" && latest.approved_at) return "This version is already approved. No further approval is needed.";
  return staleConflict;
}

export function WeeklyReportApproval({ week }: { week: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [disease, setDisease] = useState("");
  const [appendix, setAppendix] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  const key = ["district-report-versions", user?.uuid, week];
  const versions = useQuery({
    queryKey: key,
    retry: false,
    enabled: online && env.dataSource === "api" && Boolean(user) && /^\d{4}-W\d{2}$/.test(week),
    queryFn: async ({ signal }) => listSchema.parse((await axiosClient.get("/api/v1/district-reports", { params: { week }, signal })).data),
  });

  const latest = versions.data?.data[0];
  const action = useMutation({
    retry: false,
    mutationFn: async (kind: "prepare" | "approve") => {
      if (!navigator.onLine) throw new Error("Weekly reports require an online connection.");
      if (kind === "prepare") {
        return axiosClient.post("/api/v1/district-reports", { week, ...(appendix && versions.data?.meta.appendix_allowed ? { appendix: true } : {}) });
      }
      if (!latest) throw new Error("Prepare a version first.");
      return axiosClient.post(`/api/v1/district-reports/${latest.uuid}/approve`, {
        content_hash: latest.content_hash,
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["district-report-versions", user?.uuid] }),
  });

  const canApprove = user?.role === "admin";
  const error = action.error ?? versions.error;
  const status = error ? toApiError(error).status : undefined;
  const errorMessage = status === 409
    ? (versions.isFetching ? staleConflict : conflictMessage(latest, action.error ? action.variables : undefined))
    : status === 403
      ? "Your account access changed. Refresh your session before continuing."
      : "The weekly report could not be confirmed. Retry when the service is available.";

  const approvalState = !online
    ? "offline"
    : error
      ? "error"
      : action.isPending ? "working" : versions.isLoading ? "loading" : "ready";
  const approvalErrorKind = approvalState !== "error"
    ? undefined
    : status === 409
      ? "conflict"
      : status === 403
        ? "access-denied"
        : "unavailable";

  const busy = action.isPending || versions.isFetching || !online;
  const params = new URLSearchParams({ ...(disease ? { disease } : {}), ...(appendix && versions.data?.meta.appendix_allowed ? { appendix: "1" } : {}) });
  const path = latest ? `${env.apiBaseUrl}/api/v1/district-reports/${latest.uuid}` : "";
  const query = params.toString();

  const confirm = () => {
    if (!confirming || action.isPending) return;
    action.mutate("approve");
    setConfirming(false);
  };

  if (env.dataSource !== "api") return null;

  return (
    <section className="report-builder__weekly" aria-label="Official weekly report" data-state={approvalState} data-error-kind={approvalErrorKind}>
      <h3>Official weekly report</h3>
      {!online ? <p role="status">Weekly reports are online-only. Preparation and approval are not queued offline.</p> : null}
      <div className="report-builder__actions">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => action.mutate("prepare")}>
          {action.isPending && action.variables === "prepare" ? "Preparing version..." : "Prepare district version"}
        </Button>
        {latest ? <span>Version {latest.version} · {latest.version_reason ?? "initial"} · {latest.content_hash.slice(0, 12)}</span> : null}
        {canApprove ? (
          <Button type="button" disabled={!latest || Boolean(latest.approved_at) || busy} onClick={() => setConfirming(true)}>
            Approve version
          </Button>
        ) : null}
      </div>
      {latest && confirming ? (
        <Modal
          id="weekly-report-confirm"
          title="Approve this report version?"
          open
          onClose={() => setConfirming(false)}
          footer={(
            <>
              <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button type="button" disabled={action.isPending} onClick={confirm}>Confirm approval</Button>
            </>
          )}
        >
          <dl>
            <dt>Week</dt><dd>{week}</dd>
            <dt>Version</dt><dd>{latest.version}</dd>
            <dt>Content hash</dt><dd className="machine-text">{latest.content_hash.slice(0, 12)}</dd>
          </dl>
          <p>Approval records your name and title as the attestation for this exact version and seals the official A4 PDF for Gmail hand-off. It cannot be undone.</p>
        </Modal>
      ) : null}
      {latest?.prepared_name ? <p>Prepared by {latest.prepared_name}{latest.created_at ? ` · ${formatDateTime(latest.created_at)}` : ""}</p> : null}
      {latest?.approved_at ? <p>Approved{latest.approved_name ? ` by ${latest.approved_name}, ${latest.approved_title}` : ""} · {formatDateTime(latest.approved_at)}</p> : null}
      {error ? <p role="alert">{errorMessage}</p> : null}
      {versions.isLoading ? <p role="status">Loading district versions...</p> : null}
      {latest ? (
        <>
          <div className="report-builder__actions">
            <label>Class view <select value={disease} onChange={(event) => setDisease(event.target.value)}>{diseases.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            {versions.data?.meta.appendix_allowed ? <label><input type="checkbox" checked={appendix} onChange={(event) => setAppendix(event.target.checked)} /> Include restricted farmer/farm appendix on preparation and view</label> : null}
            {(!latest.appendix_enabled || versions.data?.meta.appendix_allowed) && online ? <a href={`${path}/pdf`}>{latest.approved_at ? "Download approved A4 PDF" : "Download draft A4 PDF"}</a> : null}
          </div>
          {latest.document_sha256 ? <p>Approved document SHA-256: <span className="machine-text">{latest.document_sha256}</span></p> : null}
          <div className="report-builder__preview">
            {online ? <iframe title={`Official weekly report version ${latest.version}`} src={`${path}/document${query ? `?${query}` : ""}`} tabIndex={-1} /> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
