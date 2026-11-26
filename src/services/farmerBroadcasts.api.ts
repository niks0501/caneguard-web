import { z } from "zod";
import { axiosClient } from "../api/axiosClient";
import { initializeCsrf } from "../auth/auth.api";

const advisoryListSchema = z.object({
  data: z.array(z.object({ uuid: z.uuid(), code: z.string(), title: z.string(), content: z.string(), status: z.string() })),
});
/** Only validated advisories can be sent to a farmer; drafts and retired ones never appear. */
export async function listValidatedAdvisories(signal?: AbortSignal) {
  const { data } = advisoryListSchema.parse((await axiosClient.get("/api/v1/advisories", { signal })).data);
  return data.filter(advisory => advisory.status === "validated");
}

export const broadcastSchema = z.object({
  uuid: z.uuid(),
  advisory: z.object({ uuid: z.uuid(), code: z.string(), title: z.string() }),
  headline_tl: z.string(), headline_en: z.string(), body_tl: z.string(), body_en: z.string(),
  barangays: z.array(z.string()).nullable(),
  published_at: z.string(), expires_at: z.string(), retired_at: z.string().nullable(),
  live: z.boolean(), reach: z.number().int(),
});
export type FarmerBroadcast = z.infer<typeof broadcastSchema>;
export type BroadcastCommand = {
  advisory_uuid: string; headline_tl: string; headline_en: string; body_tl: string; body_en: string;
  all_barangays: boolean; barangays: string[]; expires_in_days: number;
};
export async function listFarmerBroadcasts(signal?: AbortSignal) {
  return z.object({ data: z.array(broadcastSchema) }).parse((await axiosClient.get("/api/v1/farmer-broadcasts", { signal })).data).data;
}
export async function publishFarmerBroadcast(command: BroadcastCommand) {
  await initializeCsrf();
  return z.object({ data: broadcastSchema }).parse((await axiosClient.post("/api/v1/farmer-broadcasts", command)).data).data;
}
export async function retireFarmerBroadcast(uuid: string) {
  await initializeCsrf();
  return z.object({ data: broadcastSchema }).parse((await axiosClient.post(`/api/v1/farmer-broadcasts/${encodeURIComponent(uuid)}/retire`)).data).data;
}
