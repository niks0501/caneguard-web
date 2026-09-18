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

## Advisory payload

The `advisory` payload is delivered only for a validated office advisory:

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
