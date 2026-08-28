# Report lifecycle dimensions v1

The API stores the expanded case lifecycle beside the legacy `review_status` field.

The dimensions are independent and use these values:

| Field | Values | Meaning |
| --- | --- | --- |
| `case_state` | `open`, `closed` | Whether office handling is still active. |
| `verification_outcome` | `not_determined`, `verified`, `unable_to_verify` | The current authority verification outcome. |
| `field_validation_state` | `unassigned`, `assigned`, `in_progress`, `completed` | Progress of field-validation assignment work. |
| `referral_state` | `not_referred`, `referred`, `expert_response_received` | Progress of an expert referral handoff. |

`verified` does not imply `closed`.

Field-validation completion does not imply verification or closure.

Referral state is an operational handoff state and is not a verification outcome.

## Legacy compatibility mapping

The migration preserves `review_status` and maps existing values as follows:

| Legacy `review_status` | `case_state` | `verification_outcome` | `field_validation_state` | `referral_state` |
| --- | --- | --- | --- | --- |
| `submitted_unverified` | `open` | `not_determined` | `unassigned` | `not_referred` |
| `for_field_validation` | `open` | `not_determined` | `unassigned` | `not_referred` |
| `verified_by_staff` | `closed` | `verified` | `unassigned` | `not_referred` |
| `unable_to_verify` | `closed` | `unable_to_verify` | `unassigned` | `not_referred` |
| `resolved` | `closed` | `not_determined` | `unassigned` | `not_referred` |

A legacy `for_field_validation` row has no fabricated assignee or assignment progress.

A legacy `resolved` row is closed without inventing a verification outcome that the old record did not store.

Unexpected legacy status values are conservatively mapped to a closed case during migration.

## API representation

Reviewer-facing report resources expose the dimensions in a `lifecycle` object.

The existing Mobile authority-status endpoint remains unchanged and continues to return the exact five-value `review_status` snapshot.

The lifecycle migration does not modify report identity, submitted evidence, image references, AI evidence, timestamps, or authority-review evidence.
