import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ARTIFACT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../docs/contracts/report-lifecycle-v1.json',
);

const DIMENSION_NAMES = [
  'case_state',
  'verification_outcome',
  'field_validation_state',
  'referral_state',
];
const DIMENSION_VALUES = {
  case_state: ['open', 'closed'],
  verification_outcome: ['not_determined', 'verified', 'unable_to_verify'],
  field_validation_state: ['unassigned', 'assigned', 'in_progress', 'completed'],
  referral_state: ['not_referred', 'referred', 'expert_response_received'],
};
const LEGACY_STATUSES = [
  'submitted_unverified',
  'for_field_validation',
  'verified_by_staff',
  'unable_to_verify',
  'resolved',
  'unknown',
];
const PAYLOAD_CONTRACTS = [
  'mobile-report-upload-v1',
  'mobile-field-validation-assignment-v1',
  'mobile-field-validation-completion-v1',
  'mobile-notifications-v1',
];
const REQUIRED_RULES = [
  'verification_does_not_close_case',
  'field_validation_completion_does_not_verify_or_close',
  'referral_is_not_verification_outcome',
  'field_reporter_can_complete_assignment',
  'field_reporter_can_close_case',
  'completed_validation_cannot_be_reassigned_or_removed',
  'final_disposition_roles',
  'ai_evidence_role',
];

export class LifecycleContractArtifactError extends Error {
  constructor(source, issues) {
    super(`[artifact] ${source} is not a valid report-lifecycle-v1 artifact.`);
    this.name = 'LifecycleContractArtifactError';
    this.category = 'artifact';
    this.source = source;
    this.issues = issues;
  }
}

export async function readReportLifecycleArtifact(artifactPath = DEFAULT_ARTIFACT_PATH) {
  let contents;
  try {
    contents = await readFile(artifactPath, 'utf8');
  } catch (error) {
    throw new LifecycleContractArtifactError(artifactPath, [
      `could not be read: ${error.message}`,
    ]);
  }

  let definition;
  try {
    definition = JSON.parse(contents);
  } catch (error) {
    throw new LifecycleContractArtifactError(artifactPath, [
      `contains invalid JSON: ${error.message}`,
    ]);
  }

  return validateReportLifecycleArtifact(definition, artifactPath);
}

