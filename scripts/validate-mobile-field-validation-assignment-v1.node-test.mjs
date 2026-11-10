import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  ITEM_FIELDS,
  assertAssignmentSyncSurface,
  assertWorkSetCapMatchesController,
  readMobileFieldValidationAssignmentArtifact,
  validateMobileFieldValidationAssignmentArtifact,
} from './validate-mobile-field-validation-assignment-v1.mjs';
import { producerArtifact } from './run-mobile-field-validation-assignment-producer-contract.mjs';

const controllerSource = `
    /** Rows one bounded download may carry; the artifact mirrors it. */
    public const WORK_SET_CAP = 300;
`;

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
      sync: {
        required_keys: ['before', 'version', 'total', 'truncated', 'unchanged'],
        version: {
          changes_on: ['reassignment', 'unassignment', 'case close'],
          ignores: 'fields this feed withholds',
          unchanged_request: 'since',
        },
        cap: {
          request_parameter: 'limit',
          limit_max: 300,
          total_flag: 'sync.total',
          truncated_flag: 'sync.truncated',
          without_limit: 'the complete snapshot',
          keep_order: ['active work before completed visits'],
        },
        bounded_continuation: {
          link_parameter: 'sync_version',
          request_parameter: 'sync_version',
          restart: { status: 409, code: 'SYNC_RESTART' },
        },
      },
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

test('accepts the declared sync surface', () => {
  assert.equal(assertAssignmentSyncSurface(artifact()), undefined);
});

test('rejects an artifact without a sync surface', () => {
  const envelope = { ...artifact().envelope };
  delete envelope.sync;
  assert.throws(
    () => assertAssignmentSyncSurface({ ...artifact(), envelope }),
    (error) =>
      error instanceof Error &&
      Array.isArray(error.issues) &&
      error.issues.includes(
        'envelope.sync must describe the version, cap and bounded-continuation surface',
      ),
  );
});

test('rejects a sync-less artifact on the read path', () => {
  const artifactPath = join(mkdtempSync(join(tmpdir(), 'assignment-artifact-')), 'artifact.json');
  const envelope = { ...artifact().envelope };
  delete envelope.sync;
  writeFileSync(artifactPath, JSON.stringify({ ...artifact(), envelope }));

  return assert.rejects(
    readMobileFieldValidationAssignmentArtifact(artifactPath),
    (error) =>
      error instanceof Error &&
      Array.isArray(error.issues) &&
      error.issues.includes(
        'envelope.sync must describe the version, cap and bounded-continuation surface',
      ),
  );
});

test('accepts a cap that matches the controller constant', () => {
  assert.equal(
    assertWorkSetCapMatchesController(artifact(), controllerSource),
    undefined,
  );
});

test('rejects a cap that drifted from the controller constant', () => {
  const definition = artifact();
  definition.envelope.sync.cap.limit_max = 250;
  assert.throws(
    () => assertWorkSetCapMatchesController(definition, controllerSource),
    (error) =>
      error instanceof Error &&
      Array.isArray(error.issues) &&
      error.issues.includes('envelope.sync.cap.limit_max is 250 but WORK_SET_CAP is 300'),
  );
});

test('rejects a cap when the controller declares no cap constant', () => {
  assert.throws(
    () => assertWorkSetCapMatchesController(artifact(), '<?php final class Unrelated {}'),
    (error) =>
      error instanceof Error &&
      Array.isArray(error.issues) &&
      error.issues.includes('does not declare const WORK_SET_CAP'),
  );
});

test('keeps optional previous-visit context in the current producer gate', () => {
  const definition = artifact();
  assert.equal(producerArtifact(definition), definition);
  assert.ok('previous_visit' in producerArtifact(definition).fields);
  assert.equal(definition.fields.previous_visit.required, false);
  assert.equal(definition.fields.previous_visit.nullable, true);
  assert.deepEqual(
    definition.fields.previous_visit.required_keys,
    ['reference_code', 'visited_at', 'reporter_suspected_condition', 'authority_classified_condition', 'action_taken', 'field_observation', 'field_finding', 'follow_up_outcome', 'fresh_photo_available'],
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
