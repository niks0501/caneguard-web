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
  if (JSON.stringify(classScores?.required_keys) !== JSON.stringify(EXPECTED_LABELS)) {
    issues.push('class_scores.required_keys must enumerate all four Model V1 labels');
  }
  if (classScores?.min_properties !== 4 || classScores?.max_properties !== 4) {
    issues.push('class_scores must require exactly four properties');
  }
  if (classScores?.additional_properties !== false) {
    issues.push('class_scores must reject additional properties');
  }
  if (!fields?.symptom_keys?.items?.enum?.includes('smut')) {
    issues.push('symptom_keys must accept the smut observation key');
  }
  if (JSON.stringify(fields?.model_version?.enum) !== JSON.stringify(['v1.0-mobilenetv2'])) {
    issues.push('model_version must be the bundled Model V1 version');
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
