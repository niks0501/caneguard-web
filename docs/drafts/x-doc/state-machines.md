# Web state machines

Canonical state vocabulary for the review client (`src/`) and the Laravel handlers it calls (`api/`). Reuse `LoadingState`, `EmptyState`, `NoResultsState`, `ErrorState` and `WorkspaceFreshness` from `src/components/ui/States.tsx` for new pages.

Verified against `main` at `41bd5d8`. Line numbers are omitted on purpose; search the named symbol. Gaps already closed by merged work are marked **closed**; the rest are **open**.

## Agent markers

| Surface | Element | `data-state` values | `data-error-kind` values |
|---|---|---|---|
| State panels | `LoadingState`, `EmptyState`, `NoResultsState`, `ErrorState` | `loading`, `empty`, `no-results`, `error` | `invalid-query`, `access-denied`, `not-found`, `malformed-data`, `unreachable`, `rate-limited`, `unavailable`, `session-unavailable`, `render` |
| Report queue | results panel in `SubmittedReportsPage` | `loading`, `error`, `empty`, `no-results`, `refreshing`, `ready` | as panels |
| Review form | `form#review-decision` | `idle`, `dirty`, `saving`, `saved`, `offline`, `conflict`, `error` | `malformed-data`, `rate-limited`, `access-denied`, `validation`, others per `formErrorKind` |
| Affected boundaries | `section.affected-field-linkage` on a case | `idle`, `dirty`, `saving`, `saved`, `offline`, `conflict`, `error` | none |
| Field boundaries viewer | `.boundaries-workspace`, attribute `data-selection-state` | `none`, `list`, `map`, `loading`, `missing`, `unavailable` | none |
| Weekly report | `section[aria-label="Official weekly report"]` | `loading`, `ready`, `working`, `offline`, `error` | `conflict`, `access-denied`, `delivery-closed`, `unavailable` |
| Header pills | `ServerStatus`, `RealtimeStatus` | `connected`, `refreshing`, `degraded`, `unavailable`, `offline`; realtime `connected`, `degraded` | none |
| Render failure | `AppErrorFallback` | `error` | `render` |

## Transition tables

### SM-1 Session (`AuthProvider`)

| From | Event | To | Guard / note |
|---|---|---|---|
| `loading` | no session hint | `unauthenticated` | no `/me` probe |
| `loading` | `/me` ok | `authenticated` | `is_active` and web role enforced |
| `loading` | `WebRoleError` | `unauthenticated{access_denied}` | |
| `loading` | 401/403 | `unauthenticated{session_expired or account_disabled}` | |
| `loading` | other failure | `service_error` | not "logged out"; Retry offered |
| `authenticated` | session-expired broadcast (401/419 via `axiosClient`) | `unauthenticated{session_expired}` | clears query cache; only from `authenticated` |
| `authenticated` | logout 401/419 | `unauthenticated{session_expired}` | |
| `authenticated` | logout other failure | `service_error` | keeps `user` |

Rule: every request goes through `axiosClient`; `apiHealthClient` is deliberately unauthenticated.

### SM-2 Route guards

`public` -> `RequireAuth` -> `RequireWebRole` (reviewer or admin, active) -> `AppShell` -> `RequireAdmin` (`report-approval`, `admin-settings`, `accounts`). Client guards are UX only; the server returns 403 independently. A denied admin route redirects to `/dashboard` with a notice.

### SM-3 Login

