# Mobile report review status contract

This document is authoritative for the existing Laravel mobile status feed used by
Field Reporter clients. It is additive to `/api/v1`; it does not replace report
submission or the reviewer workflow.

## Read status snapshots

`GET /api/v1/mobile/reports/statuses`

The request requires Sanctum bearer authentication, the `report:status` token
ability, and a `field_reporter` account. Results are scoped to the authenticated
reporter. Reviewer and admin accounts must use the reviewer API instead.

Each `data` item is the exact current snapshot below. The feed intentionally does
not include reviewer UUID, name, or email:

```json
{
  "uuid": "server-report-uuid",
  "client_uuid": "stable-mobile-report-uuid",
  "reference_code": "CG-20260813-AB12CD34",
  "review_status": "verified_by_staff",
  "review_notes": "Latest plain-text authority note or null",
  "reviewed_at": "2026-08-13T10:20:30.123000Z",
  "updated_at": "2026-08-13T10:20:31.456000Z"
}
```

`review_status` is one of these five wire values:

- `submitted_unverified`
- `for_field_validation`
- `verified_by_staff`
- `unable_to_verify`
- `resolved`

`review_notes` is the latest optional plain-text note only. Review history and
threaded replies are not part of this contract. Mobile presentation may call the
author `Authority staff`, but that label is not an API field.

The response retains Laravel's existing top-level `data`, `links`, and `meta`
pagination keys and also includes `sync.before`. Pagination is cursor-based and
ordered by `(updated_at, id)`. Clients must follow the returned cursor links and
retain the same `sync.before` checkpoint for a complete refresh. `updated_after`
is an optional incremental lower bound; `per_page` is 1–100.

## Review mutation and retry behavior

Reviewer and admin roles may update the current snapshot through the existing
`PATCH /api/v1/reports/{report}/review` endpoint. Field Reporters are read-only
for review data. Mutation uses `expected_version` and increments `lock_version`;
stale writes return a conflict. `unable_to_verify` requires a note, and notes are
limited to 1000 characters.

A repeated mobile submission with the same `(reporter_id, client_uuid)` returns
that existing report and its server UUID. It must not reset or overwrite its
review status, note, reviewer, reviewed time, or lock version.

The API may store `case_state`, `verification_outcome`, `field_validation_state`,
and `referral_state` alongside `review_status`.

These dimensions are exposed by reviewer-facing report resources, but are
intentionally omitted from the exact Mobile status snapshot.

Legacy status values are mapped without reopening completed
`verified_by_staff`, `unable_to_verify`, or `resolved` records.

See [`docs/contracts/report-lifecycle-v1.md`](../../docs/contracts/report-lifecycle-v1.md)
for the values and mapping.

This Mobile status contract adds no push notifications, unread state, replies,
referral workflow, analytics, optional report fields, or new endpoint.
Reviewer-facing report details may expose the separate operational correction
history described in the lifecycle contract.
