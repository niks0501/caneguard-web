import { chmod, lstat, readFile, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readReportLifecycleArtifact } from './validate-report-lifecycle-v1.mjs';
import { readGateConfig, resolveMobileRef } from './resolve-mobile-report-upload-gate-config.mjs';

const DEFAULT_TEST_PATH = 'src/features/lifecycle/__tests__/reportLifecycleContract.test.ts';
const FULL_SHA = /^[0-9a-f]{40}$/i;

class LifecycleProducerContractError extends Error {
  constructor(message) {
    super(`[producer] ${message}`);
    this.name = 'LifecycleProducerContractError';
    this.category = 'producer';
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mobileDir = path.resolve(args.mobileDir ?? process.env.MOBILE_REPO_DIR ?? '');
  const artifactPath = path.resolve(
    args.artifact
      ?? process.env.LIFECYCLE_CONTRACT_ARTIFACT
      ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/contracts/report-lifecycle-v1.json'),
  );

  if (!args.mobileDir && !process.env.MOBILE_REPO_DIR) {
    throw new LifecycleProducerContractError(
      'MOBILE_REPO_DIR must point to a checked-out caneguard-mobile revision.',
    );
  }

  const config = await readGateConfig();
  const expectedMobileRef = resolveMobileRef(
    config,
    args.mobileRef ?? process.env.MOBILE_REF ?? '',
  );
  const producerTestPath = args.testPath
    ?? config.lifecycle_producer_test_path
    ?? DEFAULT_TEST_PATH;

  await readReportLifecycleArtifact(artifactPath);
  await assertMobileCheckout(mobileDir, expectedMobileRef);

  const artifactTarget = path.join(mobileDir, 'references/report-lifecycle-v1.json');
  const originalArtifact = await readRegularFile(artifactTarget);
  const originalMode = (await lstat(artifactTarget)).mode;
  try {
    await writeFile(artifactTarget, await readFile(artifactPath));
    await runProducerTest(mobileDir, producerTestPath);
  } finally {
    await writeFile(artifactTarget, originalArtifact);
    await chmod(artifactTarget, originalMode);
  }

  console.log(
    `[producer] PASS report-lifecycle-v1 producer test at ${expectedMobileRef}. `
      + 'The Mobile lifecycle seam was evaluated against the web-owned artifact.',
  );
}

async function assertMobileCheckout(directory, expectedRef) {
  let actualRef;
  try {
    actualRef = execFileSync(
      'git',
      ['-C', directory, 'rev-parse', '--verify', 'HEAD'],
      { encoding: 'utf8' },
    ).trim().toLowerCase();
  } catch (error) {
    throw new LifecycleProducerContractError(
      `could not inspect ${directory} as a Git checkout: ${error.message}`,
    );
  }
  if (!FULL_SHA.test(actualRef) || actualRef !== expectedRef) {
    throw new LifecycleProducerContractError(
      `revision mismatch. Expected ${expectedRef}, received ${actualRef || 'none'}. `
        + 'Use a full commit SHA, never a moving branch.',
    );
  }
  const status = execFileSync(
    'git',
    ['-C', directory, 'status', '--porcelain', '--untracked-files=all'],
    { encoding: 'utf8' },
  ).trim();
  if (status !== '') {
    throw new LifecycleProducerContractError(
      `checkout ${directory} is dirty. Refusing to overwrite the mobile artifact.`,
    );
  }
}

async function readRegularFile(filePath) {
  let metadata;
  try {
    metadata = await lstat(filePath);
  } catch (error) {
    throw new LifecycleProducerContractError(
      `mobile producer artifact ${filePath} is unavailable: ${error.message}`,
    );
  }
  if (!metadata.isFile()) {
    throw new LifecycleProducerContractError(
      `mobile producer artifact ${filePath} must be a regular file, not a symlink or directory.`,
    );
  }
  return readFile(filePath);
}

async function runProducerTest(directory, testPath) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(
    npmCommand,
    ['test', '--', '--runInBand', testPath],
    { cwd: directory, env: safeTestEnvironment(), stdio: 'inherit' },
  );
  if (result.error) {
    throw new LifecycleProducerContractError(
      `could not start the focused mobile Jest test: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new LifecycleProducerContractError(
      `focused mobile Jest lifecycle contract test failed with exit code ${result.status ?? 'unknown'}.`,
    );
  }
}

function safeTestEnvironment(source = process.env, platform = process.platform) {
  const allowedKeys = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL'];
  if (platform === 'win32') {
    allowedKeys.push('TEMP', 'TMP', 'USERPROFILE', 'SystemRoot');
  }
  const environment = {};
  for (const key of allowedKeys) {
    if (source[key]) environment[key] = source[key];
  }
  environment.CI = 'true';
  return environment;
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) throw new LifecycleProducerContractError(`unexpected argument ${value}`);
    const [key, inlineValue] = value.slice(2).split('=', 2);
    const normalizedKey = {
      'mobile-dir': 'mobileDir',
      artifact: 'artifact',
      'mobile-ref': 'mobileRef',
      'test-path': 'testPath',
    }[key];
    if (!normalizedKey) throw new LifecycleProducerContractError(`unknown option --${key}`);
    const nextValue = inlineValue ?? values[++index];
    if (!nextValue || nextValue.startsWith('--')) throw new LifecycleProducerContractError(`option --${key} needs a value`);
    parsed[normalizedKey] = nextValue;
  }
  return parsed;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    const category = error?.category;
    console.error(
      category === 'artifact' || category === 'config'
        ? error.message
        : error instanceof LifecycleProducerContractError
          ? error.message
          : `[producer] ${error.message}`,
    );
    process.exitCode = 1;
  }
}

export { LifecycleProducerContractError, safeTestEnvironment };
