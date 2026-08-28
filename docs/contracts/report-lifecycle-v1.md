# Report lifecycle v1

`report-lifecycle-v1` is the Web-owned lifecycle contract for the Phase 1 CaneGuard case flow.

The machine-readable source is [`report-lifecycle-v1.json`](./report-lifecycle-v1.json).

## Independent dimensions

`case_state` records whether office handling is open or closed.

`verification_outcome` records the reviewer or administrator authority outcome.

`field_validation_state` records assignment progress independently of verification.

`referral_state` records expert handoff progress independently of verification.

The legacy `review_status` value is a compatibility projection.

New behavior must update the independent dimensions first and derive the legacy value only for older consumers.

## Phase 1 safety rules

Field validation completion records evidence and moves field validation to `completed`.

Field validation completion does not verify or close a case.

Only reviewer or administrator disposition may close a case or set the authority verification outcome.

AI output is decision support only and never an authority verification outcome.

The field reporter may complete assigned work but may not close a case.

Completed validation evidence cannot be reassigned or removed.

## Compatibility

Existing payload contracts remain linked in the JSON artifact.

Adding optional metadata or preserving the meaning of existing states is compatible within the same major version.

Removing or renaming states, changing ownership or projection meaning, making field completion imply verification or closure, or treating AI evidence as authority requires a new major contract.
