# Farmer barangay broadcasts v1

Office guidance published to farmers by coarse home barangay. Switch: `CANEGUARD_FARMER_ADVISORIES_ENABLED` (default on; `503 FEATURE_PAUSED` on both sides). Farmer tokens carry `farmer:advisory` alongside `account:security` (and `farmer:inquiry` where that feature is deployed). They never carry an inspector ability. `user.capabilities` lists the farmer abilities whose switches are on.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/farmer-broadcasts` | Web staff. Latest 50 with `live` and `reach` (active, verified farmers whose home barangay is addressed). |
| POST | `/api/v1/farmer-broadcasts` | Web staff. `advisory_uuid` (must be **validated** and not archived, else `422`), `headline_tl`, `headline_en` (160), `body_tl`, `body_en` (2000), then either `all_barangays: true` or a non-empty `barangays[]` of Nasugbu names (neither or both is `422`), optional `expires_in_days` 1 to 60 (default 14). |
| POST | `/api/v1/farmer-broadcasts/{uuid}/retire` | Withdraws it from phones. Idempotent. |
| GET | `/api/v1/mobile/farmer/advisories` | Farmer, `farmer:advisory`. Live broadcasts for the farmer's home barangay plus all-barangay ones; with no home barangay set, only all-barangay ones. |
| PATCH | `/api/v1/mobile/farmer/profile` | Farmer, `account:security`. `barangay` (Nasugbu name or null) and `preferred_language` (`tl` or `en`). Role and every other field are refused. |

A broadcast is live while it is not withdrawn, not expired and its advisory is still `validated`: retiring or archiving (deleting) the advisory hides every broadcast built on it immediately. An advisory a broadcast uses is archived rather than removed, and the office list still returns the broadcast with its advisory. The phone payload carries the headline and message in both languages only: no target list, no farmer names, no coordinates. Nothing here writes to `reports`.
