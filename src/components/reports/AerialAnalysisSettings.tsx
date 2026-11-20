import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { axiosClient } from "../../api/axiosClient";
import { toApiError } from "../../api/ApiError";
import { env } from "../../config/env";
import type { DiseaseReport } from "../../domain/report.types";
import { reportKeys } from "../../hooks/reportQueries";
import { Button } from "../ui/Button";

const schema = z.object({ data: z.object({ installed: z.boolean(), enabled: z.boolean() }) });
type AerialSettings = z.infer<typeof schema>["data"];
const url = "/api/v1/admin/aerial-analysis";
const settingsKey = ["aerial-analysis-settings"];

/**
 * The check is live only when the server has it installed and an Admin has it
 * switched on. Once it is not live, drop cached results: in-flight case reads
 * are cancelled first so they cannot restore them.
 */
async function reconcileAerialCache(queryClient: QueryClient, settings: AerialSettings) {
  if (!(settings.installed && settings.enabled)) {
    await queryClient.cancelQueries({ queryKey: reportKeys.details() });
    queryClient.setQueriesData<DiseaseReport>(
      { queryKey: reportKeys.details(), predicate: (cached) => cached.queryKey.length === reportKeys.detail("").length },
      (current) => current && { ...current, aerialAnalyses: undefined },
    );
    queryClient.removeQueries({ queryKey: ["aerial-mask"] });
  }
  void queryClient.invalidateQueries({ queryKey: reportKeys.details() });
}

export function AerialAnalysisSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: settingsKey, retry: false, enabled: env.dataSource === "api",
    queryFn: async ({ signal }) => {
      const settings = schema.parse((await axiosClient.get(url, { signal })).data).data;
      await reconcileAerialCache(queryClient, settings);
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
    onSuccess: async (response) => {
      const next = schema.parse(response.data).data;
      await queryClient.cancelQueries({ queryKey: settingsKey });
      queryClient.setQueryData(settingsKey, next);
      await reconcileAerialCache(queryClient, next);
    },
  });
  if (env.dataSource !== "api") return null;
  const settings = query.data;
  const error = save.error ?? query.error;
  return <section className="settings-card settings-card--wide" aria-labelledby="aerial-settings-heading">
    <div className="section-heading"><h2 id="aerial-settings-heading">Aerial canopy check</h2></div>
    {query.isLoading ? <p role="status">Loading aerial check...</p> : null}
    {settings ? <p>{settings.installed ? (settings.enabled ? "On" : "Off") : "Not installed on this server"}</p> : null}
    {settings?.installed ? <div className="settings-form__actions">
      <Button type="button" disabled={save.isPending} onClick={() => save.mutate(!settings.enabled)}>
        {settings.enabled ? "Turn off aerial check" : "Turn on aerial check"}
      </Button>
    </div> : null}
    {error ? <p role="alert">{toApiError(error).status === 403 ? "Your Admin access could not be verified." : "The aerial check setting could not be saved or loaded. Try again when online."}</p> : null}
  </section>;
}
