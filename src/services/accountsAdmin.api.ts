import { z } from "zod";
import { axiosClient } from "../api/axiosClient";
import { initializeCsrf } from "../auth/auth.api";

export const roleLabels = { reviewer: "Reviewer", admin: "Admin" } as const;
export const accountSchema = z.object({
  uuid: z.uuid(), name: z.string(), email: z.email(),
  role: z.enum(["reviewer", "admin"]), is_active: z.boolean(),
  access_version: z.number().int().positive(),
});
export type Account = z.infer<typeof accountSchema>;
export const listSchema = z.object({
  data: z.array(accountSchema),
  meta: z.object({ page: z.number().int(), per_page: z.number().int(), total: z.number().int() }),
});
const detailSchema = z.object({ data: accountSchema });
const accessSnapshotSchema = z.object({ role: z.string(), is_active: z.boolean() });
export const eventSchema = z.object({
  id: z.number().int(), action: z.string(), outcome: z.string(), actor_name: z.string(), created_at: z.string(),
  before: accessSnapshotSchema.nullable(), after: accessSnapshotSchema.nullable(),
});
const eventsSchema = z.object({ data: z.array(eventSchema) });
export type AccountsFilters = { page: number; search: string };
export type AccountCommand = { role: Account["role"]; is_active: boolean; expected_access_version: number };

export async function listAccounts(filters: AccountsFilters, signal?: AbortSignal) {
  return listSchema.parse((await axiosClient.get("/api/v1/admin/accounts", { params: filters, signal })).data);
}
export async function getAccount(uuid: string, signal?: AbortSignal) {
  return detailSchema.parse((await axiosClient.get(`/api/v1/admin/accounts/${encodeURIComponent(uuid)}`, { signal })).data);
}
export async function getAccountEvents(uuid: string, signal?: AbortSignal) {
  return eventsSchema.parse((await axiosClient.get(`/api/v1/admin/accounts/${encodeURIComponent(uuid)}/events`, { signal })).data);
}
export async function changeAccount(uuid: string, command: AccountCommand, password: string) {
  await initializeCsrf();
  return detailSchema.parse((await axiosClient.patch(`/api/v1/admin/accounts/${encodeURIComponent(uuid)}`, {
    ...command, current_password: password,
  })).data);
}
