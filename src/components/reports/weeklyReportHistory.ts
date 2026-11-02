import { z } from "zod";

export const transmissionSchema = z.object({
  id: z.number().int(), state: z.enum(["pending", "delivering", "sent", "failed", "cancelled"]),
  transport_receipt: z.string().nullable(), failure_reason: z.string().nullable(),
  requested_name: z.string().nullable(), requested_by_id: z.number().int(),
  completed_at: z.string().nullable(), created_at: z.string(),
});
export const versionSchema = z.object({
  uuid: z.string().uuid(), version: z.number().int(), content_hash: z.string().regex(/^[a-f0-9]{64}$/),
  approved_at: z.string().nullable(), approved_name: z.string().nullable().optional(),
  approved_title: z.string().nullable().optional(), prepared_name: z.string().nullable().optional(),
  created_at: z.string().optional(), version_reason: z.string().optional(),
  appendix_enabled: z.boolean().optional(), document_sha256: z.string().nullable().optional(),
  week: z.string().optional(),
  is_current: z.boolean().default(true),
  stale_reason: z.enum(["newer_version", "evidence_changed"]).nullable().default(null),
  headline: z.object({ cases: z.number().int(), confirmed: z.number().int(), late_evidence: z.number().int() }).optional(),
  transmissions: z.array(transmissionSchema).default([]),
});
export const listSchema = z.object({
  data: z.array(versionSchema), meta: z.object({ send_enabled: z.boolean(), appendix_allowed: z.boolean().default(false) }),
});

export type ReportVersion = z.infer<typeof versionSchema>;
export type WeekStatus = "not_prepared" | "draft" | "approved" | "stale" | "sent" | "failed";

export const weekStatusLabels: Record<WeekStatus, string> = {
  not_prepared: "Not prepared", draft: "Draft", approved: "Approved", stale: "Stale", sent: "Sent", failed: "Delivery failed",
};

/** Status of a week from its versions (any order). Sent wins, then staleness, then a failed latest delivery. */
export function weekStatus(versions: ReportVersion[]): WeekStatus {
  const latest = [...versions].sort((a, b) => b.version - a.version)[0];
  if (!latest) return "not_prepared";
  const receipt = latest.transmissions[0];
  if (receipt?.state === "sent") return "sent";
  if (!latest.is_current) return "stale";
  if (receipt && ["failed", "cancelled"].includes(receipt.state)) return "failed";
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
