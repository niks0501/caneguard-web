import { z } from "zod";

export const transmissionSchema = z.object({
  id: z.number().int(), state: z.enum(["pending", "delivering", "sent", "failed", "cancelled"]),
  transport_receipt: z.string().nullable(), failure_reason: z.string().nullable(),
  requested_name: z.string().nullable(), requested_by_id: z.number().int(),
  completed_at: z.string().nullable(), created_at: z.string(),
});

export const automationSchema = z.object({
  enabled: z.boolean(),
  day: z.number().int().min(1).max(7),
  time: z.string(),
  timezone: z.string().default("Asia/Manila"),
  last_run_at: z.string().nullable().default(null),
  last_status: z.enum(["success", "failed"]).nullable().default(null),
  last_week: z.string().nullable().default(null),
  last_error: z.string().nullable().default(null),
  next_run_at: z.string().nullable().default(null),
});

export const versionSchema = z.object({
  uuid: z.string().uuid(), version: z.number().int(), content_hash: z.string().regex(/^[a-f0-9]{64}$/),
  approved_at: z.string().nullable(), approved_name: z.string().nullable().optional(),
  approved_title: z.string().nullable().optional(), prepared_name: z.string().nullable().optional(),
  prepared_source: z.enum(["manual", "scheduled"]).optional().default("manual"),
  created_at: z.string().optional(), version_reason: z.string().optional(),
  appendix_enabled: z.boolean().optional(), document_sha256: z.string().nullable().optional(),
  week: z.string().optional(),
  is_current: z.boolean().default(true),
  stale_reason: z.enum(["newer_version", "evidence_changed"]).nullable().default(null),
  headline: z.object({ cases: z.number().int(), confirmed: z.number().int(), late_evidence: z.number().int() }).optional(),
  disease_counts: z.record(z.string(), z.number().int()).optional(),
  transmissions: z.array(transmissionSchema).default([]),
});

export const listSchema = z.object({
  data: z.array(versionSchema),
  meta: z.object({
    send_enabled: z.boolean().default(false),
    delivery_gate_open: z.boolean().default(false),
    recipients_configured: z.boolean().default(false),
    recipient_count: z.number().int().min(0).default(0),
    email_send_retired: z.boolean().default(true),
    appendix_allowed: z.boolean().default(false),
    automation: automationSchema.optional(),
  }),
});

export const rssiVersionSchema = z.object({
  uuid: z.string().uuid(),
  version: z.number().int(),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/),
  prepared_source: z.enum(["manual", "scheduled"]).optional().default("manual"),
  prepared_name: z.string().nullable().optional(),
  created_at: z.string().optional(),
  version_reason: z.string().optional(),
  pdf_sha256: z.string().optional(),
  csv_sha256: z.string().optional(),
  week: z.string().optional(),
  is_current: z.boolean().default(true),
  stale_reason: z.enum(["newer_version", "evidence_changed"]).nullable().default(null),
  headline: z.object({ validated: z.number().int(), suspected: z.number().int() }).optional(),
});

export const rssiListSchema = z.object({
  data: z.array(rssiVersionSchema),
});

export type ReportVersion = z.infer<typeof versionSchema>;
export type ReportListMeta = z.infer<typeof listSchema>["meta"];
export type AutomationStatus = z.infer<typeof automationSchema>;
export type RssiReportVersion = z.infer<typeof rssiVersionSchema>;
export type WeekStatus = "not_prepared" | "draft" | "approved" | "stale" | "sent" | "failed";

export const weekStatusLabels: Record<WeekStatus, string> = {
  not_prepared: "Not generated",
  draft: "Ready to review",
  approved: "Approved",
  stale: "Needs refresh",
  sent: "Sent",
  failed: "Delivery failed",
};

/** Status of a week from its versions (any order). */
export function weekStatus(versions: ReportVersion[]): WeekStatus {
  const latest = [...versions].sort((a, b) => b.version - a.version)[0];
  if (!latest) return "not_prepared";
  if (!latest.is_current) return "stale";
  return latest.approved_at ? "approved" : "draft";
}

/** Newest first, each with headline deltas against the previous version of the same week. */
export function versionTimeline(versions: ReportVersion[]) {
  const ordered = [...versions].sort((a, b) => b.version - a.version);
  return ordered.map((version, index) => {
    const previous = ordered[index + 1];
    const delta = (key: "cases" | "confirmed" | "late_evidence") =>
      version.headline && previous?.headline ? version.headline[key] - previous.headline[key] : null;
    return { version, deltas: { cases: delta("cases"), confirmed: delta("confirmed"), late_evidence: delta("late_evidence") } };
  });
}
