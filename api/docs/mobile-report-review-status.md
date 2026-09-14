# Mobile report review status implementation notes

The canonical wire contracts are [`mobile-report-status-v1.md`](../../docs/contracts/mobile-report-status-v1.md)
and [`mobile-report-status-v2.md`](../../docs/contracts/mobile-report-status-v2.md).
This document records shared implementation behavior and does not duplicate their
response schemas. The v2 route is the current route for Model V1 mobile clients;
the v1 route remains available for legacy clients.

## Read status snapshots

Both `GET /api/v1/mobile/reports/statuses` and
`GET /api/v2/mobile/reports/statuses` require Sanctum bearer authentication, the
`report:status` token ability, and a `field_reporter` account. Results are scoped
to the authenticated reporter. Reviewer and admin accounts must use the reviewer
API instead.

Both routes return the exact snapshot defined by their versioned contract. The
feed intentionally does not include reviewer UUID, name, or email. Review history
and threaded replies are not part of the mobile status response. Mobile
presentation may call the author `Authority staff`, but that label is not an API
field.

The route-specific query parameters, response fields, pagination behavior, and
checkpoint rules are maintained in the canonical versioned contracts above.

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

These Mobile status contracts add no push notifications, unread state, replies,
referral workflow, analytics, or optional report fields.
Reviewer-facing report details may expose the separate operational correction
history described in the lifecycle contract.
