# Report affected fields contract v1

`PUT /api/v1/reports/{report}/affected-fields` replaces the field boundaries
linked to one case. The office no longer types a loss rate: each linked map
carries the phone's measured `affected_percent` instead. It is the office
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
    { "field_survey_id": 123 },
    { "field_survey_id": 124 }
  ]
}
```

- `expected_version`: required integer of at least 0. It must equal the case
  `lock_version` read under a row lock; a mismatch returns **409** and writes
  nothing, so a concurrent edit is never silently overwritten.
- `affected_fields`: required array of at most 250 entries, each with
  `field_survey_id` and the optional, retired `loss_rate_percent`. It is a full replacement: omitted
  boundaries are unlinked and an empty array removes every link on this case
  only. Other cases keep their own links to the same surveys.
- `field_survey_id`: positive integer, distinct within the request, and an
  existing survey in the configured pilot district. A case outside the pilot
  district cannot link any survey.
- `loss_rate_percent`: **retired and optional.** Omit it and any stored value is
  left alone (a new link stores `null`). An older client may still send a finite
  number from 0 through 100, stored to two decimals, or `null`.

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
        "label": "North lot",
        "outline_from_survey_id": null,
        "affected_area_sqm": 1580.5,
        "affected_percent": 26,
        "loss_rate_percent": null
      }
    ],
    "version": 5,
    "updated_at": "2026-10-20T04:11:03.000000Z"
  }
}
```

`version` is the case `lock_version` after the write. It increments only when a
link (or a supplied loss rate) actually changed, so repeating the stored set returns the
current version. `geometry` is the stored survey polygon passed through
unchanged, including every interior ring, in WGS84 `[longitude, latitude]`.
`captured_at` is UTC ISO8601 with microseconds. `area_sqm` and
`affected_area_sqm` are the phone-supplied measurements and stay labelled
`device_reported`. `affected_percent` is derived, `affected_area_sqm / area_sqm`
to one decimal, and is `null` unless the survey's `affected_area_measurement` is
`measured` (never `0` for an unmeasured plot-only survey). A measured zero
returns `0`. Surveys stored before `affected_area_measurement` existed have no
stored value; one with no affected polygons and an `affected_area_sqm` of `0` is
read as `not_measured`, because older phones forced that zero.
`label` is the name the phone typed (or `null`) and `outline_from_survey_id` the
earlier map whose outline it reused (or `null`); both are optional phone-supplied
context, never edited here. `affected_area_measurement` (`measured` or
`not_measured`) is returned next to `affected_area_sqm` and is the only reliable
way to tell an unmeasured area from a measured zero. `loss_rate_percent` is history only: `null` unless an older client stored one.
No combined or server-measured area
is stored or returned.

`GET /api/v1/reports/{report}` and the review, duplicate-link, and handoff-note
responses include the same `affected_fields` array, plus the
`inspector_attachment` described below. Responses use
`Cache-Control: private, no-store`.

## The inspector-attached boundary

The v3 upload records the survey `client_uuid` the phone used, and the office case
shows that boundary as `data.inspector_attachment`:

```json
{
  "inspector_attachment": {
    "client_uuid": "90b2b84c-92c3-4cd6-b50f-cb0933e1a3aa",
    "arrived": true,
    "confirmed": false,
    "field_survey": {
      "field_survey_id": 123,
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[122.95, 10.7], [122.951, 10.7], [122.95, 10.701], [122.95, 10.7]]]
      },
      "captured_at": "2026-10-04T02:30:12.123456Z",
      "area_sqm": 6075.12,
      "area_source": "device_reported",
      "inspector": { "uuid": "…", "name": "…" }
    }
  }
}
```

`inspector_attachment` is `null` when the case carries no survey `client_uuid`.
`arrived` says whether that boundary has reached the server. While the upload is
still pending, and also when the stored boundary belongs to another district, it
is `false` and `field_survey` is `null`, so another district's polygon, area and
inspector are never disclosed. `confirmed` says this case already links the
boundary as an affected field. Confirming is an ordinary write of this route:
send the boundary's `field_survey_id` along with the already linked ones, and the
same replacement array unlinks it again. `field_survey` carries the same
`affected_area_sqm`, `affected_area_measurement` and `affected_percent`. Mobile upload responses never carry
`inspector_attachment`.
