# Mobile field-validation assignment contract v1

The machine-readable source of truth is [`mobile-field-validation-assignment-v1.json`](mobile-field-validation-assignment-v1.json).

The contract applies to `GET /api/v1/mobile/assignments`.

The endpoint requires an authenticated `field_reporter` bearer token with the `assignment:read` ability.

The API scopes every row to the authenticated assignee.

The assignment is active as soon as the reviewer saves it.
There is no Accept or Decline transition.

`target_visit_date` is nullable.
The assignment state remains a separate `field_validation_state` dimension.

The response uses `sync.before` as the feed checkpoint and `links.next` for cursor pagination.

The Mobile client must consume the complete feed before replacing its owner-scoped local snapshot.
A failed refresh must leave the last valid local snapshot available.

The `case` object contains the original report identity, submitter-independent field context, observation dates, possible AI result, and confidence needed to render assigned work and support the later T07 completion contract.

The optional `previous_visit` object carries the latest earlier validation for the same farm when one exists. It is nullable and may be omitted by older producers. Its evidence photo is served only to the authenticated assignment owner through `GET /api/v1/mobile/assignments/{assignment}/previous-evidence-photo`; the route uses private storage, private caching, and `nosniff` headers.

Field-validation completion and synchronization back to the API use the separate `mobile-field-validation-completion-v1` contract.
