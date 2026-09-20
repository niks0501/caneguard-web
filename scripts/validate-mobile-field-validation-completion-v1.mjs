import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ARTIFACT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../docs/contracts/mobile-field-validation-completion-v1.json',
);
const FIELD_NAMES = [
  'client_uuid',
  'field_observation',
  'field_finding',
  'action_taken',
  'follow_up_outcome',
  'visited_at',
  'gps_outcome',
  'gps_attempted_at',
  'gps_latitude',
  'gps_longitude',
  'gps_accuracy',
  'fresh_photo',
];

export class CompletionContractArtifactError extends Error {
  constructor(source, issues) {
    super(`[artifact] ${source} is not a valid mobile-field-validation-completion-v1 artifact.`);
    this.name = 'CompletionContractArtifactError';
    this.category = 'artifact';
    this.source = source;
    this.issues = issues;
  }
}

export async function readMobileFieldValidationCompletionArtifact(artifactPath = DEFAULT_ARTIFACT_PATH) {
  let contents;
  try {
    contents = await readFile(artifactPath, 'utf8');
  } catch (error) {
    throw new CompletionContractArtifactError(artifactPath, [`could not be read: ${error.message}`]);
  }
  let definition;
  try {
    definition = JSON.parse(contents);
  } catch (error) {
    throw new CompletionContractArtifactError(artifactPath, [`contains invalid JSON: ${error.message}`]);
  }
  return validateMobileFieldValidationCompletionArtifact(definition, artifactPath);
}

export function validateMobileFieldValidationCompletionArtifact(definition, source = 'artifact') {
  const issues = [];
  if (!isObject(definition)) throw new CompletionContractArtifactError(source, ['the JSON root must be an object']);
  for (const key of ['artifact_format', 'contract', 'version', 'status', 'owner', 'wire', 'authentication', 'fields', 'response', 'versioning']) {
    if (!(key in definition)) issues.push(`missing top-level property ${key}`);
  }
  if (definition.artifact_format !== 'caneguard-multipart-contract') issues.push('artifact_format must be caneguard-multipart-contract');
  if (definition.contract !== 'mobile-field-validation-completion-v1') issues.push('contract must be mobile-field-validation-completion-v1');
  if (definition.version !== 1) issues.push('version must be numeric v1 (1)');
  const wire = definition.wire;
  if (!isObject(wire)) {
    issues.push('wire must be an object');
  } else {
    if (wire.method !== 'POST') issues.push('wire.method must be POST');
    if (wire.path !== '/api/v1/mobile/assignments/{assignment}/completion') issues.push('wire.path is invalid');
    if (wire.content_type !== 'multipart/form-data') issues.push('wire.content_type must be multipart/form-data');
    if (wire.undeclared_fields !== 'ignored') issues.push('wire.undeclared_fields must be ignored');
  }
  if (!isObject(definition.fields)) {
    issues.push('fields must be an object');
  } else {
    if (!sameList(Object.keys(definition.fields), FIELD_NAMES)) issues.push(`fields must be ordered as ${FIELD_NAMES.join(', ')}`);
    for (const name of FIELD_NAMES) {
      const field = definition.fields[name];
      if (!isObject(field)) {
        issues.push(`field ${name} must be an object`);
        continue;
      }
      for (const key of ['wire_type', 'type', 'required', 'nullable']) {
        if (!(key in field)) issues.push(`field ${name} is missing ${key}`);
      }
    }
    if (definition.fields.client_uuid?.required !== true) issues.push('client_uuid must be required');
    for (const name of ['field_observation', 'field_finding', 'action_taken']) {
      if (definition.fields[name]?.required !== true) issues.push(`${name} must be required`);
    }
    if (definition.fields.follow_up_outcome?.required !== false) issues.push('follow_up_outcome must remain optional');
    if (definition.fields.follow_up_outcome?.nullable !== true) issues.push('follow_up_outcome must remain nullable');
    if (JSON.stringify(definition.fields.follow_up_outcome?.enum) !== JSON.stringify(['improved', 'unchanged', 'worsened', 'unable_to_determine'])) {
      issues.push('follow_up_outcome must declare the stable four-value enum');
    }
    if (definition.fields.fresh_photo?.required !== false) issues.push('fresh_photo must remain optional');
  }
  if (issues.length) throw new CompletionContractArtifactError(source, issues);
  return definition;
}

function sameList(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function main() {
  const artifactPath = process.argv[2] ?? DEFAULT_ARTIFACT_PATH;
  const definition = await readMobileFieldValidationCompletionArtifact(artifactPath);
  console.log(`[artifact] PASS ${artifactPath}: ${Object.keys(definition.fields).length} completion fields are structurally valid.`);
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    if (error instanceof CompletionContractArtifactError) {
      console.error(error.message);
      for (const issue of error.issues) console.error(`[artifact] - ${issue}`);
    } else {
      console.error(`[artifact] ${error.message}`);
    }
    process.exitCode = 1;
  }
}

export { DEFAULT_ARTIFACT_PATH, FIELD_NAMES };
