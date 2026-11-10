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
  validateAssignmentRow,
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

function officeRow(overrides = {}) {
  return {
    case: {
      barangay: 'Poblacion', province: null, municipality: null, farmer_or_farm_owner_name: null,
      affected_area_hectares: null, affected_portion_percent: null,
      captured_at: '2026-11-10T00:00:00Z', observed_at: null, submitted_at: '2026-11-10T00:00:00Z',
      predicted_label: null, confidence: null,
      origin: 'office', version: 1,
      status: { workflow_status: 'new', case_state: 'open', review_status: 'pending', updated_at: '2026-11-10T00:00:00Z' },
      reporter_concern: { suspected_condition: null, observation_text: null },
      photo: null,
      ...overrides,
    },
  };
}

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

// Intent: a scanless office fixture validates under v2 and fails under v1.
test('scanless office row passes v2 and fails v1', async () => {
  const v1 = await readMobileFieldValidationAssignmentArtifact(DEFAULT_ARTIFACT_PATH);
  const v2 = await readMobileFieldValidationAssignmentArtifact(V2_ARTIFACT_PATH);
  assert.deepEqual(validateAssignmentRow(v2, officeRow()), []);
  const v1Issues = validateAssignmentRow(v1, officeRow());
  assert.ok(v1Issues.includes('case.predicted_label must not be null'));
  assert.ok(v1Issues.includes('case.confidence must not be null'));
});

// Intent: a scanned row validates under both versions, and v2 rejects a half-set AI pair.
test('scanned row passes both versions; half-set AI pair fails v2', async () => {
  const v1 = await readMobileFieldValidationAssignmentArtifact(DEFAULT_ARTIFACT_PATH);
  const v2 = await readMobileFieldValidationAssignmentArtifact(V2_ARTIFACT_PATH);
  const scanned = officeRow({ predicted_label: 'rust', confidence: 0.9 });
  assert.deepEqual(validateAssignmentRow(v1, scanned), []);
  assert.deepEqual(validateAssignmentRow(v2, scanned), []);
  assert.ok(validateAssignmentRow(v2, officeRow({ predicted_label: 'rust' })).length > 0);
});

// Intent: v2 must not validate with a v1 nullability stance.
test('rejects a v2 artifact whose AI fields are not nullable', async () => {
  const v2 = JSON.parse(JSON.stringify(await readMobileFieldValidationAssignmentArtifact(V2_ARTIFACT_PATH)));
  v2.fields.case.properties.confidence.nullable = false;
  assert.throws(() => validateMobileFieldValidationAssignmentArtifact(v2), (e) => e.issues.includes('case.confidence.nullable must be true in v2'));
});
