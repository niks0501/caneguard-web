import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ARTIFACT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../docs/contracts/mobile-report-upload-v2.json',
);
const EXPECTED_LABELS = ['healthy', 'mosaic', 'rust', 'smut'];

export class MobileReportUploadV2ArtifactError extends Error {
  constructor(source, issues) {
    super(`[artifact] ${source} is not a valid mobile-report-upload-v2 artifact.`);
    this.name = 'MobileReportUploadV2ArtifactError';
    this.category = 'artifact';
    this.source = source;
    this.issues = issues;
  }
}

export function validateMobileReportUploadV2Artifact(
  definition,
  source = 'artifact',
) {
  const issues = [];
  const fields = definition?.fields;
  const classScores = fields?.class_scores;

  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    issues.push('the JSON root must be an object');
  } else {
    for (const key of ['artifact_format', 'contract', 'version', 'wire', 'fields', 'versioning']) {
      if (!(key in definition)) issues.push(`missing top-level property ${key}`);
    }
  }

  if (definition?.artifact_format !== 'caneguard-multipart-contract') {
    issues.push('artifact_format must be caneguard-multipart-contract');
  }
  if (definition?.contract !== 'mobile-report-upload-v2') {
    issues.push('contract must be mobile-report-upload-v2');
  }
  if (definition?.version !== 2) issues.push('version must be 2');
  if (definition?.wire?.method !== 'POST') issues.push('wire.method must be POST');
  if (definition?.wire?.path !== '/api/v2/mobile/reports') {
    issues.push('wire.path must be /api/v2/mobile/reports');
  }
  if (definition?.wire?.content_type !== 'multipart/form-data') {
    issues.push('wire.content_type must be multipart/form-data');
  }
  if (definition?.wire?.undeclared_fields !== 'ignored') {
    issues.push('wire.undeclared_fields must be ignored');
  }
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    issues.push('fields must be a non-empty object');
  }
  if (JSON.stringify(fields?.predicted_label?.enum) !== JSON.stringify(EXPECTED_LABELS)) {
    issues.push('predicted_label must enumerate all four Model V1 labels');
  }
  const modelKeys = Array.isArray(classScores?.conditions)
    ? classScores.conditions.find((condition) => condition?.rule === 'model_class_keys')
    : undefined;
  if (modelKeys?.field !== 'model_version' || modelKeys?.value !== 'v1.0-mobilenetv2'
    || modelKeys?.additional_properties !== false) {
    issues.push('Model V1 class keys must remain conditional and closed');
  }
  if (JSON.stringify(modelKeys?.required_keys) !== JSON.stringify(EXPECTED_LABELS)) {
    issues.push('class_scores.required_keys must enumerate all four Model V1 labels');
  }
  if (classScores?.min_properties !== 4 || classScores?.max_properties !== undefined) {
    issues.push('class_scores must accept at least four properties');
  }
  if (classScores?.additional_properties !== true
    || classScores?.key_pattern !== '^[a-z][a-z0-9_-]{0,31}$') {
    issues.push('future class keys must be bounded identifiers');
  }
  if (!fields?.symptom_keys?.items?.enum?.includes('smut')) {
    issues.push('symptom_keys must accept the smut observation key');
  }
  if (fields?.model_version?.enum !== undefined || fields?.model_version?.type !== 'string'
    || fields?.model_version?.max_length !== 100 || fields?.model_version?.required !== true
    || JSON.stringify(fields?.model_version?.known_values) !== JSON.stringify(['v1.0-mobilenetv2'])
    || fields?.model_version?.unrecognised_value_policy !== 'persist_as_submitted') {
    issues.push('model_version must preserve bounded, non-empty future versions');
  }

  const authority = definition?.authority;
  const categories = ['client_owned', 'server_derived', 'server_owned_read_only'];
  const names = [];
  const authorityList = (category) => Array.isArray(authority?.[category]) ? authority[category] : [];
  for (const category of categories) {
    if (!Array.isArray(authority?.[category]) || authority[category].length === 0
      || authority[category].some((name) => typeof name !== 'string')) {
      issues.push(`authority.${category} must be a non-empty string list`);
    } else {
      names.push(...authority[category]);
    }
  }
  if (new Set(names).size !== names.length) issues.push('authority categories must not overlap');
  if (authority?.undeclared_field_policy !== 'ignored') issues.push('authority must preserve ignored fields');
  // fields is the write envelope, not the read model. Server fields must never
  // enter it; every accepted input is assigned exactly once to client_owned.
  if (JSON.stringify([...authorityList('client_owned')].sort()) !== JSON.stringify(Object.keys(fields ?? {}).sort())) {
    issues.push('authority.client_owned must partition every declared input');
  }
  for (const name of [...authorityList('server_derived'), ...authorityList('server_owned_read_only')]) {
    if (name in (fields ?? {})) issues.push(`server field ${name} must not be writable`);
  }
  for (const name of ['uuid', 'reference_code', 'reporter_id', 'district_id', 'image_mime_type',
    'image_size_bytes', 'submitted_at', 'created_at', 'updated_at']) {
    if (!authorityList('server_derived').includes(name)) issues.push(`missing server-derived authority ${name}`);
  }
  for (const name of ['review_status', 'review_notes', 'reviewed_at', 'reviewer_id', 'lock_version',
    'case_state', 'verification_outcome', 'field_validation_state', 'referral_state', 'authority_classified_condition']) {
    if (!authorityList('server_owned_read_only').includes(name)) issues.push(`missing read-only authority ${name}`);
  }

  if (issues.length > 0) {
    throw new MobileReportUploadV2ArtifactError(source, issues);
  }

  return definition;
}

export async function readMobileReportUploadV2Artifact(
  sourcePath = DEFAULT_ARTIFACT_PATH,
) {
  let contents;
  try {
    contents = await readFile(sourcePath, 'utf8');
  } catch (error) {
    throw new MobileReportUploadV2ArtifactError(sourcePath, [
      `could not be read: ${error.message}`,
    ]);
  }

  let definition;
  try {
    definition = JSON.parse(contents);
  } catch (error) {
    throw new MobileReportUploadV2ArtifactError(sourcePath, [
      `contains invalid JSON: ${error.message}`,
    ]);
  }

  return validateMobileReportUploadV2Artifact(definition, sourcePath);
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await readMobileReportUploadV2Artifact();
    console.log(`[artifact] PASS ${DEFAULT_ARTIFACT_PATH}`);
  } catch (error) {
    console.error(`${error.message}\n- ${error.issues?.join('\n- ') ?? error.message}`);
    process.exitCode = 1;
  }
}