| From | Event | To |
|---|---|---|
| `idle` | submit | `submitting` |
| `submitting` | success | navigate to sanitized destination |
| `submitting` | 422, `ACCOUNT_DISABLED`, 429, `EMAIL_NOT_VERIFIED` (+ resend), 403 or `WebRoleError` | `error{message}` in `role="alert"` |
| `submitting` | 419 | **closed** (#348): refresh CSRF once and retry |
| `submitting` | other | `error` "service unavailable"; session unchanged |

### SM-4 API errors

Envelope `{message, code, errors?}`. Branch on `code`/`status`, never `message`.

| Status | `code` |
|---|---|
| 401 | `UNAUTHENTICATED` (`ACCOUNT_DISABLED` from `EnsureActiveIdentity`) |
| 403 / 404 / 419 | `FORBIDDEN` / `NOT_FOUND` / `CSRF_TOKEN_MISMATCH` |
| 409 | `CONFLICT`, whatever the cause: stale `lock_version`, already linked, weekly not-approved / idempotency mismatch / send pending / no recipients / stale, renderer drift |
| 422 | `VALIDATION_ERROR` + `errors` |
| 429 / 503 / 5xx | `RATE_LIMITED` / `SERVICE_UNAVAILABLE` / `SERVER_ERROR` |

Main axios client has a 30 s timeout (**closed**); a timeout is a connection error. Weekly 409 messaging is split by cause client-side (#346). The server does not send a 409 `reason` field (open, optional).

### SM-5 Query freshness

`pending` -> `success` | `error`; a refetch failure keeps data (`isRefetchError`). Retry once, only for no-status or >=500. `staleTime` 30 s. Operational lists use `getOperationalQueryRefreshOptions()` (poll `VITE_REPORT_REFRESH_MS`, default 10 min). Case detail has no polling; it refreshes on focus after 30 s, explicit invalidation, or realtime (**closed**, #345).

### SM-6 Connectivity

`networkStatus` `available|unavailable|unknown`; `apiReachability` `unknown|checking|reachable|degraded|unreachable`; derived `ServerStatus` `connected|refreshing|degraded|unavailable|offline`. Results apply only for the current `requestVersion` while authenticated. Health checks are shared while one is in flight (**closed**, #349).

### SM-7 Realtime

| From | Event | To |
|---|---|---|
| `disabled` | API mode + authenticated + `VITE_REALTIME_ENABLED` + app key | `connecting` |
| `connecting` | connected | `connected` |
| `connected` | any other status | `degraded` |
| `degraded` | reconnect | `connected` + one catch-up invalidation (**closed**, #345) |
| any | pusher or channel-auth error | `degraded`; re-arms after backoff (**closed**, #345) |

`.case.submitted` and `.case.attention_changed` invalidate list, dashboard, notifications, and now report details. "Refresh mode" means data may be up to `VITE_REPORT_REFRESH_MS` old.

### SM-8 Report list

The URL is the only source of truth (`parseReportListUrl`); invalid values never reach the server. Rendered states are mutually exclusive: `error` (invalid URL, 422, 403, Zod, connection, 429, generic) | `loading` | `empty` | `no-results` | `ready`, with `refreshing` and `refetch-error` overlays. Filter change resets `page`; page clamps to the last page. Open: export-failure banner persists until next attempt; success notice in history state reappears on reload.

### SM-9 Queue read and Review Next

`readQueuePages` reads up to 10 x 100 and reports `truncated`. Review Next rescans the same filters and skips reviewed ids. Open: offset paging can skip a row while new cases arrive.

### SM-10 Case detail

`key={reportId}` resets local drafts per case. `pending` | not-found (`null`) | `error` (403/404/429/Zod/generic; Retry except 403/404) | `refetchError` with data. `POST /reports/{id}/open` stamps once per mount; idempotent, no version bump. Image `available|pending_sync|unavailable`.

### SM-11 Review decision

| From | Event | To |
|---|---|---|
| `idle` | edit | `dirty` |
| `dirty` | submit invalid | `dirty` + `review-error-*` ids, title `Error:` prefix |
| `dirty` | submit valid, online, version known | `saving` |
| `saving` | 200 | `saved` ("<ref> — Review confirmed.") |
| `saving` | 409 | `conflict` -> one read of latest -> per-field latest/mine -> `dirty` on the new version |
| `saving` | 422/403/429/Zod/network | `error`; no change confirmed |
| any | offline | `offline` (draft stays in tab, never queued) |

Server: `lockForUpdate` on `lock_version`; every write bumps it. A network failure after commit retries into 409 and reconciles, never double-applies. Version follows sibling saves (**closed**, #344).

### SM-11b Affected-boundary form (case page)

Same vocabulary as SM-11, derived by `affectedFieldFormState`. `saving` wins, then `offline` (only while there are unsaved changes; save is disabled and the draft stays in the tab), `conflict` (409, offers a refresh that discards the draft), `error`, `saved`, `dirty`, `idle`. The inspector's attached boundary (`inspector_attachment` on the case) is confirmed by ticking it and entering the loss rate through this same form; `arrived: false` means the boundary has not reached the office yet.

### SM-11c Field boundaries viewer selection

`?boundary=` names the selection. `none` | `list` (opened from the list or a link) | `map` (clicked on the map, popup at the click) | `loading` | `missing` | `unavailable`. A number not in the loaded newest page is fetched by id (`useFieldSurveyById`), so every boundary is linkable; `missing` means the id does not exist or is not a number, `unavailable` means the lookup failed.

### SM-12 Sibling writers on `lock_version`

| Writer | Version source |
|---|---|
| Decision form | live record while clean; follows own and sibling saves |
| Affected fields | own `draftVersion`, updated on its own save or refresh |
| Metadata correction | pinned when the pop-up opens; only the fields the reviewer changed are sent, and a field restored to the report's value drops out of the edit set; a report that changes underneath shows a stale panel with Save disabled until the reviewer takes the latest values; draft and reason clear on save, close or discard (**closed**, W-F3, W-G5) |
| Duplicate link/unlink, handoff note | live version at click |
| Mobile field-validation completion | server side |

Each page mutation has its own error surface; errors must not cross between the correction modal and the decision form.

### SM-13 Unsaved-work guard

Ref-counted `dirtyDrafts`; `beforeunload` armed while dirty; `/login` is never blocked; blocks only on path/search/hash change. Registered: decision form, affected fields, case review modals (**closed**, #347). Dialog id `unsaved-work-guard`.

### SM-14 Weekly report

| Machine | Transitions |
|---|---|
| Version | `none` -> `prepared(vN, content_hash)` -> `approved(document_sha256)`; stale on `newer_version` or `evidence_changed` |
| Transmission | `pending` -> `delivering` -> `sent` / `failed` / `cancelled` (worker revalidates before claiming) |

Admin-only, online-only; approval is irreversible. Send key scoped per (version uuid, last receipt id) and reused on retry. `weekly_send_enabled` off -> 503. Client polls every 5 s while `pending|delivering`. **Highest-consequence irreversible action: human-gated.** Open: iframe preview load failure is invisible.

### SM-15 Notifications

Feed `pending|error|empty|list`. Mark-read is not optimistic. Item click navigates first, marks read fire-and-forget. No defect.

### SM-16 Mobile upload -> queue

`received` -> `replay` (existing `(reporter, client_uuid)` -> 200 `created:false`) | `stored` -> `persisted` (201, broadcast). Unique race deletes the orphan image and returns the existing record. Any other failure deletes the image and rethrows. Guards: inspector district 403, unique constraint, throttle 30/min.

### SM-17 Render failure

Route render errors reach the router `errorElement` (`AppErrorFallback`, `data-error-kind="render"`) (**closed**, #343). `env.ts` parses env at import; an invalid `VITE_*` value blanks the page outside every boundary (open).

### SM-18 Field-validation map

Same pattern as SM-8: URL-validated filters, initial error vs refetch error with cache, explicit `truncated`, lazy-route Suspense. A complete schedule read throws rather than truncating.

## Human gates and safe retries

Never auto-confirm: Confirm Review when it closes a case, weekly Approve and Send, duplicate link, metadata correction.

Safe retries: idempotent reads; `POST /reports/{id}/open`; mobile upload replays with the same `client_uuid`; weekly send with the same idempotency key. Everything else: re-read the version on a 409 and stop for a human.
