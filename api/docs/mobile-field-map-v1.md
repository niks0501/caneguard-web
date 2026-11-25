# Mobile field map contract v1

Two read-only routes that let the phone follow a field map after it sends it.
Both are additive: they do not change the report-status or assignment contracts.
Responses use `Cache-Control: private, no-store`.

## `GET /api/v1/mobile/field-surveys/office-status`

Bearer token with the `report:status` ability, for an active inspector. Answers,
for the signed-in inspector's own field maps (most recent 200) that are attached
to a case, what the office decided:

```json
{ "data": [ { "client_uuid": "90b2b84c-92c3-4cd6-b50f-cb0933e1a3aa", "verdict": "confirmed" } ] }
```

`verdict` is derived on every read, never stored:

- `confirmed`: a case that carries this map as its `field_survey_client_uuid`
  links it as its field map.
- `wrong_field`: that case now links a different map and not this one.
- `pending`: the case links no map yet.

A map that no case carries is omitted, as is every map of another inspector. If
more than one case carries the same map, the strongest verdict wins
(`confirmed`, then `wrong_field`, then `pending`).

## `GET /api/v1/mobile/assignments/{assignment}/field-map`

Bearer token with the `assignment:read` ability. Only the field reporter the
assignment belongs to can read it, for a case in their district; anyone else gets
**403**. It returns the one map of that case, read-only, so the plot outline can be
reused for the visit:

```json
{
  "data": {
    "field_survey_id": 123,
    "source": "confirmed",
    "label": "North lot",
    "geometry": { "type": "Polygon", "coordinates": [[[122.95, 10.7], [122.951, 10.7], [122.95, 10.701], [122.95, 10.7]]] },
    "area_sqm": 6075.12,
    "captured_at": "2026-10-04T02:30:12.123456Z",
    "inspector": { "name": "Ana Original" }
  }
}
```

`source` is `confirmed` when the office linked the map to the case, otherwise
`attached` for the map the original inspector attached on the phone. `data` is
`null` when the case has no map. Affected areas, the survey `client_uuid` and the
original inspector's identifiers are never returned, and there is no route that
lists other inspectors' maps. Access ends with the assignment.
