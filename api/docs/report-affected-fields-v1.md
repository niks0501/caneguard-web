# Report affected fields contract v1

`PUT /api/v1/reports/{report}/affected-fields` replaces the field boundaries
linked to one case and their office-supplied loss rates. It is the office
counterpart to the Mobile-only survey ingest; see
[Mobile field survey receive contract v1](mobile-field-surveys-v1.md) and
[Field surveys read contract v1](field-surveys-read-v1.md).

## Authorization

The route sits in the existing `office.access` group and requires a verified
office-cookie session whose report policy allows review. An unauthenticated or
expired session returns **401**. A field reporter, mobile bearer token, or other
non-office identity returns **403**. The route has no separate rate limit.

## Request

```json
{
  "expected_version": 4,
  "affected_fields": [
    { "field_survey_id": 123, "loss_rate_percent": 18.5 },
    { "field_survey_id": 124, "loss_rate_percent": 42 }
  ]
}
```

- `expected_version`: required integer of at least 0. It must equal the case
  `lock_version` read under a row lock; a mismatch returns **409** and writes
  nothing, so a concurrent edit is never silently overwritten.
- `affected_fields`: required array of at most 250 entries, each with exactly
  `field_survey_id` and `loss_rate_percent`. It is a full replacement: omitted
  boundaries are unlinked and an empty array removes every link on this case
  only. Other cases keep their own links to the same surveys.
- `field_survey_id`: positive integer, distinct within the request, and an
  existing survey in the configured pilot district. A case outside the pilot
  district cannot link any survey.
- `loss_rate_percent`: finite number from 0 through 100, stored to two decimals.

Invalid fields return **422** with the standard API error envelope and write no
link rows.

## Response

A successful write returns HTTP **200**:

```json
{
  "data": {
    "affected_fields": [
      {
        "field_survey_id": 123,
        "geometry": {
          "type": "Polygon",
          "coordinates": [[[122.95, 10.7], [122.951, 10.7], [122.95, 10.701], [122.95, 10.7]]]
        },
        "captured_at": "2026-10-04T02:30:12.123456Z",
        "area_sqm": 6075.12,
        "area_source": "device_reported",
        "inspector": { "uuid": "…", "name": "…" },
        "loss_rate_percent": 18.5
      }
    ],
    "version": 5,
    "updated_at": "2026-10-20T04:11:03.000000Z"
  }
}
```

`version` is the case `lock_version` after the write. It increments only when a
link or a loss rate actually changed, so repeating the stored set returns the
current version. `geometry` is the stored survey polygon passed through
unchanged, including every interior ring, in WGS84 `[longitude, latitude]`.
`captured_at` is UTC ISO8601 with microseconds. `area_sqm` is the
phone-supplied measurement and stays labelled `device_reported`; the office loss
rate is the only value this route adds, and no combined or server-measured area
is stored or returned.

`GET /api/v1/reports/{report}` and the review, duplicate-link, and handoff-note
responses include the same `affected_fields` array. Responses use
`Cache-Control: private, no-store`.
