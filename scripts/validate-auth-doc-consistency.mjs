import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const documentationFiles = {
  auth: "docs/contracts/auth-v1.md",
  rbac: "docs/security/simplified-web-rbac.md",
  district: "docs/contracts/district-access-v1.md",
  accounts: "docs/contracts/accounts-access-v1.md",
  weekly: "api/docs/weekly-report-content-v1.md",
  webEnv: ".env.example",
  apiEnv: "api/.env.example",
};

/** Guides that describe Web authority; every named grant must stay historical. */
const authorityDocs = ["auth", "rbac", "district", "accounts", "weekly"];

/** Guides and environment examples that must not revive registration. */
const registrationDocs = ["auth", "district", "accounts", "weekly", "webEnv", "apiEnv"];

export function readRepositoryFile(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

export function readConsistencyInputs() {
  return Object.fromEntries(
    Object.entries(documentationFiles).map(([key, file]) => [key, readRepositoryFile(file)]),
  );
}

function assertRegistrationIsDocumentedAsDisabled(docs) {
  for (const name of registrationDocs) {
    assert.match(
      docs[name],
      /[Pp]ublic (self-)?registration is disabled/,
      `${documentationFiles[name]} must state that public registration is disabled`,
    );
  }
}

function assertNoRetiredRegistrationInstructions(docs) {
  for (const name of registrationDocs) {
    const text = docs[name];
    const file = documentationFiles[name];
    for (const forbidden of [
      "can be enabled with both",
      "opt in with both api switches",
      "vite_caneguard_self_registration_enabled=true",
      "registration then creates unverified farmers",
    ]) {
      assert.ok(
        !text.toLowerCase().includes(forbidden),
        `${file} must not present a retired registration path as current: ${forbidden}`,
      );
    }
    // A retired control may be named only where its own line, or the comment
    // directly above it, marks it retired.
    const lines = text.split("\n");
    for (const [index, line] of lines.entries()) {
      if (!/\b(CANEGUARD_SELF_REGISTRATION_ENABLED|CANEGUARD_PILOT_ROSTER_CERTIFIED|REGISTRATION_CREATED|VITE_CANEGUARD_SELF_REGISTRATION_ENABLED)\b/.test(line)) continue;
      const marked = [line, lines[index - 1] ?? ""]
        .join(" ")
        .toLowerCase();
      assert.ok(
        marked.includes("retired") || marked.includes("not read") || marked.includes("historical"),
        `${file} refers to a retired registration control without marking it retired: ${line.trim()}`,
      );
    }
  }
}

function assertNamedGrantsAreNotAuthority(docs) {
  for (const name of authorityDocs) {
    const text = docs[name];
    for (const match of text.matchAll(/^.*\b(staff:manage|report:approve|report:send)\b.*$/gm)) {
      const line = match[0].toLowerCase();
      assert.ok(
        line.includes("legacy")
          || line.includes("compatibility")
          || line.includes("bookkeeping")
          || line.includes("historical")
          || line.includes("retired")
          || line.includes("stored for"),
        `${documentationFiles[name]} presents a legacy named grant as current authority: ${match[0].trim()}`,
      );
    }
    assert.doesNotMatch(
      text,
      /requires? (?:a )?(?:current )?named `staff:manage` grant/,
      `${documentationFiles[name]} must not require a named staff:manage grant`,
    );
  }
  assert.doesNotMatch(
    docs.auth,
    /An `admin` role alone confers no management, approval or send grant/,
    "auth-v1 must not deny the Admin role's management/approval/send authority",
  );
}

function assertRoleMatrixDocumentsAuthority(docs) {
  const requiredRows = [
    ["Dashboard", "Yes", "Yes"],
    ["Reports / List and case review", "Yes", "Yes"],
    ["Monitoring, Map and Assignments", "Yes", "Yes"],
    ["Normal Settings (own account security)", "Yes", "Yes"],
    ["Prepare an official weekly version", "Yes", "Yes"],
    ["Approve or send an official weekly version", "No", "Yes"],
    ["User Management (role and status changes)", "No", "Yes"],
    ["Report Approval surface", "No", "Yes"],
    ["Admin Settings", "No", "Yes"],
    ["Self-service staff sign-up", "No", "No"],
  ];
  for (const [action, reviewer, admin] of requiredRows) {
    const row = new RegExp(
      `^\\| ${action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\| ${reviewer} \\| ${admin} \\|$`,
      "m",
    );
    assert.match(docs.rbac, row, `The role matrix row for "${action}" must be Reviewer ${reviewer} / Admin ${admin}`);
  }
}

export function validateAuthDocumentationConsistency(docs) {
  assertRegistrationIsDocumentedAsDisabled(docs);
  assertNoRetiredRegistrationInstructions(docs);
  assertNamedGrantsAreNotAuthority(docs);
  assertRoleMatrixDocumentsAuthority(docs);
}
