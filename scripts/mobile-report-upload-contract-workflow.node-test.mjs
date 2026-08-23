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
  assert.equal(occurrences('api/app/Policies/ReportPolicy.php', safeWorkflow), 1);
  assert.equal(occurrences('api/app/Policies/ReportPolicy.php', trustedWorkflow), 1);
  assert.equal(occurrences('docs/testing/mobile-report-upload-contract-gate.md', safeWorkflow), 1);
  assert.equal(occurrences('docs/testing/mobile-report-upload-contract-gate.md', trustedWorkflow), 1);
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
