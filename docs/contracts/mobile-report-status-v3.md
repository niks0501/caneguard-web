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
The `sync` block also carries `version`, `total`, `truncated` and `unchanged` as described in v2; the v3 version digest covers the lifecycle and advisory fields.

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
| `title` | String | Short guidance title. |
| `content` | String | Content the field reporter should follow. |
| `status` | `validated` or `retired` | Selection requires validation; a later retirement remains visible on an already selected case. |
| `selected_at` | ISO-8601 date-time | Time the office selected the guidance for this case. |
| `delivery_state` | `pending`, `delivered`, `acknowledged` | Server delivery state across the feed and notification channels. |
| `delivered_at` | ISO-8601 date-time or null | Time the durable notification was recorded. |
| `validated_at` | ISO-8601 date-time or null | Time the office validated the guidance. |

Validation provenance is retained in the office guidance library and printable
summary; it is not a field-reporter identity field in the mobile feed.

The sanitized fixture is
[`examples/mobile-report-status-v3.json`](examples/mobile-report-status-v3.json).
