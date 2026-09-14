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

Reviewer or admin users can explicitly link a report to a canonical case through `POST /api/v1/reports/{report}/duplicate-link`.

The link request requires `canonical_report_uuid` and may include an optional `reason` of up to 1,000 characters.

The target must be a different root case that is not already linked as a duplicate.

The operation is idempotent when the report is already linked to the same canonical case.

A report linked to a different canonical case cannot be silently relinked.

## Preservation and auditability

Linking changes only the duplicate report's operational linkage and version.

The duplicate report, its submitted evidence, its child observations, and its review lifecycle remain stored.

The link creates a `report_audits` row with the authorized actor, timestamp, canonical case UUID, and reason.

The report detail response exposes the current `duplicate_linkage` and `audit.duplicate_linkages` values.

Closing a linked duplicate is still an explicit review action and does not update the canonical report or its submitted evidence.

The canonical report remains independently reviewable and its model result remains decision support rather than authority verification.
