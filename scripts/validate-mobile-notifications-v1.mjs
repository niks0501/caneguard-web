import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ARTIFACT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../docs/contracts/mobile-notifications-v1.json',
);
// The artifact declares the feed-selection bound; the controller constants are
// its runtime source of truth, so both are compared instead of hand-copied.
const DEFAULT_CONTROLLER_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../api/app/Http/Controllers/Api/V1/MobileNotificationController.php',
);
const SELECTION_KEYS = ['anchor', 'unread', 'read_history_days', 'max_rows', 'cap_order'];
const SELECTION_CONTROLLER_CONSTANTS = {
  read_history_days: 'FEED_WINDOW_DAYS',
  max_rows: 'FEED_MAX_ROWS',
};
const TOP_LEVEL_KEYS = [
  '$id',
  'artifact_format',
  'contract',
  'version',
  'wire',
  'envelope',
  'fields',
  'versioning',
];
const FIELD_NAMES = [
  'id',
  'event_type',
  'title',
  'message',
  'case',
  'assignment_uuid',
  'content',
  'advisory',
  'is_read',
  'read_at',
  'created_at',
];

export class NotificationContractArtifactError extends Error {
  constructor(source, issues) {
    super(`[artifact] ${source} is not a valid mobile-notifications-v1 artifact.`);
    this.name = 'NotificationContractArtifactError';
    this.category = 'artifact';
    this.source = source;
    this.issues = issues;
  }
}

export async function readMobileNotificationsArtifact(artifactPath = DEFAULT_ARTIFACT_PATH) {
  let contents;
  try {
    contents = await readFile(artifactPath, 'utf8');
  } catch (error) {
    throw new NotificationContractArtifactError(artifactPath, [
      `could not be read: ${error.message}`,
    ]);
  }

  let definition;
  try {
    definition = JSON.parse(contents);
  } catch (error) {
    throw new NotificationContractArtifactError(artifactPath, [
      `contains invalid JSON: ${error.message}`,
    ]);
  }

  return validateMobileNotificationsArtifact(definition, artifactPath);
}

export function validateMobileNotificationsArtifact(definition, source = 'artifact') {
  const issues = [];
  if (!isObject(definition)) {
    throw new NotificationContractArtifactError(source, ['the JSON root must be an object']);
  }

  for (const key of TOP_LEVEL_KEYS) {
    if (!(key in definition)) issues.push(`missing top-level property ${key}`);
  }
  if (definition.artifact_format !== 'caneguard-json-contract') {
    issues.push('artifact_format must be caneguard-json-contract');
  }
  if (definition.contract !== 'mobile-notifications-v1') {
    issues.push('contract must be mobile-notifications-v1');
  }
  if (definition.version !== 1) issues.push('version must be numeric v1 (1)');

  const wire = definition.wire;
  if (!isObject(wire)) {
    issues.push('wire must be an object');
  } else {
    if (wire.method !== 'GET') issues.push('wire.method must be GET');
    if (wire.path !== '/api/v1/mobile/notifications') {
      issues.push('wire.path must be /api/v1/mobile/notifications');
    }
    if (wire.content_type !== 'application/json') {
      issues.push('wire.content_type must be application/json');
    }
    if (wire.undeclared_fields !== 'ignored') {
      issues.push('wire.undeclared_fields must be ignored');
    }
  }

  const envelope = definition.envelope;
  if (!isObject(envelope)) {
    issues.push('envelope must be an object');
  } else {
    if (!sameList(envelope.required_keys, ['data', 'links', 'meta', 'sync'])) {
      issues.push('envelope.required_keys must declare data, links, meta, sync');
    }
    if (envelope.data_key !== 'data') issues.push('envelope.data_key must be data');
    if (envelope.next_link !== 'links.next') issues.push('envelope.next_link must be links.next');
    if (envelope.checkpoint !== 'sync.before') issues.push('envelope.checkpoint must be sync.before');
    validateSyncEnvelope(envelope.sync, issues);
    validateSelection(envelope.selection, issues);
  }

  if (!isObject(definition.fields)) {
    issues.push('fields must be an object');
  } else {
    if (!sameList(Object.keys(definition.fields), FIELD_NAMES)) {
      issues.push(`fields must be ordered as ${FIELD_NAMES.join(', ')}`);
    }
    for (const name of FIELD_NAMES) {
      const field = definition.fields[name];
      if (!isObject(field)) {
        issues.push(`field ${name} must be an object`);
        continue;
      }
      for (const key of ['type', 'required', 'nullable']) {
        if (!(key in field)) issues.push(`field ${name} is missing ${key}`);
      }
      if (typeof field.required !== 'boolean') issues.push(`field ${name}.required must be boolean`);
      if (typeof field.nullable !== 'boolean') issues.push(`field ${name}.nullable must be boolean`);
    }
    validateObjectField(definition.fields.case, 'case', ['uuid', 'reference_code'], issues);
    validateObjectField(
      definition.fields.advisory,
      'advisory',
      ['uuid', 'code', 'title', 'content', 'status', 'selected_at'],
      issues,
    );
  }

  if (!isObject(definition.versioning)) issues.push('versioning must be an object');
  if (issues.length > 0) throw new NotificationContractArtifactError(source, issues);
  return definition;
}

