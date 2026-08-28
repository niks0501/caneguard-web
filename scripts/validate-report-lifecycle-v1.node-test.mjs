import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DIMENSION_NAMES,
  DIMENSION_VALUES,
  validateReportLifecycleArtifact,
} from './validate-report-lifecycle-v1.mjs';

const projection = {
  case_state: 'open',
  verification_outcome: 'not_determined',
  field_validation_state: 'unassigned',
  referral_state: 'not_referred',
};
const valid = {
  $id: 'https://example.test/report-lifecycle-v1.json',
  artifact_format: 'caneguard-lifecycle-contract',
  contract: 'report-lifecycle-v1',
  version: 1,
  status: 'stable',
  owner: 'niks0501/caneguard-web/api',
  dimensions: Object.fromEntries(DIMENSION_NAMES.map((name) => [name, {
    values: DIMENSION_VALUES[name],
    authority: 'test',
    description: 'A lifecycle dimension.',
  }])),
  legacy_projection: Object.fromEntries([
    ['submitted_unverified', projection],
    ['for_field_validation', projection],
    ['verified_by_staff', { ...projection, case_state: 'closed', verification_outcome: 'verified' }],
    ['unable_to_verify', { ...projection, case_state: 'closed', verification_outcome: 'unable_to_verify' }],
    ['resolved', { ...projection, case_state: 'closed' }],
    ['unknown', { ...projection, case_state: 'closed' }],
  ]),
  rules: {
    verification_does_not_close_case: true,
    field_validation_completion_does_not_verify_or_close: true,
    referral_is_not_verification_outcome: true,
    field_reporter_can_complete_assignment: true,
    field_reporter_can_close_case: false,
    completed_validation_cannot_be_reassigned_or_removed: true,
    final_disposition_roles: ['reviewer', 'admin'],
    ai_evidence_role: 'decision_support_only',
  },
  payload_contracts: [
    'mobile-report-upload-v1',
    'mobile-field-validation-assignment-v1',
    'mobile-field-validation-completion-v1',
    'mobile-notifications-v1',
  ],
  versioning: {},
};

test('accepts the lifecycle artifact shape', () => {
  assert.equal(validateReportLifecycleArtifact(valid), valid);
});

test('rejects lifecycle authority that treats AI evidence as verification', () => {
  assert.throws(
    () => validateReportLifecycleArtifact({
      ...valid,
      rules: { ...valid.rules, ai_evidence_role: 'authority_verification' },
    }),
    (error) =>
      Array.isArray(error?.issues)
      && error.issues.includes('rules.ai_evidence_role must be decision_support_only'),
  );
});
