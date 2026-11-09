# Direct-SQL rows for phones: rulebook

Local and demo only, never production. Prefer the seeders or the import command; if you insert rows with SQL, follow this and then run the check before any phone refreshes:

```sh
cd api
php artisan caneguard:check-mobile-data
```

The check is read-only. It lists each row phones would reject ("fails on phone") or never see ("hidden from phone") with its reference code and the reason, and exits non-zero while any remain. Fix the rows, rerun until it reports none, then refresh the phone.

One bad row can break more than itself: the assignment feed serializes a whole page, so a single row with an empty required date fails the feed for every row on it.

## `reports` row

| Column | Rule |
|---|---|
| `uuid` | A real UUID, unique. |
| `client_uuid` | A real UUID (mint one on the server for office rows); unique per `reporter_id`. |
| `reference_code` | Non-empty, at most 32 characters, unique. |
| `reporter_id` | An existing `users.id`; that user needs a UUID and a name. |
| `origin` | `office` for SQL-inserted rows; `mobile` is the phone-upload default. It records that the case was born in the office rather than uploaded by a phone, so a hand-made row left at the default misreports its source. |
| `case_state` | `open` for work meant for a phone. The assignment feed lists open cases only; `closed` hides the row. |
| `field_validation_state` | `assigned` (or `in_progress`, `completed`) for a row meant for a phone; `unassigned` rows are never on the assignment feed. |
| `district_id` | The configured pilot district (`CANEGUARD_PILOT_DISTRICT_CODE`); anything else, or empty, is hidden. |
| `captured_at`, `submitted_at` | Set (UTC, millisecond precision). Empty values crash the assignment serializer. |
| `created_at`, `updated_at` | Set to now or earlier (UTC). Phones sync by `updated_at`; empty or future values are never received. |
| `predicted_label` | One of `healthy`, `mosaic`, `rust`, `smut` (the phone contract does not allow empty yet). |
| `confidence` | A number from 0 to 1. |
| `barangay` | Non-empty. |
| `affected_portion_percent`, `affected_area_hectares` | Empty, or 0-100 and 0 or more. |

The NOT NULL columns of the `reports` table (image and model columns) still need values; copy a mobile-submitted row as a template.

## Reaching a phone: the assignment row

A report reaches a phone only through a `field_validation_assignments` row, and the report's state must agree with it:

| Column | Rule |
|---|---|
| `uuid` | A real UUID, unique. |
| `report_id` | The report above (one assignment per report). |
| `assignee_id` | An active, email-verified `field_reporter` with an active membership in the pilot district. |
| `assigned_by_id` | An existing user. |
| `activated_at` | Set (UTC). |
| `created_at`, `updated_at` | Set to now or earlier (UTC); the feed syncs by `updated_at` and pages in `id` order. |

Demo flow: insert the report, run the check, assign it to the demo inspector (in the web app, or with this row), run the check again, then refresh the phone. Reports that are not assigned to anyone are not shown on phones.

## What the check reports

Per report: bad `uuid` or `client_uuid`, empty `reference_code`, missing reporter, empty dates, unknown `predicted_label`, `confidence` outside 0-1, empty `barangay`, out-of-range affected area or portion, unknown `case_state` or `field_validation_state`, and an `origin` other than `mobile` or `office`. For assigned work, also: no pilot district, wrong district, `case_state` not `open`, an assigned state with no assignment row, or an assignment with a future `updated_at`, a missing assignee, an assignee who cannot sign in on a phone, or no district membership. Assignments whose report is missing are listed as `(assignment <id>)`.
