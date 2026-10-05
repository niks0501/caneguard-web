import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export function validateAccountsContract(contract, list, event) {
  assert.equal(contract.contract_version, "accounts-access-v1");
  assert.equal(contract.event_contract_version, "account-access-event-v1");
  assert.equal(contract.base_path, "/api/v2/admin/accounts");
  assert.equal(contract.default_enabled, false);
  assert.deepEqual(contract.default_grants, []);
  assert.deepEqual(contract.grants, ["report:approve", "report:send", "staff:manage"]);
  assert.deepEqual(contract.roles, ["farmer", "field_reporter", "reviewer", "admin"]);
  assert.deepEqual(contract.access_operations, ["admit", "replace", "revoke", "restore"]);
  assert.deepEqual(contract.review_dispositions, ["keep_farmer", "defer", "reopen"]);
  assert.deepEqual(contract.routes, [["GET", ""], ["GET", "/{uuid}"], ["GET", "/{uuid}/events"], ["PUT", "/{uuid}/review"], ["PUT", "/{uuid}/access"], ["POST", "/approval-transfer"]]);
  assert.equal(contract.singleton, "one_non_revoked_report_approve_per_district");
  assert.equal(contract.retention, "identity_and_official_history_lifetime");
  assert.deepEqual(contract.authorization, ["office_cookie", "verified_admin", "active_pilot_membership", "staff:manage", "never_self"]);
  assert.equal(list.contract_version, contract.contract_version);
  assert.ok(list.meta.per_page <= 50);
  assert.equal(list.meta.scope.one_approver, true);
  for (const account of list.data) {
    assert.match(account.uuid, /^[0-9a-f-]{36}$/);
    assert.match(account.email, /@[^@]+\.test$/);
    assert.ok(Number.isInteger(account.access_version) && account.access_version > 0);
    assert.ok(Array.isArray(account.effective_grants));
  }
  assert.equal(event.contract_version, contract.event_contract_version);
  assert.match(event.operation_id, /^[0-9a-f-]{36}$/);
  assert.ok(event.before && event.after && event.actor && event.office_reference);
  assert.equal(event.target_uuid, list.data[0].uuid);
  for (const snapshot of [event.before, event.after]) {
    assert.ok(Array.isArray(snapshot.grants));
    for (const grant of snapshot.grants) {
      assert.ok(contract.grants.includes(grant.ability));
      assert.ok(grant.revision > 0);
    }
  }
  for (const secret of ["current_password", "remember_token", "password_hash", "session_payload", "access_token"]) {
    assert.ok(!JSON.stringify([list, event]).includes(secret), `Sensitive field: ${secret}`);
  }
}
export function readArtifacts() {
  const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));
  return [read("../docs/contracts/accounts-access-v1.json"), read("../docs/contracts/examples/accounts-access-v1-list.json"), read("../docs/contracts/examples/account-access-event-v1.json")];
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  validateAccountsContract(...readArtifacts());
  console.log("PASS accounts-access-v1 and account-access-event-v1 artifacts");
}
