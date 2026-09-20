import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workflowDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../.github/workflows',
);
const safeWorkflowPath = path.join(
  workflowDirectory,
  'mobile-report-upload-contract.yml',
);
const trustedWorkflowPath = path.join(
  workflowDirectory,
  'mobile-report-upload-contract-trusted.yml',
);
const [safeWorkflow, trustedWorkflow] = await Promise.all([
  readFile(safeWorkflowPath, 'utf8'),
  readFile(trustedWorkflowPath, 'utf8'),
]);

function occurrences(value, source) {
  return source.split(value).length - 1;
}

test('keeps the cross-repository secret out of pull-request execution', () => {
  const secretExpression = '${{ secrets.CANEGUARD_MOBILE_READ_TOKEN }}';
  const trustedJobStart = trustedWorkflow.indexOf(
    '  trusted-cross-repository-gate:',
  );
  const secretIndex = trustedWorkflow.indexOf(secretExpression);

  assert.equal(occurrences(secretExpression, safeWorkflow), 0);
  assert.equal(occurrences(secretExpression, trustedWorkflow), 1);
  assert(secretIndex > trustedJobStart);
  assert(!safeWorkflow.includes('CANEGUARD_MOBILE_READ_TOKEN'));
  assert(!safeWorkflow.includes('pull_request_target'));
  assert(!trustedWorkflow.includes('pull_request:'));
  assert.match(
    trustedWorkflow,
    /if: github\.event_name == 'push' \|\| \(github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'\)/,
  );
});

test('keeps workflow self-changes and model label changes in the trigger scope', () => {
  const workflowPath = '.github/workflows/mobile-report-upload-contract';

  assert.equal(occurrences(`${workflowPath}.yml`, safeWorkflow), 1);
  assert.equal(occurrences(`${workflowPath}-trusted.yml`, safeWorkflow), 1);
  assert.equal(occurrences(`${workflowPath}.yml`, trustedWorkflow), 1);
  assert.equal(occurrences(`${workflowPath}-trusted.yml`, trustedWorkflow), 1);
  assert.equal(occurrences('api/app/Models/Report.php', safeWorkflow), 1);
  assert.equal(occurrences('api/app/Models/Report.php', trustedWorkflow), 1);
  for (const path of [
    'docs/contracts/mobile-field-validation-assignment-v1.json',
    'docs/contracts/mobile-field-validation-completion-v1.json',
    'docs/contracts/mobile-notifications-v1.json',
    'docs/contracts/report-lifecycle-v1.json',
    'scripts/validate-mobile-field-validation-assignment-v1.mjs',
    'scripts/validate-mobile-notifications-v1.mjs',
    'scripts/validate-report-lifecycle-v1.mjs',
    'api/app/Http/Controllers/Api/V1/MobileFieldValidationAssignmentController.php',
    'api/app/Contracts/MobileFieldValidationCompletionContract.php',
    'api/app/Contracts/MobileNotificationContract.php',
    'api/app/Contracts/ReportLifecycleContract.php',
    'api/app/Http/Requests/MobileNotificationRequest.php',
    'api/app/Http/Controllers/Api/V1/NotificationController.php',
    'api/app/Http/Controllers/Api/V1/ReviewReportController.php',
    'api/app/Http/Controllers/Api/V1/FieldValidationQueueController.php',
    'api/app/Http/Requests/FieldValidationQueueRequest.php',
    'api/app/Http/Requests/ListNotificationsRequest.php',
    'api/app/Http/Requests/NotificationMutationRequest.php',
    'api/app/Http/Resources/ReportListResource.php',
    'api/app/Http/Resources/MapReportResource.php',
    'api/app/Http/Resources/FieldValidationQueueResource.php',
    'api/app/Http/Resources/FieldValidationAssignmentResource.php',
    'api/app/Http/Resources/FieldValidationCompletionResource.php',
    'api/app/Http/Resources/MobileFieldValidationAssignmentResource.php',
    'api/app/Http/Resources/MobileNotificationResource.php',
    'api/app/Http/Resources/NotificationResource.php',
    'api/app/Notifications/**',
    'api/routes/channels.php',
    'api/app/Actions/Notifications/**',
    'api/app/Actions/Reports/ApplyReportFilters.php',
    'api/app/Actions/Reports/QueryFieldValidationQueue.php',
    'api/app/Events/CaseAttentionChanged.php',
    'api/app/Events/NewCaseSubmitted.php',
    'api/tests/Feature/FieldValidationAssignmentTest.php',
    'api/tests/Feature/NotificationTest.php',
    'api/tests/Feature/ReportLifecycleContractTest.php',
    'api/app/Models/FieldValidationCompletion.php',
  ]) {
    assert(safeWorkflow.includes(path), `${path} safe trigger`);
    assert(trustedWorkflow.includes(path), `${path} trusted trigger`);
  }
  assert.equal(occurrences('api/app/Policies/ReportPolicy.php', safeWorkflow), 1);
  assert.equal(occurrences('api/app/Policies/ReportPolicy.php', trustedWorkflow), 1);
  assert.equal(occurrences('docs/testing/mobile-report-upload-contract-gate.md', safeWorkflow), 1);
  assert.equal(occurrences('docs/testing/mobile-report-upload-contract-gate.md', trustedWorkflow), 1);
  assert.equal(occurrences('docs/testing/phase1-lifecycle-acceptance.md', safeWorkflow), 1);
  assert.equal(occurrences('docs/testing/phase1-lifecycle-acceptance.md', trustedWorkflow), 1);
  assert.match(safeWorkflow, /npm run contract:notification-consumer/);
  assert.match(safeWorkflow, /npm run contract:lifecycle-consumer/);
  assert.match(trustedWorkflow, /npm run contract:notification-producer/);
  assert.match(trustedWorkflow, /npm run contract:lifecycle-producer/);
  assert.match(safeWorkflow, /pull_request:/);
  assert(!safeWorkflow.includes('workflow_dispatch:'));
  assert.match(trustedWorkflow, /push:/);
  assert.match(trustedWorkflow, /workflow_dispatch:/);
});

test('disables checkout credential persistence for every checkout', () => {
  assert.equal(occurrences('persist-credentials: false', safeWorkflow), 1);
  assert.equal(occurrences('persist-credentials: false', trustedWorkflow), 2);
  const mobileCheckoutStart = trustedWorkflow.indexOf(
    '      - name: Checkout exact mobile revision with read-only token',
  );
  const mobileCheckoutEnd = trustedWorkflow.indexOf(
    '      - name: Validate exact mobile revision',
    mobileCheckoutStart,
  );
  const mobileCheckout = trustedWorkflow.slice(
    mobileCheckoutStart,
    mobileCheckoutEnd,
  );

  assert.match(
    mobileCheckout,
    /token: \$\{\{ secrets\.CANEGUARD_MOBILE_READ_TOKEN \}\}/,
  );
  assert.match(mobileCheckout, /persist-credentials: false/);
});
