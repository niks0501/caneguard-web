import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DEFAULT_ARTIFACT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../docs/contracts/mobile-field-validation-assignment-v1.json',
);
const V2_ARTIFACT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../docs/contracts/mobile-field-validation-assignment-v2.json',
);
// v1 is frozen with non-null AI fields; v2 widens them (a nullability change
// is new_major_required) and declares the office projection.
const CONTRACT_VERSIONS = { 'mobile-field-validation-assignment-v1': 1, 'mobile-field-validation-assignment-v2': 2 };
const OFFICE_CASE_FIELDS = {
  origin: { type: 'string' },
  version: { type: 'number' },
  status: { required_keys: ['workflow_status', 'case_state', 'review_status', 'updated_at'] },
  reporter_concern: { required_keys: ['suspected_condition', 'observation_text'] },
  photo: { required_keys: ['url', 'content_type', 'bytes'] },
};
const AI_CASE_FIELDS = { predicted_label: 'string', confidence: 'number' };
// The artifact declares the bounded-download cap; the controller constant is
// its runtime source of truth, so both are compared instead of hand-copied.
const DEFAULT_CONTROLLER_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../api/app/Http/Controllers/Api/V1/MobileFieldValidationAssignmentController.php',
);
const SYNC_ENVELOPE_KEYS = ['required_keys', 'version', 'cap', 'bounded_continuation'];
const SYNC_KEYS = ['before', 'version', 'total', 'truncated', 'unchanged'];
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
const ITEM_FIELDS = [
  'uuid',
  'report_uuid',
  'report_client_uuid',
  'reference_code',
  'submitter',
  'assignee',
  'submitter_is_assignee',
  'target_visit_date',
  'field_validation_state',
  'assigned_at',
  'updated_at',
  'case',
  'previous_visit',
];

export class AssignmentContractArtifactError extends Error {
  constructor(source, issues, contract = 'mobile-field-validation-assignment-v1') {
    super(`[artifact] ${source} is not a valid ${contract} artifact.`);
    this.name = 'AssignmentContractArtifactError';
    this.category = 'artifact';
    this.source = source;
    this.issues = issues;
  }
}

export async function readMobileFieldValidationAssignmentArtifact(
  artifactPath = DEFAULT_ARTIFACT_PATH,
) {
  let contents;
  try {
    contents = await readFile(artifactPath, 'utf8');
  } catch (error) {
    throw new AssignmentContractArtifactError(artifactPath, [
      `could not be read: ${error.message}`,
    ]);
  }

  let definition;
  try {
    definition = JSON.parse(contents);
  } catch (error) {
    throw new AssignmentContractArtifactError(artifactPath, [
      `contains invalid JSON: ${error.message}`,
    ]);
  }

  const validated = validateMobileFieldValidationAssignmentArtifact(definition, artifactPath);
  assertAssignmentSyncSurface(validated, artifactPath);

  return validated;
}

