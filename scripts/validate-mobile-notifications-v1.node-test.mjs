import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateMobileNotificationsArtifact,
} from './validate-mobile-notifications-v1.mjs';

const valid = {
  $id: 'https://example.test/mobile-notifications-v1.json',
  artifact_format: 'caneguard-json-contract',
  contract: 'mobile-notifications-v1',
  version: 1,
  wire: {
    method: 'GET',
    path: '/api/v1/mobile/notifications',
    content_type: 'application/json',
    undeclared_fields: 'ignored',
  },
  envelope: {
    required_keys: ['data', 'links', 'meta', 'sync'],
    data_key: 'data',
    next_link: 'links.next',
    checkpoint: 'sync.before',
  },
  fields: {
    id: { type: 'uuid', required: true, nullable: false },
    event_type: { type: 'string', required: true, nullable: false },
    title: { type: 'string', required: true, nullable: false },
    message: { type: 'string', required: true, nullable: false },
    case: {
      type: 'object',
      required: true,
      nullable: false,
      required_keys: ['uuid', 'reference_code'],
      properties: {},
    },
    assignment_uuid: { type: 'uuid', required: true, nullable: true },
    is_read: { type: 'boolean', required: true, nullable: false },
    read_at: { type: 'date-time', required: true, nullable: true },
    created_at: { type: 'date-time', required: true, nullable: true },
  },
  versioning: {},
};

test('accepts the notification artifact shape', () => {
  assert.equal(validateMobileNotificationsArtifact(valid), valid);
});

test('rejects a notification artifact with an unsafe envelope checkpoint', () => {
  assert.throws(
    () => validateMobileNotificationsArtifact({
      ...valid,
      envelope: { ...valid.envelope, checkpoint: 'meta.sync_before' },
    }),
    (error) =>
      error instanceof Error &&
      Array.isArray(error.issues) &&
      error.issues.includes('envelope.checkpoint must be sync.before'),
  );
});
