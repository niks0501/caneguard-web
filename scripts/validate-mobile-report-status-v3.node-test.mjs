import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADVISORY_FIELD_NAMES,
  EXAMPLE_PATHS,
  FIELD_NAMES,
  SYNC_KEYS,
  readMobileReportStatusExamples,
  readMobileReportStatusV3Artifact,
  validateMobileReportStatusExample,
  validateMobileReportStatusV3Artifact,
} from './validate-mobile-report-status-v3.mjs';

test('mobile report status v3 artifact matches the feed and advisory payload contract', async () => {
  const definition = await readMobileReportStatusV3Artifact();
  assert.deepEqual(Object.keys(definition.fields), FIELD_NAMES);
  assert.deepEqual(definition.fields.advisory.required_keys, ADVISORY_FIELD_NAMES);
  assert.equal(definition.wire.path, '/api/v3/mobile/reports/statuses');
});

test('mobile report status v3 rejects a missing advisory payload field', () => {
  const definition = {
    $id: 'test',
    artifact_format: 'caneguard-json-contract',
    contract: 'mobile-report-status-v3',
    version: 3,
    wire: { method: 'GET', path: '/api/v3/mobile/reports/statuses' },
    envelope: {
      required_keys: ['data', 'links', 'meta', 'sync'],
      checkpoint: 'sync.before',
      sync: { required_keys: SYNC_KEYS, version: { unchanged_request: 'since', continuation_request: 'sync_version' } },
    },
    fields: {
      ...Object.fromEntries(FIELD_NAMES.map((name) => [name, { type: 'string', required: true, nullable: name === 'advisory' }])),
      advisory: {
        type: 'object',
        required: true,
        nullable: true,
        required_keys: ADVISORY_FIELD_NAMES.slice(0, -1),
        properties: {},
      },
    },
    versioning: {},
  };
  assert.throws(
    () => validateMobileReportStatusV3Artifact(definition),
    (error) => error instanceof Error
      && Array.isArray(error.issues)
      && error.issues.includes('advisory.required_keys must be uuid, code, title, content, status, selected_at, delivery_state, delivered_at, validated_at'),
  );
});

// Proves: example fixtures v1-v3 carry every envelope.sync key the artifact declares.
test('mobile report status example fixtures match the declared sync envelope', async () => {
  const definition = await readMobileReportStatusV3Artifact();
  await readMobileReportStatusExamples(definition, EXAMPLE_PATHS);
});

// Proves: a fixture lacking a declared sync key fails the validator.
for (const key of SYNC_KEYS) {
  test(`mobile report status example without sync.${key} is rejected`, async () => {
    const definition = await readMobileReportStatusV3Artifact();
    const { default: example } = await import('../docs/contracts/examples/mobile-report-status-v3.json', { with: { type: 'json' } });
    const { [key]: _omitted, ...sync } = example.sync;
    assert.throws(
      () => validateMobileReportStatusExample({ ...example, sync }, definition),
      (error) => error.issues.includes(`missing sync key ${key}`),
    );
  });
}

// Proves: an artifact that drops the declared sync envelope is rejected.
test('mobile report status v3 rejects an artifact without the sync envelope declaration', async () => {
  const definition = await readMobileReportStatusV3Artifact();
  const { sync: _sync, ...envelope } = definition.envelope;
  assert.throws(
    () => validateMobileReportStatusV3Artifact({ ...definition, envelope }),
    (error) => error.issues.some((issue) => issue.startsWith('envelope.sync.required_keys')),
  );
});
