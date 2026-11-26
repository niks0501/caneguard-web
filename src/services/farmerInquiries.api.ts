import { z } from "zod";
import { axiosClient } from "../api/axiosClient";
import { initializeCsrf } from "../auth/auth.api";

export const inquiryStatuses = { new: "New", reviewing: "Reviewing", replied: "Replied" } as const;
export type InquiryStatus = keyof typeof inquiryStatuses;
export const concernLabels: Record<string, string> = {
  spreading: "Spreading to other leaves",
  changed_since_last: "Changed since last check",
  new_leaves: "New leaves affected",
  want_to_be_sure: "Wants to be sure",
};
export const hintLabels: Record<string, string> = { healthy: "Healthy", mosaic: "Mosaic", rust: "Rust", smut: "Smut", uncertain: "Uncertain" };

const photoSchema = z.object({ position: z.number().int(), url: z.string(), content_type: z.string(), bytes: z.number().int() });
const replySchema = z.object({
  uuid: z.uuid(), kind: z.enum(["advice", "note"]), body: z.string(), advisory_title: z.string().nullable(),
  created_at: z.string().nullable(), author_name: z.string().nullable().optional(),
});
export const inquirySchema = z.object({
  uuid: z.uuid(),
  status: z.enum(["new", "reviewing", "replied"]),
  lock_version: z.number().int().positive(),
  farmer: z.object({ uuid: z.uuid(), name: z.string() }),
  barangay: z.string(),
  landmark: z.string().nullable(),
  concern: z.string().nullable(),
  note: z.string().nullable(),
  ai_hint: z.object({ label: z.string(), confidence_percent: z.number().nullable(), verified: z.literal(false) }).nullable(),
  photos: z.array(photoSchema),
  replies: z.array(replySchema),
  reviewed_by: z.string().nullable(),
  created_at: z.string().nullable(),
  replied_at: z.string().nullable(),
});
export type FarmerInquiry = z.infer<typeof inquirySchema>;
const listSchema = z.object({
  data: z.array(inquirySchema),
  meta: z.object({ page: z.number().int(), per_page: z.number().int(), total: z.number().int(), waiting: z.number().int() }),
});
const oneSchema = z.object({ data: inquirySchema });
export type InquiryFilters = { page: number; status: "" | InquiryStatus; barangay: string };

export async function listFarmerInquiries(filters: InquiryFilters, signal?: AbortSignal) {
  const params = { page: filters.page, status: filters.status || undefined, barangay: filters.barangay || undefined };
  return listSchema.parse((await axiosClient.get("/api/v1/farmer-inquiries", { params, signal })).data);
}
export async function startInquiryReview(uuid: string, expectedLockVersion: number) {
  await initializeCsrf();
  return oneSchema.parse((await axiosClient.post(`/api/v1/farmer-inquiries/${encodeURIComponent(uuid)}/review`, { expected_lock_version: expectedLockVersion })).data).data;
}
export type InquiryReply = { expected_lock_version: number; advisory_uuid?: string; body?: string };
export async function replyToInquiry(uuid: string, reply: InquiryReply) {
  await initializeCsrf();
  return oneSchema.parse((await axiosClient.post(`/api/v1/farmer-inquiries/${encodeURIComponent(uuid)}/replies`, reply)).data).data;
}

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