export function validateMobileFieldValidationAssignmentArtifact(definition, source = 'artifact') {
  const issues = [];
  if (!isObject(definition)) {
    throw new AssignmentContractArtifactError(source, ['the JSON root must be an object']);
  }

  for (const key of TOP_LEVEL_KEYS) {
    if (!(key in definition)) issues.push(`missing top-level property ${key}`);
  }
  if (definition.artifact_format !== 'caneguard-json-contract') {
    issues.push('artifact_format must be caneguard-json-contract');
  }
  const expectedVersion = CONTRACT_VERSIONS[definition.contract];
  if (expectedVersion === undefined) {
    issues.push('contract must be mobile-field-validation-assignment-v1 or -v2');
  } else if (definition.version !== expectedVersion) {
    issues.push(`version must be numeric v${expectedVersion} (${expectedVersion}) for ${definition.contract}`);
  }

  const wire = definition.wire;
  if (!isObject(wire)) {
    issues.push('wire must be an object');
  } else {
    if (wire.method !== 'GET') issues.push('wire.method must be GET');
    if (wire.path !== '/api/v1/mobile/assignments') {
      issues.push('wire.path must be /api/v1/mobile/assignments');
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
  }

  if (!isObject(definition.fields)) {
    issues.push('fields must be an object');
  } else {
    if (!sameList(Object.keys(definition.fields), ITEM_FIELDS)) {
      issues.push(`fields must be ordered as ${ITEM_FIELDS.join(', ')}`);
    }
    for (const name of ITEM_FIELDS) {
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
    validateObjectField(definition.fields.submitter, 'submitter', ['uuid', 'name'], issues);
    validateObjectField(definition.fields.assignee, 'assignee', ['uuid', 'name'], issues);
    validateObjectField(definition.fields.case, 'case', [
      'barangay',
      'province',
      'municipality',
      'farmer_or_farm_owner_name',
      'affected_area_hectares',
      'affected_portion_percent',
      'captured_at',
      'observed_at',
      'submitted_at',
      'predicted_label',
      'confidence',
    ], issues);
    validateCaseNullability(definition, issues);
    validateObjectField(definition.fields.previous_visit, 'previous_visit', [
      'reference_code',
      'visited_at',
      'reporter_suspected_condition',
      'authority_classified_condition',
      'action_taken',
      'field_observation',
      'field_finding',
      'follow_up_outcome',
      'fresh_photo_available',
    ], issues);
  }

  if (!isObject(definition.versioning)) issues.push('versioning must be an object');
  if (issues.length) {
    throw new AssignmentContractArtifactError(
      source,
      issues,
      definition.contract in CONTRACT_VERSIONS ? definition.contract : undefined,
    );
  }
  return definition;
}

function validateCaseNullability(definition, issues) {
  const properties = definition.fields.case?.properties;
  if (!isObject(properties)) return;
  const wantNullable = definition.version === 2;
  for (const [name, expectedType] of Object.entries(AI_CASE_FIELDS)) {
    const field = properties[name];
    if (!isObject(field)) {
      issues.push(`case.${name} must be declared as a property in v${definition.version}`);
      continue;
    }
    if (field.type !== expectedType) issues.push(`case.${name}.type must be ${expectedType}`);
    if (field.required !== true) {
      issues.push(`case.${name}.required must be true in v${definition.version}`);
    }
    if (field.nullable !== wantNullable) {
      issues.push(`case.${name}.nullable must be ${wantNullable} in v${definition.version}`);
    }
  }
  if (definition.version !== 2) return;
  for (const [name, spec] of Object.entries(OFFICE_CASE_FIELDS)) {
    const field = properties[name];
    if (!isObject(field) || field.required !== false) {
      issues.push(`case.${name} must be declared as an optional office field in v2`);
      continue;
    }
    if (!spec.required_keys) {
      if (field.type !== spec.type) issues.push(`case.${name}.type must be ${spec.type}`);
      continue;
    }
    validateObjectField(field, `case.${name}`, spec.required_keys, issues);
    const nested = isObject(field.properties) ? field.properties : {};
    for (const key of spec.required_keys) {
      if (!isObject(nested[key])) {
        issues.push(`case.${name}.${key} must be declared as a property`);
      }
    }
  }
}

/**
 * The prose contract makes snapshot consistency depend on more than the
 * `sync.before` checkpoint, so the artifact must declare that surface too.
 */
export function assertAssignmentSyncSurface(definition, source = 'artifact') {
  const issues = [];
  const envelope = isObject(definition?.envelope) ? definition.envelope : undefined;
  const sync = isObject(envelope?.sync) ? envelope.sync : undefined;
  if (!isObject(sync)) {
    throw new AssignmentContractArtifactError(source, [
      'envelope.sync must describe the version, cap and bounded-continuation surface',
    ]);
  }

  if (!sameList(Object.keys(sync), SYNC_ENVELOPE_KEYS)) {
    issues.push(`envelope.sync must be ordered as ${SYNC_ENVELOPE_KEYS.join(', ')}`);
  }
  if (!sameList(sync.required_keys, SYNC_KEYS)) {
    issues.push(`envelope.sync.required_keys must declare ${SYNC_KEYS.join(', ')}`);
  }

  const version = sync.version;
  if (!isObject(version)) {
    issues.push('envelope.sync.version must be an object');
  } else {
    if (!isNonEmptyStringList(version.changes_on)) {
      issues.push('envelope.sync.version.changes_on must list the changes that move the version');
    }
    if (!isNonEmptyString(version.ignores)) {
      issues.push('envelope.sync.version.ignores must name the data the version does not track');
    }
    if (version.unchanged_request !== 'since') {
      issues.push('envelope.sync.version.unchanged_request must be since');
    }
  }

  const cap = sync.cap;
  if (!isObject(cap)) {
    issues.push('envelope.sync.cap must be an object');
  } else {
    if (cap.request_parameter !== 'limit') {
      issues.push('envelope.sync.cap.request_parameter must be limit');
    }
    if (!Number.isInteger(cap.limit_max) || cap.limit_max <= 0) {
      issues.push('envelope.sync.cap.limit_max must be a positive integer');
    }
    if (cap.total_flag !== 'sync.total') {
      issues.push('envelope.sync.cap.total_flag must be sync.total');
    }
    if (cap.truncated_flag !== 'sync.truncated') {
      issues.push('envelope.sync.cap.truncated_flag must be sync.truncated');
    }
    if (!isNonEmptyString(cap.without_limit)) {
      issues.push('envelope.sync.cap.without_limit must state what an unbounded request receives');
    }
    if (!isNonEmptyStringList(cap.keep_order)) {
      issues.push('envelope.sync.cap.keep_order must list the priority the cap keeps');
    }
  }

  const continuation = sync.bounded_continuation;
  if (!isObject(continuation)) {
    issues.push('envelope.sync.bounded_continuation must be an object');
  } else {
    if (continuation.link_parameter !== 'sync_version') {
      issues.push('envelope.sync.bounded_continuation.link_parameter must be sync_version');
    }
    if (continuation.request_parameter !== 'sync_version') {
      issues.push('envelope.sync.bounded_continuation.request_parameter must be sync_version');
    }
    const restart = continuation.restart;
    if (!isObject(restart)) {
      issues.push('envelope.sync.bounded_continuation.restart must be an object');
    } else {
      if (restart.status !== 409) {
        issues.push('envelope.sync.bounded_continuation.restart.status must be 409');
      }
      if (restart.code !== 'SYNC_RESTART') {
        issues.push('envelope.sync.bounded_continuation.restart.code must be SYNC_RESTART');
      }
    }
  }

  if (issues.length) throw new AssignmentContractArtifactError(source, issues);
}

/**
 * Compares the declared download cap against the controller constant that
 * enforces it, so the artifact cannot drift from the served cap.
 */
export function assertWorkSetCapMatchesController(
  definition,
  controllerSource,
  source = 'controller',
) {
  const cap = isObject(definition?.envelope?.sync) ? definition.envelope.sync.cap : undefined;
  if (!isObject(cap)) {
    throw new AssignmentContractArtifactError(source, [
      'cannot be compared: the artifact declares no envelope.sync.cap object',
    ]);
  }

  const match = /const\s+WORK_SET_CAP\s*=\s*(\d+)\s*;/.exec(controllerSource);
  if (match === null) {
    throw new AssignmentContractArtifactError(source, ['does not declare const WORK_SET_CAP']);
  }
  const declared = Number(match[1]);
  if (cap.limit_max !== declared) {
    throw new AssignmentContractArtifactError(source, [
      `envelope.sync.cap.limit_max is ${cap.limit_max} but WORK_SET_CAP is ${declared}`,
    ]);
  }
}

export async function readAssignmentControllerSource(controllerPath = DEFAULT_CONTROLLER_PATH) {
  try {
    return await readFile(controllerPath, 'utf8');
  } catch (error) {
    throw new AssignmentContractArtifactError(controllerPath, [
      `could not be read: ${error.message}`,
    ]);
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isNonEmptyStringList(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
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
  return Array.isArray(actual) && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function main() {
  const artifactPaths = process.argv[2] ? [process.argv[2]] : [DEFAULT_ARTIFACT_PATH, V2_ARTIFACT_PATH];
  const controllerPath = process.argv[3] ?? DEFAULT_CONTROLLER_PATH;
  const controllerSource = await readAssignmentControllerSource(controllerPath);
  for (const artifactPath of artifactPaths) {
    const definition = await readMobileFieldValidationAssignmentArtifact(artifactPath);
    assertWorkSetCapMatchesController(definition, controllerSource, controllerPath);
    console.log(`[artifact] PASS ${artifactPath}: ${Object.keys(definition.fields).length} assignment fields, owner-scoped envelope and the version/${definition.envelope.sync.cap.limit_max}-row cap surface match the controller.`);
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    if (error instanceof AssignmentContractArtifactError) {
      console.error(error.message);
      for (const issue of error.issues) console.error(`[artifact] - ${issue}`);
    } else {
      console.error(`[artifact] ${error.message}`);
    }
    process.exitCode = 1;
  }
}

export { V2_ARTIFACT_PATH, DEFAULT_ARTIFACT_PATH, DEFAULT_CONTROLLER_PATH, ITEM_FIELDS, SYNC_KEYS };
