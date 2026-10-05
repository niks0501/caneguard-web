import { test } from "node:test";
import assert from "node:assert/strict";
import { readArtifacts, validateAccountsContract } from "./validate-accounts-access-v1.mjs";
test("approved accounts artifacts validate", () => validateAccountsContract(...readArtifacts()));
for (const [name, change] of [
  ["unknown contract", c => { c.contract_version = "v99"; }],
  ["implicit keys", c => { c.default_grants = ["report:approve"]; }],
  ["enabled-by-default rollout", c => { c.default_enabled = true; }],
  ["wildcard keys", c => { c.grants.push("*"); }],
  ["weakened singleton", c => { c.singleton = "two"; }],
  ["early history purge", c => { c.retention = "one_year"; }],
]) test(`rejects ${name}`, () => {
  const artifacts = readArtifacts();
  change(artifacts[0]);
  assert.throws(() => validateAccountsContract(...artifacts));
});
