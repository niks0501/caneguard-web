import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
const scripts = packageJson.scripts;
const npmScriptPattern = /npm run ([\w:-]+)/g;
const forbiddenFastCommands = /\b(?:playwright|chrome|cypress|selenium|e2e|agent-device|maestro)\b/i;

function expandScript(name, stack = []) {
  assert.ok(scripts[name], `expected package script ${name} to exist`);
  if (stack.includes(name)) {
    throw new Error(`package script cycle: ${[...stack, name].join(' -> ')}`);
  }

  const command = scripts[name];
  const nestedCommands = [...command.matchAll(npmScriptPattern)].map((match) => match[1]);
  return [command, ...nestedCommands.map((nestedName) => expandScript(nestedName, [...stack, name]))].join(' ');
}

test('agent verification scripts compose existing project gates', () => {
  assert.equal(scripts['verify:fast'], 'npm run check:web');
  assert.equal(scripts['verify:backend'], 'npm run check:api && npm run api:test:mysql');
  assert.equal(scripts['verify:contract'], 'npm run contract:gate');

  const fastCommands = expandScript('verify:fast');
  assert.doesNotMatch(
    fastCommands,
    forbiddenFastCommands,
    'verify:fast must remain free of browser and E2E commands',
  );
});

test('verification compositions reference only declared npm scripts', () => {
  for (const name of ['verify:fast', 'verify:backend', 'verify:contract']) {
    const command = scripts[name];
    for (const match of command.matchAll(npmScriptPattern)) {
      assert.ok(scripts[match[1]], `${name} references missing script ${match[1]}`);
    }
  }
});
