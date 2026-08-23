import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DEFAULT_ARTIFACT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../docs/contracts/mobile-report-upload-v1.json',
);

const TOP_LEVEL_KEYS = [
  'artifact_format',
  'contract',
  'version',
  'wire',
  'fields',
  'versioning',
];
const FIELD_TYPES = new Set([
  'array',
  'boolean',
  'date-time',
  'image',
  'integer',
  'number',
  'object',
  'string',
  'uuid',
]);
const WIRE_TYPES = new Set([
  'file',
  'nested-object',
  'repeated-text',
  'text',
]);
const CONDITION_RULES = new Set([
  'prohibited_unless',
  'required_if',
  'required_with',
]);

export class ContractArtifactValidationError extends Error {
  constructor(source, issues) {
    super(`[artifact] ${source} is not a valid mobile-report-upload-v1 artifact.`);
    this.name = 'ContractArtifactValidationError';
    this.category = 'artifact';
    this.source = source;
    this.issues = issues;
  }
}

export function validateMobileReportUploadArtifact(definition, source = 'artifact') {
  const issues = [];

  if (!isObject(definition)) {
    throw new ContractArtifactValidationError(source, [
      'the JSON root must be an object',
    ]);
  }

  for (const key of TOP_LEVEL_KEYS) {
    if (!(key in definition)) {
      issues.push(`missing top-level property ${key}`);
    }
  }

  if (definition.artifact_format !== 'caneguard-multipart-contract') {
    issues.push('artifact_format must be caneguard-multipart-contract');
  }
  if (definition.contract !== 'mobile-report-upload-v1') {
    issues.push('contract must be mobile-report-upload-v1');
  }
  if (definition.version !== 1) {
    issues.push('version must be numeric v1 (1)');
  }

  validateWire(definition.wire, issues);
  validateFields(definition.fields, issues);
  validateVersioning(definition.versioning, issues);

  if (issues.length > 0) {
    throw new ContractArtifactValidationError(source, issues);
  }

  return definition;
}

export async function readMobileReportUploadArtifact(
  artifactPath = DEFAULT_ARTIFACT_PATH,
) {
  let contents;

  try {
    contents = await readFile(artifactPath, 'utf8');
  } catch (error) {
    throw new ContractArtifactValidationError(artifactPath, [
      `could not be read: ${error.message}`,
    ]);
  }

  let definition;
  try {
    definition = JSON.parse(contents);
  } catch (error) {
    throw new ContractArtifactValidationError(artifactPath, [
      `contains invalid JSON: ${error.message}`,
    ]);
  }

  return validateMobileReportUploadArtifact(definition, artifactPath);
}

function validateWire(wire, issues) {
  if (!isObject(wire)) {
    issues.push('wire must be an object');
    return;
  }

  if (wire.method !== 'POST') issues.push('wire.method must be POST');
  if (wire.path !== '/api/v1/mobile/reports') {
    issues.push('wire.path must be /api/v1/mobile/reports');
  }
  if (wire.content_type !== 'multipart/form-data') {
    issues.push('wire.content_type must be multipart/form-data');
  }
  if (wire.undeclared_fields !== 'ignored') {
    issues.push('wire.undeclared_fields must be ignored');
  }
}

function validateFields(fields, issues) {
  if (!isObject(fields) || Object.keys(fields).length === 0) {
    issues.push('fields must be a non-empty object');
    return;
  }

  for (const [name, field] of Object.entries(fields)) {
    const prefix = `field ${name}`;

    if (!isObject(field)) {
      issues.push(`${prefix} must be an object`);
      continue;
    }

    for (const key of ['wire_type', 'type', 'required', 'nullable']) {
      if (!(key in field)) issues.push(`${prefix} is missing ${key}`);
    }

    if (typeof field.wire_type !== 'string' || !WIRE_TYPES.has(field.wire_type)) {
      issues.push(`${prefix}.wire_type is unsupported`);
    }
    if (typeof field.type !== 'string' || !FIELD_TYPES.has(field.type)) {
      issues.push(`${prefix}.type is unsupported`);
    }
    if (typeof field.required !== 'boolean') {
      issues.push(`${prefix}.required must be boolean`);
    }
    if (typeof field.nullable !== 'boolean') {
      issues.push(`${prefix}.nullable must be boolean`);
    }

    if (field.wire_name_template !== undefined
      && typeof field.wire_name_template !== 'string') {
      issues.push(`${prefix}.wire_name_template must be a string`);
    }

    validateScalarRules(field, prefix, issues);
    validateCollectionRules(field, prefix, issues);
    validateConditions(field.conditions, prefix, issues);

    if (field.wire_type === 'file' && field.type !== 'image') {
      issues.push(`${prefix} file wire type must use image type`);
    }
    if (field.wire_type === 'nested-object' && field.type !== 'object') {
      issues.push(`${prefix} nested-object wire type must use object type`);
    }
    if (field.wire_type === 'repeated-text' && field.type !== 'array') {
      issues.push(`${prefix} repeated-text wire type must use array type`);
    }

    if (field.items !== undefined) {
      if (!isObject(field.items)) {
        issues.push(`${prefix}.items must be an object`);
      } else {
        validateScalarRules(field.items, `${prefix}.items`, issues);
      }
    }
    if (field.values !== undefined) {
      if (!isObject(field.values)) {
        issues.push(`${prefix}.values must be an object`);
      } else {
        validateScalarRules(field.values, `${prefix}.values`, issues);
      }
    }

    if (field.required_keys !== undefined) {
      validateStringList(field.required_keys, `${prefix}.required_keys`, issues);
    }
    if (field.additional_properties !== undefined
      && typeof field.additional_properties !== 'boolean') {
      issues.push(`${prefix}.additional_properties must be boolean`);
    }

    if (field.wire_type === 'file') {
      validateImage(field, prefix, issues);
    }
  }
}

