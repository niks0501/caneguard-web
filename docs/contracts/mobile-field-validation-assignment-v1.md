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

Every response carries `sync.version` (a digest of the owner's whole work set, of the optional office-born projection it delivers, and of the `previous_visit` payload resolved for each delivered row), `sync.total` (assignments the owner holds), `sync.truncated` and `sync.unchanged`.
A request may bound the whole download with `limit`; the API honours at most 300. When the owner holds more rows than the bound, `sync.truncated` is `true`, the rows kept are active work first (completed visits last), then the earliest target visit date (undated last), then the oldest assignment, and `sync.total` still counts every assignment. Without `limit` the feed returns the complete snapshot, so older builds that never send it keep working unchanged. The legacy `updated_after` delta filter is not applied; a request that sends it still receives the complete snapshot.
Sending `since=<version>` on the first request returns no rows and `sync.unchanged: true` when the set has not changed; otherwise the full feed follows. `since` is ignored once a `cursor` is present.
Every `links.next` of a bounded feed carries `sync_version`, and a continuation of a bounded feed must send it back. When it is missing or the set changed since the download started, the API answers `409` with `code: SYNC_RESTART` and the current `sync` block, and the phone discards the partial download and starts the feed again.
Reassigning, unassigning, closing a case and editing the case information the feed delivers each change the version, including edits to the closed report a delivered `previous_visit` is built from; editing data the feed withholds, such as internal review notes or image paths, does not. An office-born case also moves the version whenever its delivered `case.version`, `case.status` or `case.reporter_concern` changes, so a handoff note that bumps the report version or its update time reaches the phone, and so does a change to the `previous_visit.photo` it delivers. The feed stays a full snapshot with no tombstones, and older builds that ignore these fields keep working.

The Mobile client must consume the complete feed before replacing its owner-scoped local snapshot.
A failed refresh must leave the last valid local snapshot available.

The `case` object contains the original report identity, submitter-independent field context, observation dates, possible AI result, and confidence needed to render assigned work and support the later T07 completion contract.

Office-born cases (`reports.origin = office`) additionally carry optional `case.origin` (`office`), `case.version` (the report `lock_version`), `case.status` (`workflow_status`, `case_state`, `review_status`, `updated_at`), `case.reporter_concern` (`suspected_condition`, `observation_text` up to 1000 characters) and `case.photo` (`url`, `content_type`, `bytes`), plus `previous_visit.photo` (`url`, `content_type`, `bytes`) when a previous visit has a photo. These keys are absent on field-born rows, whose payload is unchanged, so absence means field-born. The case photo is served only to the authenticated assignment owner inside their district through `GET /api/v1/mobile/assignments/{assignment}/report-photo` (403 otherwise, 404 when no file), with `Cache-Control: private, no-cache` and `nosniff`, so every retrieval is authorized against the assignment the caller holds now.

The optional `previous_visit` object carries the latest earlier validation for the same farm when one exists, including its nullable `follow_up_outcome` (`improved`, `unchanged`, `worsened`, or `unable_to_determine`). It is nullable and may be omitted by older producers. Its evidence photo is served only to the authenticated assignment owner through `GET /api/v1/mobile/assignments/{assignment}/previous-evidence-photo`; the route uses private storage, private caching, and `nosniff` headers.

Field-validation completion and synchronization back to the API use the separate `mobile-field-validation-completion-v1` contract.
