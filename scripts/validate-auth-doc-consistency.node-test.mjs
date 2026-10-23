import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readConsistencyInputs,
  validateAuthDocumentationConsistency,
} from "./validate-auth-doc-consistency.mjs";

test("current auth, RBAC and district documentation agree with each other", () => {
  validateAuthDocumentationConsistency(readConsistencyInputs());
});

function inputs() {
  return readConsistencyInputs();
}

test("rejects a contract that revives switch-enabled registration", () => {
  const docs = inputs();
  docs.auth +=
    "\nSelf-registration is disabled by default and can be enabled with both API switches.\n";
  assert.throws(() => validateAuthDocumentationConsistency(docs));
});

test("rejects a contract that tells operators the retired flags enable sign-up", () => {
  const docs = inputs();
  docs.district = docs.district.replace(
    "Public registration is disabled unconditionally in this release and no flag re-enables it;",
    "Set CANEGUARD_SELF_REGISTRATION_ENABLED=true to enable registration;",
  );
  assert.throws(() => validateAuthDocumentationConsistency(docs));
});

test("rejects a contract that restores named-grant authority", () => {
  const docs = inputs();
  docs.auth = docs.auth.replace(
    "Legacy `staff:manage`, `report:approve` and `report:send` grant rows are compatibility storage",
    "Role changes require a named `staff:manage` grant in the pilot district; grant rows are compatibility storage",
  );
  assert.throws(() => validateAuthDocumentationConsistency(docs));
});

test("rejects a role matrix that hides the Admin-only approval grant", () => {
  const docs = inputs();
  docs.rbac = docs.rbac.replace(
    "| Approve or send an official weekly version | No | Yes |",
    "| Approve or send an official weekly version | Yes | Yes |",
  );
  assert.throws(() => validateAuthDocumentationConsistency(docs));
});
