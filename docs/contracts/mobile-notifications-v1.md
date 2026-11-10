# Mobile notification feed contract

The `mobile-notifications-v1` contract is the owner-scoped REST feed for durable attention items on Mobile.

The API returns the authenticated field reporter's notifications only.
The `sync.before` checkpoint and cursor links describe one complete snapshot boundary.
The feed serves a bounded window anchored to that checkpoint: every unread item, plus read items created in the 60 days before `sync.before`, capped at the 500 newest rows of that window.
Every response carries `sync.version` (a digest of the whole served window as the phone receives it, so a new, read or aged-out item moves it), `sync.total` (items in the window before the 500-row cap), `sync.truncated` and `sync.unchanged`. Sending `since=<version>` on the first request returns no rows and `sync.unchanged: true` when the window has not changed; `since` is ignored once a `cursor` is present.
Read history older than the window is never served, so a long-lived account refreshes in a bounded number of pages instead of paging through every item it was ever sent.
Advisory notifications include the validated office content in both `content`
and the structured `advisory` payload; clients may render either representation.
The client replaces its local snapshot only after every page validates successfully.

Mobile does not connect to Reverb or any WebSocket service.
Refresh is lifecycle-driven by the Mobile application and failed refreshes leave the last successful local snapshot visible.

Reading the feed never writes.
Follow-up due items are derived by the scheduled `notifications:derive-follow-up-due` command, which runs every 15 minutes on the Laravel scheduler; an install whose scheduler does not run never creates them.
The derivation requires a target visit date, a date before the API's current date, and incomplete field validation.
No service-level deadline is invented for assignments without a target date.

## Read-state actions

The feed is retrieval-oriented, so Mobile acknowledges items through two owner-scoped mutations on the same contract generation:

| Method | Path | Result |
|---|---|---|
| `PATCH` | `/api/v1/mobile/notifications/{notification}/read` | `{ data: <notification>, meta: { unread_count } }` |
| `POST` | `/api/v1/mobile/notifications/read-all` | `{ data: [], meta: { marked_count, unread_count } }` |

Both require the field-reporter role, the `mobile.token` middleware, and the `notification:read` ability.
Each item is loaded through the authenticated user's notifications relation, so another account's notification can never be read or acknowledged, and a cross-owner identifier answers `404`.
Marking an already-read item is idempotent and preserves the first `read_at` timestamp.
Acknowledging a notification never blocks opening its destination on Mobile: a failed mutation leaves the item unread and surfaces a recoverable message. Reading an `advisory_available` item advances that case's advisory delivery state to `acknowledged` when the notification is owned by the reporter.
