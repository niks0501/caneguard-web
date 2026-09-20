import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADVISORY_FIELD_NAMES,
  FIELD_NAMES,
  readMobileReportStatusV3Artifact,
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
    envelope: { required_keys: ['data', 'links', 'meta', 'sync'], checkpoint: 'sync.before' },
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
