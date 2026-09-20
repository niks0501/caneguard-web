import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../ci/mobile-report-upload-gate.json',
);
const EXPECTED_MOBILE_REPOSITORY = 'niks0501/caneguard-mobile';
const EXPECTED_ARTIFACT_PATH = 'docs/contracts/mobile-report-upload-v2.json';
const EXPECTED_PRODUCER_TEST_PATH =
  'src/features/sync/mappers/__tests__/reportMultipartMapper.contract.test.ts';
const EXPECTED_ASSIGNMENT_ARTIFACT_PATH =
  'docs/contracts/mobile-field-validation-assignment-v1.json';
const EXPECTED_ASSIGNMENT_PRODUCER_TEST_PATH =
  'src/features/assignments/api/__tests__/mobileFieldValidationAssignmentsApi.contract.test.ts';
const EXPECTED_COMPLETION_ARTIFACT_PATH =
  'docs/contracts/mobile-field-validation-completion-v1.json';
const EXPECTED_COMPLETION_PRODUCER_TEST_PATH =
  'src/features/assignments/api/__tests__/mobileFieldValidationCompletion.contract.test.ts';
const EXPECTED_NOTIFICATION_ARTIFACT_PATH =
  'docs/contracts/mobile-notifications-v1.json';
const EXPECTED_NOTIFICATION_PRODUCER_TEST_PATH =
  'src/features/notifications/api/__tests__/mobileNotificationsApi.contract.test.ts';
const EXPECTED_LIFECYCLE_ARTIFACT_PATH =
  'docs/contracts/report-lifecycle-v1.json';
const EXPECTED_LIFECYCLE_PRODUCER_TEST_PATH =
  'src/features/lifecycle/__tests__/reportLifecycleContract.test.ts';
const FULL_SHA = /^[0-9a-f]{40}$/i;

export class GateConfigValidationError extends Error {
  constructor(message) {
    super(`[config] ${message}`);
    this.name = 'GateConfigValidationError';
    this.category = 'config';
  }
}

export async function readGateConfig(configPath = DEFAULT_CONFIG_PATH) {
  let contents;
  try {
    contents = await readFile(configPath, 'utf8');
  } catch (error) {
    throw new GateConfigValidationError(
      `could not read ${configPath}: ${error.message}`,
    );
  }

  let config;
  try {
    config = JSON.parse(contents);
  } catch (error) {
    throw new GateConfigValidationError(
      `contains invalid JSON: ${error.message}`,
    );
  }

  if (config?.mobile_repository !== EXPECTED_MOBILE_REPOSITORY) {
    throw new GateConfigValidationError(
      `mobile_repository must be ${EXPECTED_MOBILE_REPOSITORY}`,
    );
  }
  if (!FULL_SHA.test(config?.mobile_ref ?? '')) {
    throw new GateConfigValidationError(
      'mobile_ref must be an exact 40-character commit SHA',
    );
  }
  if (config.artifact_path !== EXPECTED_ARTIFACT_PATH) {
    throw new GateConfigValidationError(
      `artifact_path must be ${EXPECTED_ARTIFACT_PATH}`,
    );
  }
  if (config.producer_test_path !== EXPECTED_PRODUCER_TEST_PATH) {
    throw new GateConfigValidationError(
      `producer_test_path must be ${EXPECTED_PRODUCER_TEST_PATH}`,
    );
  }
  if (config.assignment_artifact_path !== EXPECTED_ASSIGNMENT_ARTIFACT_PATH) {
    throw new GateConfigValidationError(
      `assignment_artifact_path must be ${EXPECTED_ASSIGNMENT_ARTIFACT_PATH}`,
    );
  }
  if (config.assignment_producer_test_path !== EXPECTED_ASSIGNMENT_PRODUCER_TEST_PATH) {
    throw new GateConfigValidationError(
      `assignment_producer_test_path must be ${EXPECTED_ASSIGNMENT_PRODUCER_TEST_PATH}`,
    );
  }
  if (config.completion_artifact_path !== EXPECTED_COMPLETION_ARTIFACT_PATH) {
    throw new GateConfigValidationError(
      `completion_artifact_path must be ${EXPECTED_COMPLETION_ARTIFACT_PATH}`,
    );
  }
  if (config.completion_producer_test_path !== EXPECTED_COMPLETION_PRODUCER_TEST_PATH) {
    throw new GateConfigValidationError(
      `completion_producer_test_path must be ${EXPECTED_COMPLETION_PRODUCER_TEST_PATH}`,
    );
  }
  if (config.notification_artifact_path !== EXPECTED_NOTIFICATION_ARTIFACT_PATH) {
    throw new GateConfigValidationError(
      `notification_artifact_path must be ${EXPECTED_NOTIFICATION_ARTIFACT_PATH}`,
    );
  }
  if (config.notification_producer_test_path !== EXPECTED_NOTIFICATION_PRODUCER_TEST_PATH) {
    throw new GateConfigValidationError(
      `notification_producer_test_path must be ${EXPECTED_NOTIFICATION_PRODUCER_TEST_PATH}`,
    );
  }
  if (config.lifecycle_artifact_path !== EXPECTED_LIFECYCLE_ARTIFACT_PATH) {
    throw new GateConfigValidationError(
      `lifecycle_artifact_path must be ${EXPECTED_LIFECYCLE_ARTIFACT_PATH}`,
    );
  }
  if (config.lifecycle_producer_test_path !== EXPECTED_LIFECYCLE_PRODUCER_TEST_PATH) {
    throw new GateConfigValidationError(
      `lifecycle_producer_test_path must be ${EXPECTED_LIFECYCLE_PRODUCER_TEST_PATH}`,
    );
  }

  return config;
}

