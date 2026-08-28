# Mobile report status API contract v1

This document is the canonical wire contract for the mobile authority-review status feed.

The contract is owned by the Laravel API in this repository.
The mobile client must consume this response shape without renaming or relocating fields.

## Endpoint

`GET /api/v1/mobile/reports/statuses`

The endpoint returns the current authority-review snapshot for reports owned by the authenticated field reporter.

## Authentication and authorization

The request must use a Sanctum bearer token with the `report:status` ability.

The authenticated user must have the field reporter role and may receive only that user's reports.

Unauthenticated requests return `401 UNAUTHENTICATED`.

Reviewer, administrator, and tokens without the `report:status` ability cannot read this feed and return `403 FORBIDDEN`.

## Query parameters

| Parameter | Type | Required | Semantics |
| --- | --- | --- | --- |
| `updated_after` | ISO-8601 date-time | No | Returns reports whose `updated_at` is strictly later than this value. |
| `sync_before` | ISO-8601 date-time | No | Sets the inclusive upper bound for the feed traversal. If omitted, the API creates the checkpoint from the current time. |
| `per_page` | Integer from 1 through 100 | No | Page size. The default is 100. |
| `cursor` | Opaque cursor string | No | Cursor returned by `links.next`. Clients must follow the returned URL rather than constructing a cursor. |

The first request establishes a feed checkpoint in `sync.before`.

Every continuation URL for that traversal carries the same `sync_before` query parameter.

Clients must retain the checkpoint while consuming every page and must not use a later checkpoint from an individual continuation response.

The cursor ordering is `(updated_at, id)` so rows with tied timestamps remain deterministic.

## Response envelope

The response contains `data`, `links`, `meta`, and `sync` top-level objects.

### `data`

`data` is an array of report status snapshots.

Each item contains exactly these fields:

| Field | Type | Nullability | Description |
| --- | --- | --- | --- |
| `uuid` | String | Non-null | Server-owned report UUID. |
| `client_uuid` | String | Non-null | Stable client-created report UUID. |
| `reference_code` | String | Non-null | Server-generated human-readable report reference. |
| `review_status` | String enum | Non-null | Current authority-review status. |
| `review_notes` | String | Nullable | Latest authority feedback, or `null` when no feedback exists. |
| `reviewed_at` | ISO-8601 date-time string | Nullable | Time of the latest authority review, or `null` when the report has not been reviewed. |
| `updated_at` | ISO-8601 date-time string | Non-null | Last report update time used by incremental synchronization. |

The supported `review_status` values are:

- `submitted_unverified`
- `for_field_validation`
- `verified_by_staff`
- `unable_to_verify`
- `resolved`

### `links`

`links.next` is either an absolute continuation URL string or `null` when there are no more pages.

The continuation URL may include `cursor` and `sync_before` query parameters.

The `sync_before` query parameter in a continuation URL is transport state and does not replace the canonical response checkpoint.

### `meta`

`meta` is an object containing Laravel cursor-pagination metadata.

Clients must tolerate additional pagination metadata and should use `links.next` for traversal.

### `sync`

`sync.before` is the canonical v1 checkpoint field.

It is a non-null UTC ISO-8601 date-time string.

Do not read `meta.sync_before` or root-level `sync_before` as alternatives to this field.

All pages in one feed traversal use the same `sync.before` value.

## Privacy boundary

The mobile status feed does not return reviewer identity, reviewer email, reviewer name, or review history.

The mobile client may display generic authority attribution without identifying the reviewer.

## Canonical example

The sanitized example at [`examples/mobile-report-status-v1.json`](examples/mobile-report-status-v1.json) is the fixture shape that mobile clients must parse.

The example intentionally includes nullable review fields and a canonical `sync.before` checkpoint.

## Producer and regression coverage

The producer is `api/app/Http/Controllers/Api/V1/MobileReportStatusController.php` with serialization in `api/app/Http/Resources/ReportStatusResource.php`.

`api/tests/Feature/MobileReportStatusTest.php` covers authentication, owner scoping, authorization, the five status values, exact serialized fields, checkpoint pagination, and reviewer identity omission.

The server may store additional lifecycle dimensions beside `review_status`, but this v1 contract does not expose them or change its exact response shape.

This v1 contract does not introduce an API version change, review-history endpoint, or mobile user-interface behavior.
