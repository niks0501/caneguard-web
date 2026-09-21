import { chmod, lstat, readFile, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_ARTIFACT_PATH,
  readMobileFieldValidationAssignmentArtifact,
} from './validate-mobile-field-validation-assignment-v1.mjs';
import {
  readGateConfig,
  resolveMobileRef,
} from './resolve-mobile-report-upload-gate-config.mjs';

const DEFAULT_TEST_PATH =
  'src/features/assignments/api/__tests__/mobileFieldValidationAssignmentsApi.contract.test.ts';
const FULL_SHA = /^[0-9a-f]{40}$/i;

class AssignmentProducerContractError extends Error {
  constructor(message) {
    super(`[producer] ${message}`);
    this.name = 'AssignmentProducerContractError';
    this.category = 'producer';
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mobileDir = path.resolve(
    args.mobileDir ?? process.env.MOBILE_REPO_DIR ?? '',
  );
  const artifactPath = path.resolve(
    args.artifact ?? process.env.ASSIGNMENT_CONTRACT_ARTIFACT ?? DEFAULT_ARTIFACT_PATH,
  );
  if (!args.mobileDir && !process.env.MOBILE_REPO_DIR) {
    throw new AssignmentProducerContractError('MOBILE_REPO_DIR must point to a checked-out caneguard-mobile revision.');
  }

  const config = await readGateConfig();
  const expectedMobileRef = resolveMobileRef(config, args.mobileRef ?? process.env.MOBILE_REF ?? '');
  const producerTestPath = args.testPath ?? config.assignment_producer_test_path ?? DEFAULT_TEST_PATH;
  const webArtifact = await readMobileFieldValidationAssignmentArtifact(artifactPath);
  await assertMobileCheckout(mobileDir, expectedMobileRef);

  const artifactTarget = path.join(mobileDir, 'references/mobile-field-validation-assignment-v1.json');
  const originalArtifact = await readRegularFile(artifactTarget);
  const originalMode = (await lstat(artifactTarget)).mode;
  try {
    await writeFile(
      artifactTarget,
      JSON.stringify(producerArtifact(webArtifact), null, 2),
    );
    await runProducerTest(mobileDir, producerTestPath);
  } finally {
    await writeFile(artifactTarget, originalArtifact);
    await chmod(artifactTarget, originalMode);
  }
  console.log(`[producer] PASS mobile-field-validation-assignment-v1 producer test at ${expectedMobileRef}. The producer was evaluated against the web-owned artifact.`);
}

function producerArtifact(definition) {
  // The pinned Mobile producer consumes the optional previous-visit context,
  // so evaluate it against the complete Web-owned assignment artifact.
  return definition;
}

async function assertMobileCheckout(directory, expectedRef) {
  let actualRef;
  try {
    actualRef = execFileSync('git', ['-C', directory, 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase();
  } catch (error) {
    throw new AssignmentProducerContractError(`could not inspect ${directory} as a Git checkout: ${error.message}`);
  }
  if (!FULL_SHA.test(actualRef) || actualRef !== expectedRef) {
    throw new AssignmentProducerContractError(`revision mismatch. Expected ${expectedRef}, received ${actualRef || 'none'}. Use a full commit SHA, never a moving branch.`);
  }
  const status = execFileSync('git', ['-C', directory, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim();
  if (status !== '') throw new AssignmentProducerContractError(`checkout ${directory} is dirty. Refusing to overwrite the mobile artifact.`);
}

async function readRegularFile(filePath) {
  let metadata;
  try {
    metadata = await lstat(filePath);
  } catch (error) {
    throw new AssignmentProducerContractError(`mobile producer artifact ${filePath} is unavailable: ${error.message}`);
  }
  if (!metadata.isFile()) throw new AssignmentProducerContractError(`mobile producer artifact ${filePath} must be a regular file, not a symlink or directory.`);
  return readFile(filePath);
}

async function runProducerTest(directory, testPath) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['test', '--', '--runInBand', testPath], {
    cwd: directory,
    env: safeTestEnvironment(),
    stdio: 'inherit',
  });
  if (result.error) throw new AssignmentProducerContractError(`could not start the focused mobile Jest test: ${result.error.message}`);
  if (result.status !== 0) throw new AssignmentProducerContractError(`focused mobile Jest assignment contract test failed with exit code ${result.status ?? 'unknown'}.`);
}

function safeTestEnvironment() {
  const environment = {};
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL']) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  environment.CI = 'true';
  return environment;
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) throw new AssignmentProducerContractError(`unexpected argument ${value}`);
    const [key, inlineValue] = value.slice(2).split('=', 2);
    const normalizedKey = {
      'mobile-dir': 'mobileDir',
      artifact: 'artifact',
      'mobile-ref': 'mobileRef',
      'test-path': 'testPath',
    }[key];
    if (!normalizedKey) throw new AssignmentProducerContractError(`unknown option --${key}`);
    const nextValue = inlineValue ?? values[++index];
    if (!nextValue || nextValue.startsWith('--')) throw new AssignmentProducerContractError(`option --${key} needs a value`);
    parsed[normalizedKey] = nextValue;
  }
  return parsed;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof AssignmentProducerContractError ? error.message : `[producer] ${error.message}`);
    process.exitCode = 1;
  }
}

export { AssignmentProducerContractError, producerArtifact, safeTestEnvironment };
