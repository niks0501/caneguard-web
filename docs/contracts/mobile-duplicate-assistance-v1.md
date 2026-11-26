# Mobile duplicate assistance contract v1

This document defines the conservative possible recent-match assistance exposed by the Laravel API.

The contract is owned by the Web/API repository and is consumed optionally by the CaneGuard mobile producer.

## Mobile endpoint

The endpoint is `GET /api/v1/mobile/reports/possible-matches`.

The request must use a Sanctum bearer token with the `report:submit` ability and a field-reporter account.

The query must include `predicted_label` with one of the existing model labels: `healthy`, `mosaic`, `rust`, or `smut`.

The query may include `final_latitude` and `final_longitude`.

Both location values must be provided together when either value is provided.

If location is unavailable, the API returns an empty possible-match list with `meta.can_submit: true`.

The endpoint does not receive or store an image and does not create a report.

## Matching policy

A possible match requires the same `predicted_label`, a distance of at most 100 meters, and a report submitted within the previous 72 hours.

The API returns at most five possible matches.

The server derives the distance from the submitted report coordinates and does not trust a client-declared distance.

This is a conservative signal and is not a duplicate verdict.

A possible match never merges, deletes, rejects, or suppresses a new report.

The mobile producer must continue with the normal upload flow when it receives any response from this endpoint.

## Response

The response always includes `message`, `data`, and `meta`.

`meta.possible_match` indicates whether one or more possible matches were returned.

`meta.can_submit` is always `true` for a successful response.

`meta.assessment` is `condition_and_location` when both coordinates were assessed and `location_unavailable` otherwise.

Each result exposes only the candidate case identity, submission time, model condition, server-calculated distance, match basis, and possible-match wording.

A candidate response has this shape:

```json
{
  "case": {
    "uuid": "candidate-uuid",
    "reference_code": "CG-2026-0001",
    "submitted_at": "2026-08-29T08:00:00.000000Z"
  },
  "match": {
    "condition": "rust",
    "distance_meters": 12.4,
    "basis": [
      "same_condition",
      "nearby_location",
      "recent_submission"
    ]
  },
  "message": "Possible recent match. Compare this case before deciding."
}
```

The top-level message for a non-empty response is `Possible recent matches found. You can still submit a new case.`

The top-level message for an empty response is `No possible recent match was found. You can still submit a new case.`

Clients must not replace possible-match wording with certain duplicate wording.

## Web review endpoints

The reviewer workspace can read possible matches through `GET /api/v1/reports/{report}/possible-matches`.

That endpoint uses the same matching policy and excludes the report in the route from its own candidate list.

The mobile response above is unchanged by the web enrichment: the web endpoint uses a separate resource, so no farmer or reporter detail reaches other field reporters.

Each web candidate keeps every key of the mobile candidate and adds these keys to `case`:

- `barangay`: the candidate's barangay.
- `farmer_or_farm_owner_name`: the submitted farmer or farm owner name, or `null`.
- `submitted_by_name`: the submitting reporter's display name.
- `workflow_status`: one of `needs_review`, `under_review`, `field_validation`, `referred`, `follow_up`, `resolved`.
- `image_url`: a relative, authenticated URL for the candidate image, or `null` when the case has no image.
- `image_status`: `available` when the stored image can be served, `missing` when an image is recorded but the file is absent, and `none` when the case has no image.

Reviewer or admin users can explicitly link a report to a canonical case through `POST /api/v1/reports/{report}/duplicate-link`.

The link request requires `canonical_report_uuid` and `expected_version`, and may include an optional `reason` of up to 1,000 characters.

The link request may also include `close_duplicate` (boolean, default `false`). Linking stays non-destructive unless it is `true`.

When `close_duplicate` is `true`, the API links the duplicate and closes its case in one database transaction with one version bump. The closure reuses the review closure writes (case state, review status, reviewer stamps, review event and final-review notification) and the link still writes its `report_audits` row. If the case cannot be closed, nothing persists. `close_duplicate` is rejected on `DELETE`.

The same lifecycle guard applies with or without `close_duplicate`: a case that is not open, or whose field evidence is completed, is rejected with `422`. A case under another reviewer's active review lease is rejected with `423` when `close_duplicate` is `true`. A stale `expected_version` is rejected with `409`.

The target must be a different root case that is not already linked as a duplicate.

The operation is idempotent when the report is already linked to the same canonical case.

A report linked to a different canonical case cannot be silently relinked.

## Preservation and auditability

Linking changes only the duplicate report's operational linkage and version.

The duplicate report, its submitted evidence, its child observations, and its review lifecycle remain stored.

The link creates a `report_audits` row with the authorized actor, timestamp, canonical case UUID, and reason.

The report detail response exposes the current `duplicate_linkage` and `audit.duplicate_linkages` values.

`duplicate_linkage.link_blocked_reason` is `null` when linking can change, `closed` when the case is not open, and `visit_completed` when field evidence is completed. It is computed by the same guard the link endpoint enforces.

Closing a linked duplicate is still an explicit review action and does not update the canonical report or its submitted evidence.

The canonical report remains independently reviewable and its model result remains decision support rather than authority verification.
