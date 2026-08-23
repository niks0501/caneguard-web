import { execFileSync } from 'node:child_process';

const rawExpected = process.argv[2] ?? process.env.EXPECTED_GIT_REF ?? '';
const expected = rawExpected.toLowerCase();
const directory = process.argv[3] ?? process.cwd();
const FULL_SHA = /^[0-9a-f]{40}$/;

if (!FULL_SHA.test(expected)) {
  console.error('[revision] expected an exact 40-character commit SHA.');
  process.exitCode = 1;
} else {
  let actual;
  try {
    actual = execFileSync(
      'git',
      ['-C', directory, 'rev-parse', '--verify', 'HEAD'],
      { encoding: 'utf8' },
    ).trim().toLowerCase();
  } catch (error) {
    console.error(`[revision] could not inspect ${directory}: ${error.message}`);
    process.exitCode = 1;
  }

  if (process.exitCode !== 1 && actual !== expected) {
    console.error(
      `[revision] mismatch in ${directory}: expected ${expected}, received ${actual || 'none'}.`,
    );
    process.exitCode = 1;
  }

  if (process.exitCode !== 1) {
    console.log(`[revision] PASS ${directory} at ${actual}`);
  }
}