export function resolveMobileRef(config, override = '') {
  const mobileRef = override === '' ? config.mobile_ref : override;
  if (!FULL_SHA.test(mobileRef)) {
    throw new GateConfigValidationError(
      'the selected mobile_ref must be an exact 40-character commit SHA',
    );
  }
  return mobileRef.toLowerCase();
}

async function main() {
  const configPath = process.argv[2] ?? DEFAULT_CONFIG_PATH;
  const config = await readGateConfig(configPath);
  const mobileRef = resolveMobileRef(config, process.env.MOBILE_REF_INPUT ?? '');
  const output = {
    mobile_repository: config.mobile_repository,
    mobile_ref: mobileRef,
    artifact_path: config.artifact_path,
    producer_test_path: config.producer_test_path,
    assignment_artifact_path: config.assignment_artifact_path,
    assignment_producer_test_path: config.assignment_producer_test_path,
    completion_artifact_path: config.completion_artifact_path,
    completion_producer_test_path: config.completion_producer_test_path,
    notification_artifact_path: config.notification_artifact_path,
    notification_producer_test_path: config.notification_producer_test_path,
    lifecycle_artifact_path: config.lifecycle_artifact_path,
    lifecycle_producer_test_path: config.lifecycle_producer_test_path,
  };

  if (process.env.GITHUB_OUTPUT) {
    const lines = Object.entries(output).map(([key, value]) => `${key}=${value}`);
    await import('node:fs/promises').then(({ appendFile }) =>
      appendFile(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`),
    );
  }

  console.log(`[config] PASS ${configPath}`);
  console.log(`[config] mobile repository: ${output.mobile_repository}`);
  console.log(`[config] mobile revision: ${output.mobile_ref}`);
  console.log(`[config] canonical upload artifact: ${output.artifact_path}`);
  console.log(`[config] upload producer test: ${output.producer_test_path}`);
  console.log(`[config] assignment artifact: ${output.assignment_artifact_path}`);
  console.log(`[config] assignment producer test: ${output.assignment_producer_test_path}`);
  console.log(`[config] completion artifact: ${output.completion_artifact_path}`);
  console.log(`[config] completion producer test: ${output.completion_producer_test_path}`);
  console.log(`[config] notification artifact: ${output.notification_artifact_path}`);
  console.log(`[config] notification producer test: ${output.notification_producer_test_path}`);
  console.log(`[config] lifecycle artifact: ${output.lifecycle_artifact_path}`);
  console.log(`[config] lifecycle producer test: ${output.lifecycle_producer_test_path}`);
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof GateConfigValidationError
      ? error.message
      : `[config] ${error.message}`);
    process.exitCode = 1;
  }
}

export {
  DEFAULT_CONFIG_PATH,
  EXPECTED_ARTIFACT_PATH,
  EXPECTED_MOBILE_REPOSITORY,
  EXPECTED_PRODUCER_TEST_PATH,
  EXPECTED_ASSIGNMENT_ARTIFACT_PATH,
  EXPECTED_ASSIGNMENT_PRODUCER_TEST_PATH,
  EXPECTED_COMPLETION_ARTIFACT_PATH,
  EXPECTED_COMPLETION_PRODUCER_TEST_PATH,
  EXPECTED_NOTIFICATION_ARTIFACT_PATH,
  EXPECTED_NOTIFICATION_PRODUCER_TEST_PATH,
  EXPECTED_LIFECYCLE_ARTIFACT_PATH,
  EXPECTED_LIFECYCLE_PRODUCER_TEST_PATH,
};
