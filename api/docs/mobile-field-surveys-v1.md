# Mobile field survey receive contract v1

`POST /api/v1/mobile/field-surveys` accepts JSON. Send `Accept: application/json`
and a real Sanctum bearer token obtained from the existing mobile login.
The existing verified identity, inspector access, mobile-token freshness and
`report:submit` ability middleware apply, with the existing 30 requests/minute
submission limit. A verified inspector session is also supported by Sanctum.
Farmers, reviewers and administrators cannot ingest surveys, even with wildcard
tokens.

## Request

```json
{
  "client_uuid": "90b2b84c-92c3-4cd6-b50f-cb0933e1a3aa",
  "polygon": {
    "type": "Polygon",
    "coordinates": [[[122.95, 10.7], [122.951, 10.7], [122.95, 10.701], [122.95, 10.7]]]
  },
  "area_sqm": 6075.123,
  "captured_at": "2026-10-04T10:30:12.123456+08:00",
  "district_code": "test-pilot"
}
```

All five fields are required:

- `client_uuid`: UUID idempotency key, normalized to lowercase.
- `polygon`: GeoJSON Polygon with only `type` and `coordinates`. Coordinates are
  WGS84 numeric `[longitude, latitude]` pairs in [-180, 180] / [-90, 90].
  Every ring (including holes) is closed and has at least three distinct points
  plus its closing position. At most 10,000 positions total.
- `area_sqm`: finite JSON number greater than zero; square metres measured by the
  phone. Stored as supplied, not independently recalculated by the server.
- `captured_at`: ISO8601 timestamp with seconds, explicit `Z` or `±HH:MM`
  timezone and optional 1–6 fractional second digits; persisted in UTC within
  the database's supported years 1000–9999.
- `district_code`: must equal the configured pilot district code. The inspector
  must have an active membership in that district. Missing/unknown pilot
  configuration fails closed.

The synthetic district code above is only an example, not a production default.
Inspector and district database IDs are derived by the server; client-supplied
attribution fields have no authority.

## Receipt and retries

Create and valid replay both return HTTP **201**, with exactly:

```json
{ "id": 123, "status": "kept" }
```

Keep the same UUID for retries. It is globally unique, enforced in the database.
A replay from the same inspector in the same district returns the original ID
without altering the polygon, measurements or timestamps, even if the supplied
valid measurement differs. Normal validation and current authorization still
apply to replays. Another inspector's UUID (or an original record in another
district) yields a `client_uuid` field error; its ID is never disclosed.

## Rejection

Invalid fields return HTTP **422**, using the existing API error envelope:

```json
{
  "message": "The given data was invalid.",
  "code": "VALIDATION_ERROR",
  "errors": {
    "district_code": ["The district code must match the configured pilot district."]
  }
}
```

The phone can display each `errors[field]` string array; geometry errors use the
`polygon` key. Unauthorized/expired/revoked credentials return **401**; a verified
identity without inspector authority or pilot membership returns **403**.
Rate limiting returns **429**. None of these failures creates a survey.

## Scope and persistence

This is receive-only pilot storage, separate from disease reports. District
scope uses the existing district/membership model, not a spatial district
boundary test (that model contains no boundary geometry). Structural ring
validation is not a topology, self-intersection or area-accuracy certification.
No reporting, email, exports or production rollout are enabled here.
The additive migration retains survey data on rollback; deleting walked
boundaries requires a separate explicit data-removal decision.
