import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { axiosClient } from "../../api/axiosClient";
import { toApiError } from "../../api/ApiError";
import { env } from "../../config/env";
import { Button } from "../ui/Button";

const schema = z.object({ data: z.object({ installed: z.boolean(), enabled: z.boolean() }) });
const url = "/api/v1/admin/aerial-analysis";

export function AerialAnalysisSettings() {
  const query = useQuery({
    queryKey: ["aerial-analysis-settings"], retry: false, enabled: env.dataSource === "api",
    queryFn: async ({ signal }) => schema.parse((await axiosClient.get(url, { signal })).data).data,
  });
  const save = useMutation({
    retry: false,
    mutationFn: async (enabled: boolean) => {
      if (!navigator.onLine) throw new Error("An online connection is required.");
      return axiosClient.put(url, { enabled });
    },
    onSuccess: () => query.refetch(),
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
