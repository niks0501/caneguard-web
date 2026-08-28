import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Phase1AcceptanceError,
  parseArgs,
  safeTestEnvironment,
} from './run-phase1-lifecycle-acceptance.mjs';

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
