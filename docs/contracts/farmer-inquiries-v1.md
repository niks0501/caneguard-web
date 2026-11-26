# Farmer inquiries v1

A farmer may ask the office to look at a plant. This is an opt-in early look, never a surveillance record: the tables are separate from `reports`, and no dashboard, map, weekly-report or analytics query reads them. Only a future, explicit office action could ever cross into a case.

## Switches and abilities

- `CANEGUARD_FARMER_INQUIRIES_ENABLED` (default on) pauses the farmer endpoints and the office queue with `503 FEATURE_PAUSED`. Inspector and office flows never read it.
- `CANEGUARD_FARMER_INQUIRY_OPEN_CAP` (default 5): requests a farmer may have waiting for a reply within a rolling week; beyond it `429 INQUIRY_LIMIT`.
- A farmer Mobile token carries `account:security`, `farmer:inquiry` and `farmer:advisory` (the last is used by the separate barangay-broadcast feature and does nothing here). It never carries `report:submit`, `survey:submit`, `report:status`, `assignment:*` or `notification:read`. Existing farmer tokens gain the ability on their next request and are never narrowed. `user.capabilities` on the Mobile session lists `farmer:inquiry` and `farmer:advisory` while their switches are on.

## Farmer (Mobile bearer, `farmer:inquiry`)

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/v1/mobile/farmer/inquiries` | multipart: `client_uuid` (idempotency key), `barangay`, optional `landmark` (120), `concern` (`spreading`, `changed_since_last`, `new_leaves`, `want_to_be_sure`), `note` (500), `scan_chain_uuid`, `ai_label` (`healthy`, `mosaic`, `rust`, `smut`, `uncertain`), `ai_confidence_percent`, `photos[]` (1 to 2). `201` created; `200` for a replay of the same `client_uuid`; `409 INQUIRY_ALREADY_OPEN` when that plant already has a live request; `429 INQUIRY_LIMIT`. |
| POST | `/api/v1/mobile/farmer/inquiries/{uuid}/photos` | `photo`: the Check Again photo. At most two photos in total (`409 PHOTO_LIMIT`); `409 INQUIRY_CLOSED` once replied. |
| GET | `/api/v1/mobile/farmer/inquiries`, `/{uuid}` | Own requests only; another farmer's uuid answers `404`. Replies come from "the office": no reviewer identity is exposed. |
| GET | `/api/v1/mobile/farmer/inquiries/{uuid}/photos/{n}` | Own photo, `nosniff`, private cache. |

`ai_label` and `ai_confidence_percent` are the phone's own on-device result. The office sees them as an unverified hint.

## Photos

Accepted: JPEG, PNG or WebP, 5 MiB or less, at most 8000 px a side and 40 megapixels. The bytes are sniffed (not the filename or declared type), decoded and **re-encoded to a fresh JPEG**, which drops EXIF including GPS and any data appended after the image. Camera rotation is applied first. Files live on the private `local` disk and are only streamed through the controllers above. Requires the PHP `gd` extension; without it uploads answer `503`.

## Office (Web cookie, reviewer or admin)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/farmer-inquiries` | `status`, `barangay`, `page`. Waiting requests first, oldest first. `meta.waiting` counts unanswered requests. |
| GET | `/api/v1/farmer-inquiries/{uuid}` | Detail with `ai_hint.verified = false`. |
| POST | `/api/v1/farmer-inquiries/{uuid}/review` | `expected_lock_version`. `new` becomes `reviewing`. |
| POST | `/api/v1/farmer-inquiries/{uuid}/replies` | `expected_lock_version`, then `advisory_uuid` (a **validated** advisory only; `422` for a draft, retired or archived one, the last with "This advisory was removed from the office library. Pick another one.") and/or `body` (1000). Closes the request as `replied`. A stale version or a second reply answers `409`. The advisory title is frozen onto the reply. |
| GET | `/api/v1/farmer-inquiries/{uuid}/photos/{n}` | Private stream. |

## Not included

Escalating a request into an office-born case and dispatching an inspector is **not** part of this contract.
