import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { axiosClient } from "../../api/axiosClient";
import { toApiError } from "../../api/ApiError";
import { env } from "../../config/env";
import type { DiseaseReport } from "../../domain/report.types";
import { aerialCheckLive, aerialGateReadCount, aerialSettingsKey, isCaseDetailQuery, recordAerialGate, reportKeys } from "../../hooks/reportQueries";
import { Button } from "../ui/Button";

const schema = z.object({
  data: z.object({
    installed: z.boolean(),
    enabled: z.boolean(),
    model_version: z.string().optional(),
    retention_days: z.number().int().positive().optional(),
    counts: z.object({
      active: z.number().int().nonnegative(),
      removed: z.number().int().nonnegative(),
    }).optional(),
    readiness: z.object({
      model_configured: z.boolean(),
      storage_writable: z.boolean(),
      timeout_seconds: z.number().int().positive(),
    }).optional(),
  }),
});
type AerialSettings = z.infer<typeof schema>["data"];
const url = "/api/v1/admin/aerial-analysis";

const caseDetails = { queryKey: reportKeys.details(), predicate: isCaseDetailQuery };

/** In-flight case reads are cancelled first so they cannot restore evidence. */
async function evictAerialEvidence(queryClient: QueryClient) {
  await queryClient.cancelQueries(caseDetails);
  queryClient.setQueriesData<DiseaseReport>(
    caseDetails,
    (current) => current && { ...current, aerialAnalyses: undefined },
  );
  queryClient.removeQueries({ queryKey: ["aerial-mask"] });
}

/**
 * The check is live only when the server has it installed and an Admin has it
 * switched on. Once it is not live, drop cached results.
 */
async function reconcileAerialCache(queryClient: QueryClient, settings: AerialSettings) {
  recordAerialGate(settings);
  if (!aerialCheckLive(settings)) await evictAerialEvidence(queryClient);
  void queryClient.invalidateQueries(caseDetails);
}

function sameGate(a: AerialSettings | undefined, b: AerialSettings) {
  return a !== undefined && a.installed === b.installed && a.enabled === b.enabled;
}

export function AerialAnalysisSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: aerialSettingsKey, retry: false, enabled: env.dataSource === "api",
    queryFn: async ({ signal, client }) => {
      const settings = schema.parse((await axiosClient.get(url, { signal })).data).data;
      await reconcileAerialCache(client, settings);
      return settings;
    },
  });
  const save = useMutation({
    retry: false,
    networkMode: "always",
    mutationFn: async (enabled: boolean) => {
      if (!navigator.onLine) throw new Error("An online connection is required.");
      return axiosClient.put(url, { enabled });
    },
    onMutate: () => aerialGateReadCount(),
    onSuccess: async (response, _enabled, readsAtSend) => {
      const next = schema.parse(response.data).data;
      await queryClient.cancelQueries({ queryKey: aerialSettingsKey });
      const current = queryClient.getQueryData<AerialSettings>(aerialSettingsKey);
      if (aerialGateReadCount() !== readsAtSend && !sameGate(current, next)) {
        await evictAerialEvidence(queryClient);
        await queryClient.resetQueries({ queryKey: aerialSettingsKey, type: "all" });
        return;
      }
      queryClient.setQueryData(aerialSettingsKey, next);
      await reconcileAerialCache(queryClient, next);
    },
  });
  if (env.dataSource !== "api") return null;
  const settings = query.data;
  const error = save.error ?? query.error;
  return (
    <section className="settings-card settings-card--wide" aria-labelledby="aerial-settings-heading">
      <div className="section-heading">
        <h2 id="aerial-settings-heading">Aerial canopy check</h2>
      </div>
      {query.isLoading ? <p role="status">Loading aerial check...</p> : null}
      {settings ? (
        <div className="aerial-settings">
          <p className="aerial-settings__status">
            <strong>{settings.installed ? (settings.enabled ? "On" : "Off") : "Not installed on this server"}</strong>
          </p>
          {settings.readiness || settings.counts ? (
            <dl className="aerial-settings__grid">
              <div>
                <dt>Server install</dt>
                <dd>
                  {settings.installed
                    ? `Installed${settings.model_version ? ` · ${settings.model_version}` : ""}`
                    : "Not installed"}
                </dd>
              </div>
              {settings.readiness ? (
                <>
                  <div>
                    <dt>Model file</dt>
                    <dd>{settings.readiness.model_configured ? "Readable" : "Missing or unreadable"}</dd>
                  </div>
                  <div>
                    <dt>Private storage</dt>
                    <dd>{settings.readiness.storage_writable ? "Writable" : "Not writable"}</dd>
                  </div>
                  <div>
                    <dt>Inference timeout</dt>
                    <dd>{settings.readiness.timeout_seconds}s</dd>
                  </div>
                </>
              ) : null}
              {settings.counts ? (
                <div>
                  <dt>Stored checks</dt>
                  <dd>
                    {settings.counts.active} active · {settings.counts.removed} removed
                    {settings.retention_days ? ` (pruned after ${settings.retention_days} days)` : ""}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {settings.installed ? (
            <div className="settings-form__actions">
              <Button type="button" disabled={save.isPending} onClick={() => save.mutate(!settings.enabled)}>
                {settings.enabled ? "Turn off aerial check" : "Turn on aerial check"}
              </Button>
              <p className="aerial-settings__note">
                {settings.enabled
                  ? "Turning off hides the Aerial tab immediately; stored photos stay safe."
                  : "Turning on enables the Aerial tab for office reviewers."}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert">
          {toApiError(error).status === 403
            ? "Your Admin access could not be verified."
            : "The aerial check setting could not be saved or loaded. Try again when online."}
        </p>
      ) : null}
    </section>
  );
}