export function validateReportLifecycleArtifact(definition, source = 'artifact') {
  const issues = [];
  if (!isObject(definition)) {
    throw new LifecycleContractArtifactError(source, ['the JSON root must be an object']);
  }

  for (const key of [
    '$id',
    'artifact_format',
    'contract',
    'version',
    'status',
    'owner',
    'dimensions',
    'legacy_projection',
    'rules',
    'payload_contracts',
    'versioning',
  ]) {
    if (!(key in definition)) issues.push(`missing top-level property ${key}`);
  }
  if (definition.artifact_format !== 'caneguard-lifecycle-contract') {
    issues.push('artifact_format must be caneguard-lifecycle-contract');
  }
  if (definition.contract !== 'report-lifecycle-v1') {
    issues.push('contract must be report-lifecycle-v1');
  }
  if (definition.version !== 1) issues.push('version must be numeric v1 (1)');
  if (definition.status !== 'stable') issues.push('status must be stable');

  if (!isObject(definition.dimensions)) {
    issues.push('dimensions must be an object');
  } else {
    if (!sameList(Object.keys(definition.dimensions), DIMENSION_NAMES)) {
      issues.push(`dimensions must be ordered as ${DIMENSION_NAMES.join(', ')}`);
    }
    for (const name of DIMENSION_NAMES) {
      const dimension = definition.dimensions[name];
      if (!isObject(dimension)) {
        issues.push(`dimension ${name} must be an object`);
        continue;
      }
      if (!containsRequiredStates(dimension.values, DIMENSION_VALUES[name])) {
        issues.push(`dimension ${name}.values must preserve ${DIMENSION_VALUES[name].join(', ')}`);
      }
      if (typeof dimension.authority !== 'string' || !dimension.authority) {
        issues.push(`dimension ${name}.authority must be a non-empty string`);
      }
      if (typeof dimension.description !== 'string' || !dimension.description) {
        issues.push(`dimension ${name}.description must be a non-empty string`);
      }
    }
  }

  if (!isObject(definition.legacy_projection)) {
    issues.push('legacy_projection must be an object');
  } else {
    if (!sameList(Object.keys(definition.legacy_projection), LEGACY_STATUSES)) {
      issues.push(`legacy_projection must be ordered as ${LEGACY_STATUSES.join(', ')}`);
    }
    for (const status of LEGACY_STATUSES) {
      const projection = definition.legacy_projection[status];
      if (!isObject(projection)) {
        issues.push(`legacy_projection.${status} must be an object`);
        continue;
      }
      for (const dimension of DIMENSION_NAMES) {
        if (!(dimension in projection)) {
          issues.push(`legacy_projection.${status} is missing ${dimension}`);
        } else if (!definition.dimensions?.[dimension]?.values?.includes(projection[dimension])) {
          issues.push(`legacy_projection.${status}.${dimension} is not a valid state`);
        }
      }
    }
  }

  if (!isObject(definition.rules)) {
    issues.push('rules must be an object');
  } else {
    for (const rule of REQUIRED_RULES) {
      if (!(rule in definition.rules)) issues.push(`rules is missing ${rule}`);
    }
    for (const rule of [
      'verification_does_not_close_case',
      'field_validation_completion_does_not_verify_or_close',
      'referral_is_not_verification_outcome',
      'field_reporter_can_complete_assignment',
      'field_reporter_can_close_case',
      'completed_validation_cannot_be_reassigned_or_removed',
    ]) {
      if (typeof definition.rules[rule] !== 'boolean') {
        issues.push(`rules.${rule} must be boolean`);
      }
    }
    if (!sameList(definition.rules.final_disposition_roles, ['reviewer', 'admin'])) {
      issues.push('rules.final_disposition_roles must be reviewer, admin');
    }
    if (definition.rules.ai_evidence_role !== 'decision_support_only') {
      issues.push('rules.ai_evidence_role must be decision_support_only');
    }
  }

  if (!sameList(definition.payload_contracts, PAYLOAD_CONTRACTS)) {
    issues.push(`payload_contracts must be ordered as ${PAYLOAD_CONTRACTS.join(', ')}`);
  }
  if (!isObject(definition.versioning)) issues.push('versioning must be an object');

  if (issues.length > 0) {
    throw new LifecycleContractArtifactError(source, issues);
  }
  return definition;
}

function sameList(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function containsRequiredStates(actual, required) {
  if (
    !Array.isArray(actual)
    || actual.some((value) => typeof value !== 'string')
    || new Set(actual).size !== actual.length
  ) return false;
  let cursor = 0;
  for (const value of required) {
    const index = actual.indexOf(value, cursor);
    if (index === -1) return false;
    cursor = index + 1;
  }
  return true;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function main() {
  const artifactPath = process.argv[2] ?? DEFAULT_ARTIFACT_PATH;
  const definition = await readReportLifecycleArtifact(artifactPath);
  console.log(
    `[artifact] PASS ${artifactPath}: ${Object.keys(definition.dimensions).length} lifecycle dimensions and ${definition.payload_contracts.length} payload contracts are structurally valid.`,
  );
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    if (error instanceof LifecycleContractArtifactError) {
      console.error(error.message);
      for (const issue of error.issues) console.error(`[artifact] - ${issue}`);
    } else {
      console.error(`[artifact] ${error.message}`);
    }
    process.exitCode = 1;
  }
}

export {
  DEFAULT_ARTIFACT_PATH,
  DIMENSION_NAMES,
  DIMENSION_VALUES,
  LEGACY_STATUSES,
  PAYLOAD_CONTRACTS,
};
