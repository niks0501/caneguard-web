import { chmod, lstat, readFile, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readGateConfig, resolveMobileRef } from './resolve-mobile-report-upload-gate-config.mjs';
import { DEFAULT_ARTIFACT_PATH, readMobileFieldValidationCompletionArtifact } from './validate-mobile-field-validation-completion-v1.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FULL_SHA = /^[0-9a-f]{40}$/i;
const DEFAULT_TEST_PATH = 'src/features/assignments/api/__tests__/mobileFieldValidationCompletion.contract.test.ts';

class CompletionProducerContractError extends Error {
  constructor(message) {
    super(`[producer] ${message}`);
    this.name = 'CompletionProducerContractError';
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mobileDir = path.resolve(args.mobileDir ?? process.env.MOBILE_REPO_DIR ?? '');
  if (!args.mobileDir && !process.env.MOBILE_REPO_DIR) throw new CompletionProducerContractError('MOBILE_REPO_DIR must point to a checked-out caneguard-mobile revision.');
  const config = await readGateConfig();
  const expectedRef = resolveMobileRef(config, args.mobileRef ?? process.env.MOBILE_REF ?? '');
  const artifactPath = path.resolve(args.artifact ?? process.env.COMPLETION_CONTRACT_ARTIFACT ?? path.join(repositoryRoot, config.completion_artifact_path ?? path.relative(repositoryRoot, DEFAULT_ARTIFACT_PATH)));
  const testPath = args.testPath ?? config.completion_producer_test_path ?? DEFAULT_TEST_PATH;
  await readMobileFieldValidationCompletionArtifact(artifactPath);
  assertMobileCheckout(mobileDir, expectedRef);
  const artifactTarget = path.join(mobileDir, 'references/mobile-field-validation-completion-v1.json');
  const originalArtifact = await readRegularFile(artifactTarget);
  const originalMode = (await lstat(artifactTarget)).mode;
  try {
    await writeFile(artifactTarget, await readFile(artifactPath));
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const result = spawnSync(npmCommand, ['test', '--', '--runInBand', testPath], { cwd: mobileDir, env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, CI: 'true' }, stdio: 'inherit' });
    if (result.error) throw new CompletionProducerContractError(`could not start the focused mobile Jest test: ${result.error.message}`);
    if (result.status !== 0) throw new CompletionProducerContractError(`focused mobile Jest completion contract test failed with exit code ${result.status ?? 'unknown'}.`);
  } finally {
    await writeFile(artifactTarget, originalArtifact);
    await chmod(artifactTarget, originalMode);
  }
  console.log(`[producer] PASS mobile-field-validation-completion-v1 producer test at ${expectedRef}.`);
}

function assertMobileCheckout(directory, expectedRef) {
  const actualRef = execFileSync('git', ['-C', directory, 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase();
  if (!FULL_SHA.test(actualRef) || actualRef !== expectedRef) throw new CompletionProducerContractError(`revision mismatch. Expected ${expectedRef}, received ${actualRef || 'none'}.`);
  const status = execFileSync('git', ['-C', directory, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim();
  if (status !== '') throw new CompletionProducerContractError(`checkout ${directory} is dirty. Refusing to overwrite the mobile artifact.`);
}

async function readRegularFile(filePath) {
  const metadata = await lstat(filePath);
  if (!metadata.isFile()) throw new CompletionProducerContractError(`mobile producer artifact ${filePath} must be a regular file.`);
  return readFile(filePath);
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const [key, inlineValue] = values[index].slice(2).split('=', 2);
    const normalized = { 'mobile-dir': 'mobileDir', artifact: 'artifact', 'mobile-ref': 'mobileRef', 'test-path': 'testPath' }[key];
    if (!normalized) throw new CompletionProducerContractError(`unknown option --${key}`);
    const value = inlineValue ?? values[++index];
    if (!value || value.startsWith('--')) throw new CompletionProducerContractError(`option --${key} needs a value`);
    parsed[normalized] = value;
  }
  return parsed;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof CompletionProducerContractError ? error.message : `[producer] ${error.message}`);
    process.exitCode = 1;
  }
}
