import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  GateConfigValidationError,
  readGateConfig,
  resolveMobileRef,
} from './resolve-mobile-report-upload-gate-config.mjs';

const VALID_SHA = 'a'.repeat(40);

async function configFixture(overrides = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'caneguard-contract-config-'));
  const configPath = path.join(directory, 'gate.json');
  await writeFile(configPath, JSON.stringify({
    mobile_repository: 'niks0501/caneguard-mobile',
    mobile_ref: VALID_SHA,
    artifact_path: 'docs/contracts/mobile-report-upload-v2.json',
    producer_test_path:
      'src/features/sync/mappers/__tests__/reportMultipartMapper.contract.test.ts',
    assignment_artifact_path: 'docs/contracts/mobile-field-validation-assignment-v1.json',
    assignment_producer_test_path:
      'src/features/assignments/api/__tests__/mobileFieldValidationAssignmentsApi.contract.test.ts',
    completion_artifact_path: 'docs/contracts/mobile-field-validation-completion-v1.json',
    completion_producer_test_path:
      'src/features/assignments/api/__tests__/mobileFieldValidationCompletion.contract.test.ts',
    notification_artifact_path: 'docs/contracts/mobile-notifications-v1.json',
    notification_producer_test_path:
      'src/features/notifications/api/__tests__/mobileNotificationsApi.contract.test.ts',
    lifecycle_artifact_path: 'docs/contracts/report-lifecycle-v1.json',
    lifecycle_producer_test_path:
      'src/features/lifecycle/__tests__/reportLifecycleContract.test.ts',
    ...overrides,
  }));
  return { directory, configPath };
}

test('accepts and resolves an exact pinned mobile revision', async () => {
  const { directory, configPath } = await configFixture();
  try {
    const config = await readGateConfig(configPath);
    assert.equal(resolveMobileRef(config), VALID_SHA);
    assert.equal(resolveMobileRef(config, 'B'.repeat(40)), 'b'.repeat(40));
    assert.throws(
      () => resolveMobileRef(config, ` ${VALID_SHA}`),
      (error) => error instanceof GateConfigValidationError
        && error.message.includes('exact 40-character commit SHA'),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects a moving branch as a mobile revision', async () => {
  const { directory, configPath } = await configFixture({ mobile_ref: 'main' });
  try {
    await assert.rejects(
      () => readGateConfig(configPath),
      (error) => error instanceof GateConfigValidationError
        && error.category === 'config'
        && error.message.includes('exact 40-character commit SHA'),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects a repository outside the approved mobile producer', async () => {
  const { directory, configPath } = await configFixture({
    mobile_repository: 'other-owner/other-repository',
  });
  try {
    await assert.rejects(
      () => readGateConfig(configPath),
      (error) => error instanceof GateConfigValidationError
        && error.message.includes('niks0501/caneguard-mobile'),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
