import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ITEM_FIELDS,
  validateMobileFieldValidationAssignmentArtifact,
} from './validate-mobile-field-validation-assignment-v1.mjs';

function artifact() {
  return {
    $id: 'https://example.test/assignment.json',
    artifact_format: 'caneguard-json-contract',
    contract: 'mobile-field-validation-assignment-v1',
    version: 1,
    wire: {
      method: 'GET',
      path: '/api/v1/mobile/assignments',
      content_type: 'application/json',
      undeclared_fields: 'ignored',
    },
    envelope: {
      required_keys: ['data', 'links', 'meta', 'sync'],
      data_key: 'data',
      next_link: 'links.next',
      checkpoint: 'sync.before',
    },
    fields: Object.fromEntries(ITEM_FIELDS.map((name) => [name, {
      type: name === 'case' || name === 'submitter' || name === 'assignee' ? 'object' : 'string',
      required: true,
      nullable: false,
      ...(name === 'case' || name === 'submitter' || name === 'assignee'
        ? {
            required_keys: name === 'case'
              ? ['barangay', 'province', 'municipality', 'farmer_or_farm_owner_name', 'affected_area_hectares', 'affected_portion_percent', 'captured_at', 'observed_at', 'submitted_at', 'predicted_label', 'confidence']
              : ['uuid', 'name'],
            properties: {},
          }
        : {}),
    }])),
    versioning: { same_major_compatible_widening: ['optional'], new_major_required: ['breaking'] },
  };
}

test('accepts the assignment artifact shape', () => {
  assert.deepEqual(
    Object.keys(validateMobileFieldValidationAssignmentArtifact(artifact()).fields),
    ITEM_FIELDS,
  );
});

test('rejects a changed owner-scoped endpoint', () => {
  const invalid = artifact();
  invalid.wire.path = '/api/v1/mobile/reports/statuses';
  assert.throws(
    () => validateMobileFieldValidationAssignmentArtifact(invalid),
    /not a valid mobile-field-validation-assignment-v1 artifact/,
  );
});
