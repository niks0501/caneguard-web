import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Phase1AcceptanceError,
  linkOrCopyDirectory,
  parseArgs,
  safeTestEnvironment,
} from './run-phase1-lifecycle-acceptance.mjs';
import { safeTestEnvironment as safeLifecycleTestEnvironment } from './run-report-lifecycle-producer-contract.mjs';

test('parses the local-stack evidence output and Mobile checkout options', () => {
  assert.deepEqual(
    parseArgs(['--mobile-dir', '/tmp/mobile', '--output=/tmp/evidence.json']),
    { mobileDir: '/tmp/mobile', output: '/tmp/evidence.json' },
  );
  assert.throws(
    () => parseArgs(['--unknown', 'value']),
    (error) => error instanceof Phase1AcceptanceError && error.category === 'local-stack',
  );
});

test('does not pass arbitrary parent environment values to the optional Mobile seam test', () => {
  const environment = safeTestEnvironment();
  assert.equal(environment.CI, 'true');
  assert.equal('CANEGUARD_FIELD_PASSWORD' in environment, false);
  assert.equal('GITHUB_TOKEN' in environment, false);
});

test('preserves the minimal Windows runtime environment without secrets', () => {
  const source = {
    PATH: 'C:\\node',
    HOME: 'C:\\Users\\field',
    TMPDIR: 'C:\\Temp',
    TEMP: 'C:\\Temp',
    TMP: 'C:\\Temp',
    USERPROFILE: 'C:\\Users\\field',
    SystemRoot: 'C:\\Windows',
    GITHUB_TOKEN: 'not-forwarded',
  };
  const expected = {
    PATH: 'C:\\node',
    HOME: 'C:\\Users\\field',
    TMPDIR: 'C:\\Temp',
    TEMP: 'C:\\Temp',
    TMP: 'C:\\Temp',
    USERPROFILE: 'C:\\Users\\field',
    SystemRoot: 'C:\\Windows',
    CI: 'true',
  };

  assert.deepEqual(safeTestEnvironment(source, 'win32'), expected);
  assert.deepEqual(safeLifecycleTestEnvironment(source, 'win32'), expected);
});

test('falls back to copying when directory symlinks are unavailable', async () => {
  const calls = [];
  const result = await linkOrCopyDirectory('/source', '/target', 'test directory', {
    platform: 'win32',
    link: async (source, target, type) => {
      calls.push(['link', source, target, type]);
      const error = new Error('Developer Mode is disabled');
      error.code = 'EPERM';
      throw error;
    },
    copy: async (source, target, options) => {
      calls.push(['copy', source, target, options]);
    },
  });

  assert.equal(result, 'copy');
  assert.deepEqual(calls, [
    ['link', '/source', '/target', 'junction'],
    ['copy', '/source', '/target', { recursive: true }],
  ]);
});
