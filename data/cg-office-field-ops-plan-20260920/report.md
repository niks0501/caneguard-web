# Locked field-operations plan — 2026-09-20

All eight launch calls are recorded below. Q4 was verified in base before implementation: https://github.com/niks0501/caneguard-web/pull/135 is merged.

## Eight recorded calls

1. **Q4 prerequisite:** Reuse `PATCH /api/v1/reports/{report}/review`; the base contains the merged assignment/outcome work.
2. **Planner:** Add the Field Operations planner under the consolidated Monitoring workspace. It lists open `needs_visit` work and sends assignment/reassignment changes through the existing review save endpoint with the report lock version.
3. **Assignment context:** Extend the report list resource with assignment identity, assignee, schedule, and lock version so planner rows can save without inventing a second mutation API.
4. **Needs assessment:** Add an outcome-triage view with a Needs assessment section for completed outcomes and unassigned visit handoffs into Field Operations.
5. **Needs attention:** Define the attention section as Worsened plus Unable to determine; keep overdue visits in a separate section and count.
6. **Monitoring consolidation:** Add Register, Calendar, Map, and Field Operations workspace tabs while retaining Submitted reports as its own navigation entry.
7. **Inspector schedule:** Keep the schedule discoverable as the saved Inspector schedule tab, backed by the existing date-only visit calendar.
8. **Q5 phone context:** Add `previous_visit.follow_up_outcome` to the assignment contract and `MobileFieldValidationAssignmentResource`; the phone UI remains out of scope.

## Implementation notes

- `FieldOperationsPage` uses eligible Field Inspectors and `useUpdateReportReview` with `fieldValidationState: assigned`, assignee UUID, optional target visit date, and `expectedVersion`.
- `NeedsAssessmentPage` reads completed assessment outcomes and open visit queues. Overdue is sourced from `follow_up_due`, not folded into outcome attention.
- `MonitoringWorkspacePage` provides the four consolidated views; map URL writes preserve `view=map`.
- `ReportListResource` now exposes assignment metadata and `version`; the list filter boundary accepts `follow_up_outcome` for future saved filters.
- No risk-band behavior, phone UI, or visual redraw was added.

## Verification recorded

- `npm run typecheck`
- `npm run lint`
- `npm run test -- --run` (41 files, 208 tests)
- `npm run build`
- `npm run contract:assignment-artifact` and `npm run contract:test`
- `npm run api:test` (280 tests)
- `cd api && php artisan test tests/Feature/FieldValidationAssignmentTest.php tests/Feature/ReportApiTest.php` (49 tests)
- `npm run api:format:check` / Pint
- `npm run graphify:validate`

The MySQL suite was attempted separately but is unavailable in this worktree: every test failed before execution with `SQLSTATE[HY000] [1698] Access denied for user 'root'@'localhost'`.
