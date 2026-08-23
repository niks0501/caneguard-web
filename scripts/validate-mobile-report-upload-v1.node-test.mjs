import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ContractArtifactValidationError,
  DEFAULT_ARTIFACT_PATH,
  readMobileReportUploadArtifact,
  validateMobileReportUploadArtifact,
} from './validate-mobile-report-upload-v1.mjs';

async function fixture() {
  return JSON.parse(await readFile(DEFAULT_ARTIFACT_PATH, 'utf8'));
}

test('accepts the canonical mobile report upload v1 artifact', async () => {
  const artifact = await readMobileReportUploadArtifact();

  assert.equal(artifact.contract, 'mobile-report-upload-v1');
  assert.equal(artifact.version, 1);
  assert.equal(Object.keys(artifact.fields).length, 36);
});

test('identifies an artifact that declares an undeclared wire shape', async () => {
  const artifact = await fixture();
  artifact.wire.content_type = 'application/json';

  assert.throws(
    () => validateMobileReportUploadArtifact(artifact, 'fixture'),
    (error) => error instanceof ContractArtifactValidationError
      && error.category === 'artifact'
      && error.issues.some((issue) => issue.includes('content_type')),
  );
});

test('identifies an artifact with an incompatible numeric domain', async () => {
  const artifact = await fixture();
  artifact.fields.confidence.minimum = 2;
  artifact.fields.confidence.maximum = 1;

  assert.throws(
    () => validateMobileReportUploadArtifact(artifact, 'fixture'),
    (error) => error instanceof ContractArtifactValidationError
      && error.issues.some((issue) => issue.includes('minimum cannot exceed maximum')),
  );
});

test('identifies an artifact with an unsupported conditional rule', async () => {
  const artifact = await fixture();
  artifact.fields.location_source.conditions[0].rule = 'required_unless';

  assert.throws(
    () => validateMobileReportUploadArtifact(artifact, 'fixture'),
    (error) => error instanceof ContractArtifactValidationError
      && error.issues.some((issue) => issue.includes('rule is unsupported')),
  );
});
