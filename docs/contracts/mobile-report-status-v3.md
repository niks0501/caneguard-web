# Mobile report status API contract v3

`mobile-report-status-v3` is the owner-scoped field-reporter status feed for
Phase 3 office advisories. It keeps the v2 snapshot fields and adds the
nullable `advisory` object. A `null` advisory means that no office guidance has
been selected for the case.

## Endpoint

`GET /api/v3/mobile/reports/statuses`

Authentication, field-reporter ownership, cursor ordering, and checkpoint
semantics are the same as [`mobile-report-status-v2.md`](mobile-report-status-v2.md).
The v3 checkpoint remains `sync.before`; clients must follow `links.next` and
retain the original checkpoint for all pages.
The `sync` block also carries `version`, `total`, `truncated` and `unchanged` as described in v2, including the `sync_version` binding on continuation pages; the v3 version digest covers the lifecycle and advisory fields.

## Lifecycle and workflow status

Each item also carries the lifecycle dimensions beside the legacy
`review_status`, which is unchanged. A completed visit therefore no longer has
to read as "field validation needed" on the client.

| Field | Type | Description |
| --- | --- | --- |
| `lifecycle` | Object | `case_state`, `verification_outcome`, `field_validation_state` and `referral_state`, as in [`report-lifecycle-v1.md`](report-lifecycle-v1.md). Never null; legacy rows fall back to the projection of `review_status`. |
| `workflow_status` | String enum | Server-derived reviewer-facing status: `resolved`, `field_validation`, `referred`, `follow_up`, `under_review` or `needs_review`, in that precedence. It mirrors `deriveWorkflowStatus` in `src/domain/workflowStatus.ts`. |

These are additive v3 fields; v2 keeps its exact shape.

## Advisory payload

The `advisory` payload is delivered only after office validation. A later retirement remains visible for an already selected case so the reporter retains the guidance they received:

| Field | Type | Description |
| --- | --- | --- |
| `uuid` | UUID | Stable advisory identity. |
| `code` | String | Office guidance code. |
| `title` | String | Short guidance title, as it read when the office selected it for this case. |
| `content` | String | Content the field reporter should follow, as it read when the office selected it for this case. |
| `status` | `validated` or `retired` | Selection requires validation; a later retirement remains visible on an already selected case. |
| `selected_at` | ISO-8601 date-time | Time the office selected the guidance for this case. |
| `delivery_state` | `pending`, `delivered`, `acknowledged` | Server delivery state across the feed and notification channels. |
| `delivered_at` | ISO-8601 date-time or null | Time the durable notification was recorded. |
| `validated_at` | ISO-8601 date-time or null | Time the office validated the guidance. |

`title` and `content` are frozen on the report at selection time (`advisory_title_snapshot` and `advisory_content_snapshot`), so a later edit to the library entry never rewrites guidance a reporter already received. Reports selected before this was introduced were backfilled from the then-current wording. If a report has no snapshot, the live advisory wording is served. All other keys and types are unchanged. An advisory that is later archived (deleted from the library) still resolves for cases that used it.

Validation provenance is retained in the office guidance library and printable
summary; it is not a field-reporter identity field in the mobile feed.

## Office advisory library API

One shared pool, co-managed by every office reviewer and admin. Every route needs an office user; anyone else gets `403`. Topics cover diseases, pests and general field operations through the optional `category` (`rust`, `smut`, `mosaic`, `rssi`, `general`, or `null`).

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/advisories` | Lists the library, validated first. Archived advisories are excluded. Each row adds `category`. |
| POST | `/api/v1/advisories` | `title` (160) and `content` (10000) required; `category` and `code` (64, `[A-Za-z0-9._-]`) optional. Created active at once (`status: validated`, validated by the creator). A blank `code` becomes `ADV-<CATEGORY>-NNN` (`ADV-GENERAL-NNN` without a category), the next free number. `201` with the advisory. |
| PATCH | `/api/v1/advisories/{uuid}` | Edits `title`, `content`, `category` or `code` in place for draft and validated advisories. Never alters wording already sent to a case. A retired or archived advisory answers `422` on `status`. |
| DELETE | `/api/v1/advisories/{uuid}` | `200` with `{"data": {"uuid": "...", "deleted": "hard" or "archived"}}`. `hard` when no report, farmer-request reply or barangay broadcast uses it; otherwise `archived` (soft delete, repeatable). |
| POST | `/api/v1/advisories/{uuid}/validate`, `/retire`, `/status` | Unchanged. |

Selecting a retired or archived advisory for a case, a farmer-request reply or a barangay broadcast answers `422` with `errors.advisory_uuid` = "This advisory was removed from the office library. Pick another one." An archived advisory also hides any broadcast built on it from farmers, and the office list still shows that broadcast with `live: false`.

The sanitized fixture is
[`examples/mobile-report-status-v3.json`](examples/mobile-report-status-v3.json).
