# Field surveys read contract v1

`GET /api/v1/field-surveys` returns stored field boundaries for the configured
pilot district. It is an office-only web read; it does not change survey
submission, storage, or the reports map.

## Authorization and limits

The route uses the existing verified Sanctum identity and `office.access`
middleware. Only reviewer and administrator web sessions can read it. An
unauthenticated or expired session returns **401**. A field reporter, farmer,
mobile bearer token, or other non-office identity returns **403**. Requests are
limited to 30 per minute (**429**).

The optional `limit` query parameter must be an integer from 1 through 250. Its
default is 100. Invalid limits return **422** with the standard API envelope:

```json
{
  "message": "The given data was invalid.",
  "code": "VALIDATION_ERROR",
  "errors": { "limit": ["The limit field must be at least 1."] }
}
```

## Response

A successful response is a GeoJSON `FeatureCollection`, newest capture first
(`captured_at DESC`, then `id DESC`):

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "123",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[122.95, 10.7], [122.951, 10.7], [122.95, 10.701], [122.95, 10.7]]]
      },
      "properties": {
        "id": 123,
        "captured_at": "2026-10-04T02:30:12.123456Z",
        "area_sqm": 6075.123456789,
        "area_source": "device_reported",
        "inspector": { "uuid": "…", "name": "…" }
      }
    }
  ],
  "metadata": {
    "total_count": 1,
    "returned_count": 1,
    "limit": 100,
    "truncated": false
  }
}
```

`geometry` is the stored GeoJSON passed through unchanged, including every
interior ring. Coordinates remain WGS84 `[longitude, latitude]`; they are not
converted through a database spatial type. `captured_at` is UTC ISO8601 with
microseconds. `area_sqm` is the phone-supplied value and is explicitly labelled
`device_reported`; the endpoint does not independently measure or validate the
area. The inspector object contains only UUID and name. The response omits the
survey `client_uuid`, waypoints, and inspector email.

`total_count` is the number of surveys in the pilot district, while
`returned_count` is the number in `features`. When more rows exist than fit in
the requested limit, `truncated` is `true`; the endpoint returns only the newest
rows. A missing or unknown pilot-district configuration returns an empty
collection and never widens the query to other districts.

Responses use `Cache-Control: private, no-store`. The route is separate from
`GET /api/v1/reports/map`; boundaries are not report points and do not enter the
validation queue. This endpoint adds no schema, mobile, role, or write-path
changes.
