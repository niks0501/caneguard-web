import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { axiosClient } from "../../api/axiosClient";
import { toApiError } from "../../api/ApiError";
import { useAuth } from "../../auth/useAuth";
import { env } from "../../config/env";
import { formatDateTime } from "../../lib/formatters";
import { Button } from "../ui/Button";

const transmissionSchema = z.object({
  id: z.number().int(), state: z.enum(["pending", "delivering", "sent", "failed", "cancelled"]),
  transport_receipt: z.string().nullable(), failure_reason: z.string().nullable(),
  requested_name: z.string().nullable(), requested_by_id: z.number().int(),
  completed_at: z.string().nullable(), created_at: z.string(),
});
const versionSchema = z.object({
  uuid: z.string().uuid(), version: z.number().int(), content_hash: z.string().regex(/^[a-f0-9]{64}$/),
  approved_at: z.string().nullable(), approved_name: z.string().nullable().optional(),
  approved_title: z.string().nullable().optional(), prepared_name: z.string().nullable().optional(),
  created_at: z.string().optional(), version_reason: z.string().optional(),
  appendix_enabled: z.boolean().optional(), document_sha256: z.string().nullable().optional(),
  transmissions: z.array(transmissionSchema).default([]),
});
const listSchema = z.object({
  data: z.array(versionSchema), meta: z.object({ send_enabled: z.boolean(), appendix_allowed: z.boolean().default(false) }),
});
const diseases = [["", "All five classes"], ["healthy", "Healthy"], ["rssi", "RSSI"], ["mosaic", "Sugarcane Mosaic"], ["rust", "Sugarcane Rust"], ["smut", "Sugarcane Smut"]];

