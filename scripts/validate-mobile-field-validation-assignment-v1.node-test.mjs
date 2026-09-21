import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ITEM_FIELDS,
  validateMobileFieldValidationAssignmentArtifact,
} from './validate-mobile-field-validation-assignment-v1.mjs';
import { producerArtifact } from './run-mobile-field-validation-assignment-producer-contract.mjs';

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
      type: name === 'case' || name === 'submitter' || name === 'assignee' || name === 'previous_visit'
        ? 'object'
        : 'string',
      required: name !== 'previous_visit',
      nullable: name === 'previous_visit',
      ...(name === 'case' || name === 'submitter' || name === 'assignee' || name === 'previous_visit'
        ? {
            required_keys: name === 'case'
              ? ['barangay', 'province', 'municipality', 'farmer_or_farm_owner_name', 'affected_area_hectares', 'affected_portion_percent', 'captured_at', 'observed_at', 'submitted_at', 'predicted_label', 'confidence']
              : name === 'previous_visit'
                ? ['reference_code', 'visited_at', 'reporter_suspected_condition', 'authority_classified_condition', 'action_taken', 'field_observation', 'field_finding', 'follow_up_outcome', 'fresh_photo_available']
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

test('keeps optional previous-visit context in the current producer gate', () => {
  const definition = artifact();
  assert.equal(producerArtifact(definition), definition);
  assert.ok('previous_visit' in producerArtifact(definition).fields);
});

test('rejects a changed owner-scoped endpoint', () => {
  const invalid = artifact();
  invalid.wire.path = '/api/v1/mobile/reports/statuses';
  assert.throws(
    () => validateMobileFieldValidationAssignmentArtifact(invalid),
    /not a valid mobile-field-validation-assignment-v1 artifact/,
  );
});
