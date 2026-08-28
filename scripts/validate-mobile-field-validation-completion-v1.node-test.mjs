import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateMobileFieldValidationCompletionArtifact,
} from './validate-mobile-field-validation-completion-v1.mjs';

const valid = {
  artifact_format: 'caneguard-multipart-contract',
  contract: 'mobile-field-validation-completion-v1',
  version: 1,
  status: 'stable',
  owner: 'niks0501/caneguard-web/api',
  wire: {
    method: 'POST',
    path: '/api/v1/mobile/assignments/{assignment}/completion',
    content_type: 'multipart/form-data',
    undeclared_fields: 'ignored',
  },
  authentication: {},
  fields: {
    client_uuid: { wire_type: 'text', type: 'uuid', required: true, nullable: false },
    field_observation: { wire_type: 'text', type: 'string', required: true, nullable: false },
    field_finding: { wire_type: 'text', type: 'string', required: true, nullable: false },
    action_taken: { wire_type: 'text', type: 'string', required: true, nullable: false },
    visited_at: { wire_type: 'text', type: 'date-time', required: true, nullable: false },
    gps_outcome: { wire_type: 'text', type: 'string', required: true, nullable: false },
    gps_attempted_at: { wire_type: 'text', type: 'date-time', required: true, nullable: false },
    gps_latitude: { wire_type: 'text', type: 'number', required: false, nullable: true },
    gps_longitude: { wire_type: 'text', type: 'number', required: false, nullable: true },
    gps_accuracy: { wire_type: 'text', type: 'number', required: false, nullable: true },
    fresh_photo: { wire_type: 'file', type: 'image', required: false, nullable: true },
  },
  response: {},
  versioning: {},
};

test('accepts the completion artifact shape', () => {
  assert.equal(validateMobileFieldValidationCompletionArtifact(valid), valid);
});

test('rejects a required fresh photo', () => {
  assert.throws(
    () => validateMobileFieldValidationCompletionArtifact({
      ...valid,
      fields: { ...valid.fields, fresh_photo: { ...valid.fields.fresh_photo, required: true } },
    }),
    (error) => {
      return (
        typeof error === 'object'
        && error !== null
        && Array.isArray(error.issues)
        && error.issues.includes('fresh_photo must remain optional')
      );
    },
  );
});