export function WeeklyReportApproval({ week }: { week: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [disease, setDisease] = useState("");
  const [appendix, setAppendix] = useState(false);
  const intentKeys = useRef(new Map<string, string>());
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  const key = ["district-report-versions", user?.uuid, week];
  const versions = useQuery({
    queryKey: key, retry: false,
    enabled: online && env.dataSource === "api" && Boolean(user) && /^\d{4}-W\d{2}$/.test(week),
    queryFn: async ({ signal }) => listSchema.parse((await axiosClient.get("/api/v1/district-reports", { params: { week }, signal })).data),
    refetchInterval: (query) => query.state.data?.data[0]?.transmissions.some((item) => ["pending", "delivering"].includes(item.state)) ? 5000 : false,
  });
  const latest = versions.data?.data[0];
  const receipt = latest?.transmissions[0];
  const action = useMutation({
    retry: false,
    mutationFn: async (kind: "prepare" | "approve" | "send") => {
      if (!navigator.onLine) throw new Error("Weekly reports require an online connection.");
      if (kind === "prepare") return axiosClient.post("/api/v1/district-reports", { week, ...(appendix && versions.data?.meta.appendix_allowed ? { appendix: true } : {}) });
      if (!latest) throw new Error("Prepare a version first.");
      const intentScope = `${latest.uuid}:${receipt?.id ?? 0}`;
      if (kind === "send" && !intentKeys.current.has(intentScope)) intentKeys.current.set(intentScope, crypto.randomUUID());
      return axiosClient.post(`/api/v1/district-reports/${latest.uuid}/${kind}`, {
        content_hash: latest.content_hash,
        ...(kind === "send" ? { idempotency_key: intentKeys.current.get(intentScope) } : {}),
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const officer = user?.role === "admin";
  const canApprove = officer;
  const canSend = officer;
  const error = action.error ?? versions.error;
  const status = error ? toApiError(error).status : undefined;
  const errorMessage = status === 409
    ? "This version or its approval is no longer current. Prepare a new version and review it again."
    : status === 403 ? "Your account access changed. Refresh your session before continuing."
      : status === 503 ? "The office delivery gate is closed. No send was requested."
        : "The weekly report could not be confirmed. Retry when the service is available.";
  const busy = action.isPending || versions.isFetching || !online;
  const blockedSend = receipt && ["pending", "delivering", "sent"].includes(receipt.state);
  const params = new URLSearchParams({ ...(disease ? { disease } : {}), ...(appendix && versions.data?.meta.appendix_allowed ? { appendix: "1" } : {}) });
  const path = latest ? `${env.apiBaseUrl}/api/v1/district-reports/${latest.uuid}` : "";
  const query = params.toString();

  if (env.dataSource !== "api") return null;

  return (
    <section className="report-builder__weekly" aria-label="Official weekly report">
      <h3>Official weekly report</h3>
      {!online ? <p role="status">Weekly reports are online-only. Preparation, approval and sending are not queued offline.</p> : null}
      <div className="report-builder__actions">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => action.mutate("prepare")}>
          {action.isPending && action.variables === "prepare" ? "Preparing version..." : "Prepare district version"}
        </Button>
        {latest ? <span>Version {latest.version} · {latest.version_reason ?? "initial"} · {latest.content_hash.slice(0, 12)}</span> : null}
        {canApprove ? <Button type="button" disabled={!latest || Boolean(latest.approved_at) || busy} onClick={() => action.mutate("approve")}>Approve version</Button> : null}
        {canSend ? <Button type="button" disabled={!latest?.approved_at || !versions.data?.meta.send_enabled || Boolean(blockedSend) || busy} onClick={() => action.mutate("send")}>{receipt?.state === "failed" || receipt?.state === "cancelled" ? "Order another send" : "Request send"}</Button> : null}
      </div>
      {latest?.prepared_name ? <p>Prepared by {latest.prepared_name}{latest.created_at ? ` · ${formatDateTime(latest.created_at)}` : ""}</p> : null}
      {latest?.approved_at ? <p>Approved{latest.approved_name ? ` by ${latest.approved_name}, ${latest.approved_title}` : ""} · {formatDateTime(latest.approved_at)}</p> : null}
      {canSend && versions.data && !versions.data.meta.send_enabled ? <p role="status">Office delivery gate closed.</p> : null}
      {receipt ? <div aria-label="Delivery receipt" role="status">
        <p>{receipt.state === "sent" ? "SMTP provider accepted the report. Inbox delivery is not guaranteed." : receipt.state === "failed" ? "Delivery failed or is uncertain. Check the provider before ordering another send." : receipt.state === "cancelled" ? "Send cancelled after authority or evidence changed." : receipt.state === "delivering" ? "Delivery in progress. Do not order another send." : "Send intent recorded. Delivery is not confirmed."}</p>
        <p>Ordered by {receipt.requested_name ?? `staff ${receipt.requested_by_id}`} · {formatDateTime(receipt.created_at)}</p>
        {receipt.transport_receipt ? <p>Provider message ID: {receipt.transport_receipt}</p> : null}
        {receipt.completed_at ? <p>{formatDateTime(receipt.completed_at)}</p> : null}
        {receipt.failure_reason ? <p>{receipt.failure_reason}</p> : null}
      </div> : action.isSuccess && action.variables === "send" ? <p role="status">Send intent recorded. Delivery is not confirmed.</p> : null}
      {error ? <p role="alert">{errorMessage}</p> : null}
      {versions.isLoading ? <p role="status">Loading district versions...</p> : null}
      {latest ? <>
        <div className="report-builder__actions">
          <label>Class view <select value={disease} onChange={(event) => setDisease(event.target.value)}>{diseases.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          {versions.data?.meta.appendix_allowed ? <label><input type="checkbox" checked={appendix} onChange={(event) => setAppendix(event.target.checked)} /> Include restricted farmer/farm appendix on preparation and view</label> : null}
          {(!latest.appendix_enabled || versions.data?.meta.appendix_allowed) && online ? <a href={`${path}/pdf`}>{latest.approved_at ? "Download approved A4 PDF" : "Download draft A4 PDF"}</a> : null}
        </div>
        {latest.document_sha256 ? <p>Approved document SHA-256: <span className="machine-text">{latest.document_sha256}</span></p> : null}
        <div className="report-builder__preview">
          {online ? <iframe title={`Official weekly report version ${latest.version}`} src={`${path}/document${query ? `?${query}` : ""}`} tabIndex={-1} /> : null}
        </div>
      </> : null}
    </section>
  );
}
