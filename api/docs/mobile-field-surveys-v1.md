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
  "affected_area_polygons": [
    {
      "type": "Polygon",
      "coordinates": [[[122.95, 10.7], [122.9502, 10.7], [122.95, 10.7002], [122.95, 10.7]]]
    }
  ],
  "affected_area_sqm": 4860.5,
  "measurement_provenance": {
    "method": "wgs84-ellipsoid-geodesic",
    "plot_area_sqm": 29160,
    "affected_area_sqm": 4860.5,
    "source_polygon_count": 1,
    "overlap_removed": false,
    "affected_area_waypoint_provenance": [
      [
        {
          "latitude": 10.7,
          "longitude": 122.9501,
          "source": "gps",
          "accuracy_meters": 4.5,
          "captured_at": "2026-10-04T10:30:10.123456+08:00"
        }
      ]
    ]
  },
  "affected_area_waypoints": [
    [
      {
        "latitude": 10.700078,
        "longitude": 122.950193,
        "source": "gps",
        "accuracy_meters": 4.5,
        "captured_at": "2026-10-04T10:30:10.123456+08:00"
      }
    ]
  ],
  "captured_at": "2026-10-04T10:30:12.123456+08:00",
  "district_code": "test-pilot"
}
```

Five fields are required and the affected-area evidence is optional:

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

## Affected-area evidence

Four optional, nullable fields carry the phone's affected-area survey:

- `affected_area_polygons`: a JSON array of 0–100 GeoJSON `Polygon` objects,
  each held to the same structural rules as `polygon` (closed rings, three
  distinct points, WGS84 ranges, at most 10,000 positions across the whole
  array). An empty array means no affected area was drawn.
- `affected_area_sqm`: the phone's combined affected size in square metres, a
  finite number greater than or equal to zero and less than 10,000,000,000,000,000
  (the widest figure the four-decimal column stores); `0` is valid when nothing
  was drawn. It is stored as supplied, as a decimal to four places, and never
  independently recalculated by the server.
- `measurement_provenance`: a JSON object describing how the figures were
  derived. It is stored as supplied, so unknown keys are preserved. When the
  optional `affected_area_waypoint_provenance` key is present it must be one
  list of waypoints per affected area.
- `affected_area_waypoints`: the phone's per-area point history, a JSON array
  holding one list of waypoints per affected area. It is stored as supplied, so
  `latitude`, `longitude` and unknown keys are kept.

Both waypoint shapes share one rule: every waypoint is a JSON object recording
`source` (`map` or `gps`), `accuracy_meters` (a non-negative number of metres or
`null`) and `captured_at` (an ISO8601 date-time naming a real calendar instant,
with a timezone offset kept when supplied). At most 100 waypoint lists and
1,500 waypoints are accepted, and `measurement_provenance` is limited to 262,144
bytes of JSON; a full-precision GPS track (six decimal places on every
coordinate) at that waypoint budget still fits inside the cap. Waypoint sets are
stored in the order the phone sends them and are never re-paired with
`affected_area_polygons` by the server.

All four may be omitted; a plot-only payload stores `null` for each, so older
clients keep working without a backfill. Top-level fields this contract does
not declare are ignored rather than stored.

## Receipt and retries

Create and valid replay both return HTTP **201**, with exactly:

```json
{ "id": "123", "status": "kept" }
```

`id` is deliberately always a JSON string, never a number, because the phone
rejects any other type. Keep the same UUID for retries. It is globally unique,
enforced in the database. A replay from the same inspector in the same district
returns the original ID without altering the polygon, measurements,
affected-area evidence or timestamps, even if the supplied valid measurement
differs. Normal validation and current authorization still apply to replays.
Another inspector's UUID (or an original record in another district) yields a
`client_uuid` field error; its ID is never disclosed.

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

The phone can display each `errors[field]` string array. Geometry errors use the
`polygon` key; the affected-area evidence reports under
`affected_area_polygons`, `affected_area_polygons.N`, `affected_area_sqm`,
`measurement_provenance` and `affected_area_waypoints`.
Unauthorized/expired/revoked credentials return **401**; a verified
identity without inspector authority or pilot membership returns **403**.
Rate limiting returns **429**. None of these failures creates a survey.

## Scope and persistence

This contract is receive-only pilot storage; it never creates or mutates disease
reports. Office reviewers can separately link stored surveys to disease cases as
affected field boundaries, which stores only an office loss rate and never
changes the survey geometry, affected areas or phone-measured areas. District
scope uses the existing district/membership model, not a spatial district
boundary test (that model contains no boundary geometry). Structural ring
validation is not a topology, self-intersection or area-accuracy certification.
No reporting, email, exports or production rollout are enabled here.
The additive migration retains survey data on rollback; deleting walked
boundaries requires a separate explicit data-removal decision.

Office read: see [Field surveys read contract v1](field-surveys-read-v1.md).
Office case linkage: see [Report affected fields contract v1](report-affected-fields-v1.md).
