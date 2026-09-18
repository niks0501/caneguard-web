import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ARTIFACT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../docs/contracts/mobile-report-status-v3.json',
);
const FIELD_NAMES = [
  'uuid',
  'client_uuid',
  'reference_code',
  'review_status',
  'review_notes',
  'reviewed_at',
  'updated_at',
  'advisory',
];
const ADVISORY_FIELD_NAMES = [
  'uuid',
  'code',
  'title',
  'content',
  'status',
  'selected_at',
  'delivery_state',
  'delivered_at',
  'validated_at',
];

export class MobileReportStatusV3ContractError extends Error {
  constructor(source, issues) {
    super(`[artifact] ${source} is not a valid mobile-report-status-v3 artifact.`);
    this.name = 'MobileReportStatusV3ContractError';
    this.category = 'artifact';
    this.source = source;
    this.issues = issues;
  }
}

export async function readMobileReportStatusV3Artifact(artifactPath = DEFAULT_ARTIFACT_PATH) {
  let contents;
  try {
    contents = await readFile(artifactPath, 'utf8');
  } catch (error) {
    throw new MobileReportStatusV3ContractError(artifactPath, [`could not be read: ${error.message}`]);
  }
  let definition;
  try {
    definition = JSON.parse(contents);
  } catch (error) {
    throw new MobileReportStatusV3ContractError(artifactPath, [`contains invalid JSON: ${error.message}`]);
  }
  return validateMobileReportStatusV3Artifact(definition, artifactPath);
}

export function validateMobileReportStatusV3Artifact(definition, source = 'artifact') {
  const issues = [];
  if (!isObject(definition)) issues.push('the JSON root must be an object');
  for (const key of ['$id', 'artifact_format', 'contract', 'version', 'wire', 'envelope', 'fields', 'versioning']) {
    if (!definition || !(key in definition)) issues.push(`missing top-level property ${key}`);
  }
  if (definition?.artifact_format !== 'caneguard-json-contract') issues.push('artifact_format must be caneguard-json-contract');
  if (definition?.contract !== 'mobile-report-status-v3') issues.push('contract must be mobile-report-status-v3');
  if (definition?.version !== 3) issues.push('version must be numeric v3 (3)');
  if (definition?.wire?.method !== 'GET') issues.push('wire.method must be GET');
  if (definition?.wire?.path !== '/api/v3/mobile/reports/statuses') issues.push('wire.path must be /api/v3/mobile/reports/statuses');
  if (!sameList(definition?.envelope?.required_keys, ['data', 'links', 'meta', 'sync'])) issues.push('envelope.required_keys must declare data, links, meta, sync');
  if (definition?.envelope?.checkpoint !== 'sync.before') issues.push('envelope.checkpoint must be sync.before');

  const fields = definition?.fields;
  if (!isObject(fields)) {
    issues.push('fields must be an object');
  } else {
    if (!sameList(Object.keys(fields), FIELD_NAMES)) issues.push(`fields must be ordered as ${FIELD_NAMES.join(', ')}`);
    for (const name of FIELD_NAMES) validateField(fields[name], name, issues);
    const advisory = fields.advisory;
    if (advisory?.type !== 'object') issues.push('field advisory.type must be object');
    if (advisory?.nullable !== true) issues.push('field advisory.nullable must be true');
    if (!sameList(advisory?.required_keys, ADVISORY_FIELD_NAMES)) issues.push(`advisory.required_keys must be ${ADVISORY_FIELD_NAMES.join(', ')}`);
    if (!isObject(advisory?.properties)) issues.push('advisory.properties must be an object');
    for (const name of ADVISORY_FIELD_NAMES) validateField(advisory?.properties?.[name], `advisory.${name}`, issues);
  }
  if (issues.length > 0) throw new MobileReportStatusV3ContractError(source, issues);
  return definition;
}

function validateField(field, name, issues) {
  if (!isObject(field)) {
    issues.push(`field ${name} must be an object`);
    return;
  }
  for (const key of ['type', 'required', 'nullable']) {
    if (!(key in field)) issues.push(`field ${name} is missing ${key}`);
  }
  if (typeof field.required !== 'boolean') issues.push(`field ${name}.required must be boolean`);
  if (typeof field.nullable !== 'boolean') issues.push(`field ${name}.nullable must be boolean`);
}

function sameList(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function main() {
  const artifactPath = process.argv[2] ?? DEFAULT_ARTIFACT_PATH;
  const definition = await readMobileReportStatusV3Artifact(artifactPath);
  console.log(`[artifact] PASS ${artifactPath}: ${Object.keys(definition.fields).length} v3 status fields and advisory payload are structurally valid.`);
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    if (error instanceof MobileReportStatusV3ContractError) {
      console.error(error.message);
      for (const issue of error.issues) console.error(`[artifact] - ${issue}`);
    } else {
      console.error(`[artifact] ${error.message}`);
    }
    process.exitCode = 1;
  }
}

export { DEFAULT_ARTIFACT_PATH, FIELD_NAMES, ADVISORY_FIELD_NAMES };
