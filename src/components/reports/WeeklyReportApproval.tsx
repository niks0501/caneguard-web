import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { axiosClient } from "../../api/axiosClient";
import { toApiError } from "../../api/ApiError";
import { useAuth } from "../../auth/useAuth";
import { env } from "../../config/env";
import { formatDateTime } from "../../lib/formatters";
import { Button } from "../ui/Button";

const versionSchema = z.object({
  uuid: z.string().uuid(),
  version: z.number().int(),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/),
  approved_at: z.string().nullable(),
});
const listSchema = z.object({
  data: z.array(versionSchema),
  meta: z.object({ send_enabled: z.boolean() }),
});

export function WeeklyReportApproval({ week }: { week: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ["district-report-versions", user?.uuid, week];
  const versions = useQuery({
    queryKey: key,
    enabled: env.dataSource === "api" && Boolean(user) && /^\d{4}-W\d{2}$/.test(week),
    queryFn: async ({ signal }) => listSchema.parse((await axiosClient.get("/api/v1/district-reports", { params: { week }, signal })).data),
  });
  const latest = versions.data?.data[0];
  const action = useMutation({
    mutationFn: async (kind: "prepare" | "approve" | "send") => {
      if (kind === "prepare") return axiosClient.post("/api/v1/district-reports", { week });
      if (!latest) throw new Error("Prepare a version first.");
      return axiosClient.post(`/api/v1/district-reports/${latest.uuid}/${kind}`, {
        content_hash: latest.content_hash,
        ...(kind === "send" ? { idempotency_key: latest.uuid } : {}),
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const officer = user?.role === "admin";
  const canApprove = officer && user.capabilities?.includes("report:approve");
  const canSend = officer && user.capabilities?.includes("report:send");
  const error = action.error ?? versions.error;
  const status = error ? toApiError(error).status : undefined;
  const errorMessage = status === 409
    ? "This version or its approval is no longer current. Prepare a new version and review it again."
    : status === 403 ? "Your district grant changed. Refresh your session before continuing."
      : status === 503 ? "The office delivery gate is closed. No send was requested."
        : "The weekly report could not be confirmed. Retry when the service is available.";

  if (env.dataSource !== "api") return null;

  return (
    <section className="report-builder__weekly" aria-label="Official weekly report">
      <h3>Official weekly report</h3>
      <div className="report-builder__actions">
        <Button type="button" variant="secondary" disabled={action.isPending || versions.isFetching} onClick={() => action.mutate("prepare")}>
          {action.isPending && action.variables === "prepare" ? "Preparing version..." : "Prepare district version"}
        </Button>
        {latest ? <span>Version {latest.version} · {latest.content_hash.slice(0, 12)}</span> : null}
        {canApprove ? <Button type="button" disabled={!latest || Boolean(latest.approved_at) || action.isPending} onClick={() => action.mutate("approve")}>Approve version</Button> : null}
        {canSend ? <Button type="button" disabled={!latest?.approved_at || !versions.data?.meta.send_enabled || action.isPending} onClick={() => action.mutate("send")}>Request send</Button> : null}
      </div>
      {canSend && versions.data && !versions.data.meta.send_enabled ? <p role="status">Office delivery gate closed.</p> : null}
      {latest?.approved_at ? <p>Approved {formatDateTime(latest.approved_at)}</p> : null}
      {action.isSuccess && action.variables === "send" ? <p role="status">Send intent recorded. Delivery is not confirmed.</p> : null}
      {error ? <p role="alert">{errorMessage}</p> : null}
      {versions.isLoading ? <p role="status">Loading district versions...</p> : null}
      {latest ? <div className="report-builder__preview">
        <iframe title={`Official weekly report version ${latest.version}`} src={`${env.apiBaseUrl}/api/v1/district-reports/${latest.uuid}/document`} />
      </div> : null}
    </section>
  );
}