function validateSyncEnvelope(sync, issues) {
  const expected = ['before', 'version', 'total', 'truncated', 'unchanged'];
  if (!isObject(sync)) {
    issues.push('envelope.sync must declare the version stamp keys');
    return;
  }
  if (!sameList(sync.required_keys, expected)) {
    issues.push(`envelope.sync.required_keys must declare ${expected.join(', ')}`);
  }
  if (sync.version?.unchanged_request !== 'since') issues.push('envelope.sync.version.unchanged_request must be since');
  if (sync.version?.continuation_request !== 'sync_version') {
    issues.push('envelope.sync.version.continuation_request must be sync_version');
  }
}

function validateSelection(selection, issues) {
  if (!isObject(selection)) {
    issues.push('envelope.selection must be an object');
    return;
  }
  if (!sameList(Object.keys(selection), SELECTION_KEYS)) {
    issues.push(`envelope.selection must be ordered as ${SELECTION_KEYS.join(', ')}`);
  }
  if (selection.anchor !== 'sync.before') {
    issues.push('envelope.selection.anchor must be sync.before');
  }
  if (selection.unread !== 'always included') {
    issues.push('envelope.selection.unread must be always included');
  }
  for (const key of Object.keys(SELECTION_CONTROLLER_CONSTANTS)) {
    const value = selection[key];
    if (!Number.isInteger(value) || value <= 0) {
      issues.push(`envelope.selection.${key} must be a positive integer`);
    }
  }
  if (typeof selection.cap_order !== 'string' || selection.cap_order.trim() === '') {
    issues.push('envelope.selection.cap_order must be a non-empty string');
  }
}

/**
 * Compares the declared feed-selection bound against the controller constants
 * that actually enforce it, so the artifact cannot drift from the served window.
 */
export function assertSelectionBoundMatchesController(
  definition,
  controllerSource,
  source = 'controller',
) {
  const issues = [];
  const selection = isObject(definition?.envelope) ? definition.envelope.selection : undefined;
  if (!isObject(selection)) {
    throw new NotificationContractArtifactError(source, [
      'cannot be compared: the artifact declares no envelope.selection object',
    ]);
  }

  for (const [key, constant] of Object.entries(SELECTION_CONTROLLER_CONSTANTS)) {
    const pattern = new RegExp(`const\\s+${constant}\\s*=\\s*(\\d+)\\s*;`);
    const match = pattern.exec(controllerSource);
    if (match === null) {
      issues.push(`does not declare const ${constant}`);
      continue;
    }
    const declared = Number(match[1]);
    if (selection[key] !== declared) {
      issues.push(
        `envelope.selection.${key} is ${selection[key]} but ${constant} is ${declared}`,
      );
    }
  }

  if (issues.length > 0) throw new NotificationContractArtifactError(source, issues);
}

export async function readNotificationControllerSource(controllerPath = DEFAULT_CONTROLLER_PATH) {
  try {
    return await readFile(controllerPath, 'utf8');
  } catch (error) {
    throw new NotificationContractArtifactError(controllerPath, [
      `could not be read: ${error.message}`,
    ]);
  }
}

function validateObjectField(field, name, requiredKeys, issues) {
  if (!isObject(field)) return;
  if (field.type !== 'object') issues.push(`field ${name}.type must be object`);
  if (!sameList(field.required_keys, requiredKeys)) {
    issues.push(`field ${name}.required_keys must declare ${requiredKeys.join(', ')}`);
  }
  if (!isObject(field.properties)) issues.push(`field ${name}.properties must be an object`);
}

function sameList(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function main() {
  const artifactPath = process.argv[2] ?? DEFAULT_ARTIFACT_PATH;
  const controllerPath = process.argv[3] ?? DEFAULT_CONTROLLER_PATH;
  const definition = await readMobileNotificationsArtifact(artifactPath);
  const controllerSource = await readNotificationControllerSource(controllerPath);
  assertSelectionBoundMatchesController(definition, controllerSource, controllerPath);
  console.log(
    `[artifact] PASS ${artifactPath}: ${Object.keys(definition.fields).length} notification fields, owner-scoped envelope and the ${definition.envelope.selection.read_history_days}-day/${definition.envelope.selection.max_rows}-row selection bound match the controller.`,
  );
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    if (error instanceof NotificationContractArtifactError) {
      console.error(error.message);
      for (const issue of error.issues) console.error(`[artifact] - ${issue}`);
    } else {
      console.error(`[artifact] ${error.message}`);
    }
    process.exitCode = 1;
  }
}

export { DEFAULT_ARTIFACT_PATH, DEFAULT_CONTROLLER_PATH, FIELD_NAMES };