function validateScalarRules(definition, prefix, issues) {
  if (definition.enum !== undefined) {
    validateStringList(definition.enum, `${prefix}.enum`, issues);
  }

  if (definition.accepted_wire_values !== undefined
    && (!Array.isArray(definition.accepted_wire_values)
      || definition.accepted_wire_values.length === 0)) {
    issues.push(`${prefix}.accepted_wire_values must be a non-empty array`);
  }

  for (const key of [
    'max_length',
    'min_items',
    'max_items',
    'min_properties',
    'max_properties',
  ]) {
    if (definition[key] !== undefined
      && (!Number.isInteger(definition[key]) || definition[key] < 0)) {
      issues.push(`${prefix}.${key} must be a non-negative integer`);
    }
  }

  for (const key of ['minimum', 'maximum', 'exclusive_minimum']) {
    if (definition[key] !== undefined
      && (!isFiniteNumber(definition[key]))) {
      issues.push(`${prefix}.${key} must be a finite number`);
    }
  }

  if (definition.minimum !== undefined
    && definition.maximum !== undefined
    && definition.minimum > definition.maximum) {
    issues.push(`${prefix}.minimum cannot exceed maximum`);
  }
  if (definition.min_items !== undefined
    && definition.max_items !== undefined
    && definition.min_items > definition.max_items) {
    issues.push(`${prefix}.min_items cannot exceed max_items`);
  }
  if (definition.min_properties !== undefined
    && definition.max_properties !== undefined
    && definition.min_properties > definition.max_properties) {
    issues.push(`${prefix}.min_properties cannot exceed max_properties`);
  }
}

function validateCollectionRules(definition, prefix, issues) {
  if (definition.type === 'array' && definition.items === undefined
    && definition.wire_type !== 'nested-object') {
    issues.push(`${prefix} array fields must declare items`);
  }
  if (definition.type === 'object' && definition.values === undefined) {
    issues.push(`${prefix} object fields must declare values`);
  }
}

function validateConditions(conditions, prefix, issues) {
  if (conditions === undefined) return;
  if (!Array.isArray(conditions)) {
    issues.push(`${prefix}.conditions must be an array`);
    return;
  }

  for (const [index, condition] of conditions.entries()) {
    if (!isObject(condition)) {
      issues.push(`${prefix}.conditions[${index}] must be an object`);
      continue;
    }
    if (!CONDITION_RULES.has(condition.rule)) {
      issues.push(`${prefix}.conditions[${index}].rule is unsupported`);
    }
    if (condition.rule === 'required_with'
      && (!Array.isArray(condition.fields) || condition.fields.length === 0)) {
      issues.push(`${prefix}.conditions[${index}] required_with needs fields`);
    }
    if ((condition.rule === 'required_if' || condition.rule === 'prohibited_unless')
      && (typeof condition.field !== 'string' || typeof condition.value !== 'string')) {
      issues.push(`${prefix}.conditions[${index}] needs a field and string value`);
    }
  }
}

function validateImage(field, prefix, issues) {
  if (!Array.isArray(field.formats) || field.formats.length === 0) {
    issues.push(`${prefix}.formats must be a non-empty array`);
  } else {
    for (const [index, format] of field.formats.entries()) {
      if (!isObject(format)) {
        issues.push(`${prefix}.formats[${index}] must be an object`);
        continue;
      }
      validateStringList(
        format.extensions,
        `${prefix}.formats[${index}].extensions`,
        issues,
      );
      validateStringList(
        format.mime_types,
        `${prefix}.formats[${index}].mime_types`,
        issues,
      );
    }
  }

  if (!Number.isInteger(field.max_bytes) || field.max_bytes <= 0) {
    issues.push(`${prefix}.max_bytes must be a positive integer`);
  }
}

function validateVersioning(versioning, issues) {
  if (!isObject(versioning)) {
    issues.push('versioning must be an object');
    return;
  }

  for (const key of ['same_major_compatible_widening', 'new_major_required']) {
    validateStringList(versioning[key], `versioning.${key}`, issues);
  }
}

function validateStringList(value, label, issues) {
  if (!Array.isArray(value) || value.length === 0
    || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    issues.push(`${label} must be a non-empty list of strings`);
    return;
  }

  if (new Set(value).size !== value.length) {
    issues.push(`${label} must not contain duplicates`);
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

async function main() {
  const artifactPath = process.argv[2] ?? DEFAULT_ARTIFACT_PATH;
  const definition = await readMobileReportUploadArtifact(artifactPath);
  console.log(
    `[artifact] PASS ${artifactPath}: ${Object.keys(definition.fields).length} v1 fields, `
      + 'multipart wire boundary and declared domains are structurally valid.',
  );
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    if (error instanceof ContractArtifactValidationError) {
      console.error(error.message);
      for (const issue of error.issues) console.error(`[artifact] - ${issue}`);
    } else {
      console.error(`[artifact] ${error.message}`);
    }
    process.exitCode = 1;
  }
}

export { DEFAULT_ARTIFACT_PATH };
