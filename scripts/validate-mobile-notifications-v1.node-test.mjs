import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertSelectionBoundMatchesController,
  validateMobileNotificationsArtifact,
} from './validate-mobile-notifications-v1.mjs';

const controllerSource = `
    /** Unread items plus this many days of history are served. */
    public const FEED_WINDOW_DAYS = 60;

    /** Hard ceiling on rows in one feed window, newest first. */
    public const FEED_MAX_ROWS = 500;
`;

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
    sync: {
      required_keys: ['before', 'version', 'total', 'truncated', 'unchanged'],
      version: { unchanged_request: 'since', continuation_request: 'sync_version' },
    },
    selection: {
      anchor: 'sync.before',
      unread: 'always included',
      read_history_days: 60,
      max_rows: 500,
      cap_order: 'created_at descending, id descending',
    },
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
    content: { type: 'string', required: true, nullable: true },
    advisory: {
      type: 'object',
      required: true,
      nullable: true,
      required_keys: ['uuid', 'code', 'title', 'content', 'status', 'selected_at'],
      properties: {},
    },
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

test('accepts a selection bound that matches the controller constants', () => {
  assert.equal(
    assertSelectionBoundMatchesController(valid, controllerSource),
    undefined,
  );
});

test('rejects a selection bound that drifted from the controller constants', () => {
  assert.throws(
    () => assertSelectionBoundMatchesController(
      {
        ...valid,
        envelope: {
          ...valid.envelope,
          selection: { ...valid.envelope.selection, read_history_days: 90, max_rows: 1000 },
        },
      },
      controllerSource,
    ),
    (error) =>
      error instanceof Error &&
      Array.isArray(error.issues) &&
      error.issues.includes('envelope.selection.read_history_days is 90 but FEED_WINDOW_DAYS is 60') &&
      error.issues.includes('envelope.selection.max_rows is 1000 but FEED_MAX_ROWS is 500'),
  );
});

test('rejects a selection bound when the controller declares no window constants', () => {
  assert.throws(
    () => assertSelectionBoundMatchesController(valid, '<?php final class Unrelated {}'),
    (error) =>
      error instanceof Error &&
      Array.isArray(error.issues) &&
      error.issues.includes('does not declare const FEED_WINDOW_DAYS') &&
      error.issues.includes('does not declare const FEED_MAX_ROWS'),
  );
});

test('rejects a notification artifact without an envelope selection bound', () => {
  const envelope = { ...valid.envelope };
  delete envelope.selection;
  assert.throws(
    () => validateMobileNotificationsArtifact({ ...valid, envelope }),
    (error) =>
      error instanceof Error &&
      Array.isArray(error.issues) &&
      error.issues.includes('envelope.selection must be an object'),
  );
});

// Proves: a notification artifact that drops a declared sync stamp key is rejected.
test('rejects a notification artifact missing a declared sync stamp key', () => {
  assert.throws(
    () => validateMobileNotificationsArtifact({
      ...valid,
      envelope: { ...valid.envelope, sync: { ...valid.envelope.sync, required_keys: ['before'] } },
    }),
    (error) => error.issues.some((issue) => issue.startsWith('envelope.sync.required_keys')),
  );
});
