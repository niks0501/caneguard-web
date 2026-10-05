import { z } from "zod";
import { axiosClient } from "../api/axiosClient";
import { initializeCsrf } from "../auth/auth.api";
import { ApiError } from "../api/ApiError";
import { notifySessionExpired } from "../auth/authSession";

export const keyLabels = { "report:approve": "Approve reports", "report:send": "Send reports", "staff:manage": "Manage staff" } as const;
export type AccountKey = keyof typeof keyLabels;
export const roleLabels: Record<string, string> = { farmer: "Farmer", field_reporter: "Inspector", reviewer: "Reviewer", admin: "District Mill Officer" };
export const membershipLabels: Record<string, string> = { not_issued: "Not issued", active: "Active", revoked: "Revoked" };
const grantSchema = z.object({ id: z.number().int(), ability: z.string(), revision: z.number().int(), revoked: z.boolean() });
export const accountSchema = z.object({
  uuid: z.uuid(), name: z.string(), email: z.string(), created_at: z.string(), origin: z.string(), email_verified: z.boolean(),
  role: z.string(), membership_state: z.string(), effective_grants: z.array(z.string()), stored_grants: z.array(z.string()),
  review_state: z.string(), web_access_allowed: z.boolean(), access_version: z.number().int().positive(),
  allowed_actions: z.array(z.string()), denial_reasons: z.array(z.string()), grant_revisions: z.array(grantSchema),
  impact: z.object({ historical_approvals: z.number().int().nonnegative(), pending_deliveries: z.number().int().nonnegative() }).optional(),
});
export type Account = z.infer<typeof accountSchema>;
const policySchema = z.object({
  district: z.object({ code: z.string(), name: z.string() }), one_approver: z.literal(true),
  approver: z.object({ uuid: z.uuid(), name: z.string(), access_version: z.number().int().positive() }).nullable(),
  transfer_available: z.boolean(), scope: z.string(),
});
export type AccountsPolicy = z.infer<typeof policySchema>;
export const listSchema = z.object({ contract_version: z.literal("accounts-access-v1"), data: z.array(accountSchema),
  meta: z.object({ page: z.number().int(), per_page: z.number().int(), total: z.number().int(), filtered_total: z.number().int(),
    counts: z.object({ new: z.number().int(), staff: z.number().int(), farmers: z.number().int(), revoked: z.number().int(), all: z.number().int() }), scope: policySchema }) });
const detailSchema = z.object({ contract_version: z.literal("accounts-access-v1"), data: accountSchema, policy: policySchema });
const snapshotSchema = z.object({ role: z.string(), membership_state: z.string(), membership_id: z.number().nullable(), grants: z.array(grantSchema), review_state: z.string() });
export const eventSchema = z.object({ id: z.number().int(), contract_version: z.literal("account-access-event-v1"), operation_id: z.uuid(), target_uuid: z.uuid(),
  actor: z.object({ uuid: z.uuid().optional(), name: z.string().optional(), role: z.string().optional(), channel: z.string().optional() }),
  action: z.string(), office_reference: z.string(), before: snapshotSchema, after: snapshotSchema, occurred_at: z.string() });
const eventsSchema = z.object({ contract_version: z.literal("accounts-access-v1"), data: z.array(eventSchema), meta: z.object({ page: z.number().int(), per_page: z.number().int(), total: z.number().int(), history_completeness: z.string() }) });
const mutationSchema = z.object({ contract_version: z.literal("accounts-access-v1"), code: z.enum(["ACCOUNT_ACCESS_UPDATED", "ACCOUNT_ACCESS_UNCHANGED", "ACCOUNT_REVIEW_UPDATED"]),
  data: accountSchema, event_id: z.number().nullable(), operation_id: z.uuid(), access_version: z.number().int(), credentials_revoked: z.boolean(), affected: z.array(accountSchema).optional() });
export type AccountsFilters = { view: "new" | "staff" | "farmers" | "revoked" | "all"; role: string; verification: string; membership: string; sort: string; page: number; per_page: number; search: string };
export type AccountCommand = { expected_access_version: number; operation: "admit" | "replace" | "revoke" | "restore"; desired: { role: string; grants: AccountKey[] } }
  | { expected_access_version: number; disposition: "keep_farmer" | "defer" | "reopen" }
  | { from_uuid: string; to_uuid: string; from_expected_access_version: number; to_expected_access_version: number };
export function isSupportedAccount(account: Account) {
  return Object.hasOwn(roleLabels, account.role) && Object.hasOwn(membershipLabels, account.membership_state)
    && ["public_signup", "office_certified", "unknown"].includes(account.origin)
    && ["new", "keep_farmer", "defer", "staff_assigned"].includes(account.review_state)
    && account.stored_grants.every(key => Object.hasOwn(keyLabels, key));
}
function denied(error: unknown): never {
  if (error instanceof ApiError && error.status === 403 && error.code === "FORBIDDEN") notifySessionExpired();
  throw error;
}
export async function listAccounts(filters: AccountsFilters, signal?: AbortSignal) {
  return listSchema.parse((await axiosClient.get("/api/v2/admin/accounts", { params: filters, signal }).catch(denied)).data);
}
export async function getAccount(uuid: string, signal?: AbortSignal) {
  return detailSchema.parse((await axiosClient.get(`/api/v2/admin/accounts/${encodeURIComponent(uuid)}`, { signal }).catch(denied)).data);
}
export async function getAccountEvents(uuid: string, page: number, signal?: AbortSignal) {
  return eventsSchema.parse((await axiosClient.get(`/api/v2/admin/accounts/${encodeURIComponent(uuid)}/events`, { params: { page }, signal }).catch(denied)).data);
}
export async function changeAccount(uuid: string, command: AccountCommand, reference: string, password: string, idempotencyKey: string) {
  await initializeCsrf();
  const body = { ...command, contract_version: "accounts-access-v1", office_reference: reference.trim(), current_password: password, idempotency_key: idempotencyKey };
  const response = "from_uuid" in command ? await axiosClient.post("/api/v2/admin/accounts/approval-transfer", body).catch(denied)
    : await axiosClient.put(`/api/v2/admin/accounts/${encodeURIComponent(uuid)}/${"disposition" in command ? "review" : "access"}`, body).catch(denied);
  return mutationSchema.parse(response.data);
}
