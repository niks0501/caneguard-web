import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  ITEM_FIELDS,
  assertAssignmentSyncSurface,
  assertWorkSetCapMatchesController,
  DEFAULT_ARTIFACT_PATH,
  V2_ARTIFACT_PATH,
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
    fields: Object.fromEntries(ITEM_FIELDS.map((name) => {
      const objectField = name === 'case' || name === 'submitter' || name === 'assignee' || name === 'previous_visit';
      const requiredKeys = name === 'case'
        ? ['barangay', 'province', 'municipality', 'farmer_or_farm_owner_name', 'affected_area_hectares', 'affected_portion_percent', 'captured_at', 'observed_at', 'submitted_at', 'predicted_label', 'confidence']
        : name === 'previous_visit'
          ? ['reference_code', 'visited_at', 'reporter_suspected_condition', 'authority_classified_condition', 'action_taken', 'field_observation', 'field_finding', 'follow_up_outcome', 'fresh_photo_available']
          : ['uuid', 'name'];
      return [name, {
        type: objectField ? 'object' : 'string',
        required: name !== 'previous_visit',
        nullable: name === 'previous_visit',
        ...(objectField
          ? {
              required_keys: requiredKeys,
              properties: Object.fromEntries(requiredKeys.map((key) => [key, {
                type: key === 'confidence' ? 'number' : 'string',
                required: true,
                nullable: false,
              }])),
            }
          : {}),
      }];
    })),
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

// Intent: the frozen v1 keeps non-null AI fields while v2 carries the scanless widening and office projection.
test('v1 stays non-null and v2 widens the AI fields', async () => {
  const v1 = await readMobileFieldValidationAssignmentArtifact(DEFAULT_ARTIFACT_PATH);
  const v2 = await readMobileFieldValidationAssignmentArtifact(V2_ARTIFACT_PATH);
  assert.equal(v1.version, 1);
  assert.equal(v2.version, 2);
  assert.equal(v1.fields.case.properties.predicted_label.nullable, false);
  assert.equal(v2.fields.case.properties.predicted_label.nullable, true);
  assert.equal(v2.fields.case.properties.confidence.nullable, true);
  for (const name of ['origin', 'version', 'status', 'reporter_concern', 'photo']) {
    assert.equal(v2.fields.case.properties[name].required, false);
  }
});

// Intent: v2 must not validate with a v1 nullability stance.
test('rejects a v2 artifact whose AI fields are not nullable', async () => {
  const v2 = JSON.parse(JSON.stringify(await readMobileFieldValidationAssignmentArtifact(V2_ARTIFACT_PATH)));
  v2.fields.case.properties.confidence.nullable = false;
  assert.throws(() => validateMobileFieldValidationAssignmentArtifact(v2), (e) => e.issues.includes('case.confidence.nullable must be true in v2'));
});

// Intent: an AI case field the contract declares required must carry a definition in both versions.
test('rejects an artifact whose AI case property is undeclared', async () => {
  const v1 = JSON.parse(JSON.stringify(await readMobileFieldValidationAssignmentArtifact(DEFAULT_ARTIFACT_PATH)));
  const v2 = JSON.parse(JSON.stringify(await readMobileFieldValidationAssignmentArtifact(V2_ARTIFACT_PATH)));
  delete v1.fields.case.properties.predicted_label;
  delete v2.fields.case.properties.confidence;
  v2.fields.case.properties.predicted_label = 'string';
  assert.throws(
    () => validateMobileFieldValidationAssignmentArtifact(v1),
    (e) => e.issues.includes('case.predicted_label must be declared as a property in v1'),
  );
  assert.throws(
    () => validateMobileFieldValidationAssignmentArtifact(v2),
    (e) => e.issues.includes('case.predicted_label must be declared as a property in v2')
      && e.issues.includes('case.confidence must be declared as a property in v2'),
  );
});

// Intent: the AI pair stays required and typed as published, even though v2 makes it nullable.
test('rejects AI case properties that contradict the published shape', async () => {
  const v2 = JSON.parse(JSON.stringify(await readMobileFieldValidationAssignmentArtifact(V2_ARTIFACT_PATH)));
  v2.fields.case.properties.confidence = { type: 'string', required: false, nullable: true };
  assert.throws(
    () => validateMobileFieldValidationAssignmentArtifact(v2),
    (e) => e.issues.includes('case.confidence.type must be number')
      && e.issues.includes('case.confidence.required must be true in v2'),
  );
});

// Intent: office projection fields keep their declared type and nested schema in v2.
test('rejects office case properties that contradict the published shape', async () => {
  const v2 = JSON.parse(JSON.stringify(await readMobileFieldValidationAssignmentArtifact(V2_ARTIFACT_PATH)));
  v2.fields.case.properties.origin = { required: false };
  v2.fields.case.properties.status = { type: 'object', required: false, properties: {} };
  assert.throws(
    () => validateMobileFieldValidationAssignmentArtifact(v2),
    (e) => e.issues.includes('case.origin.type must be string')
      && e.issues.includes('field case.status.required_keys must declare workflow_status, case_state, review_status, updated_at')
      && e.issues.includes('case.status.workflow_status must be declared as a property'),
  );
});

// Intent: malformed nested office subfields (wrong type, required or nullable) fail v2 validation.
test('rejects wrongly-shaped nested office subfields', async () => {
  const v2 = JSON.parse(JSON.stringify(await readMobileFieldValidationAssignmentArtifact(V2_ARTIFACT_PATH)));
  const { status, reporter_concern: concern, photo } = v2.fields.case.properties;
  status.properties.updated_at.type = 'string';
  status.nullable = true;
  concern.properties.observation_text.nullable = false;
  photo.properties.bytes = { type: 'string', required: false, nullable: false };
  assert.throws(
    () => validateMobileFieldValidationAssignmentArtifact(v2),
    (e) => e.issues.includes('case.status.updated_at.type must be date-time')
      && e.issues.includes('case.status.nullable must be false in v2')
      && e.issues.includes('case.reporter_concern.observation_text.nullable must be true')
      && e.issues.includes('case.photo.bytes.type must be number')
      && e.issues.includes('case.photo.bytes.required must be true'),
  );
});
