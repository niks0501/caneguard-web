import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { validateMobileReportUploadV2Artifact } from './validate-mobile-report-upload-v2.mjs';

const definition = JSON.parse(await readFile(new URL('../docs/contracts/mobile-report-upload-v2.json', import.meta.url), 'utf8'));

test('v2 authority partitions the write envelope without admitting server fields', () => {
  assert.equal(validateMobileReportUploadV2Artifact(definition), definition);
  for (const change of [
    (d) => d.authority.client_owned.pop(),
    (d) => d.authority.client_owned.push('review_status'),
    (d) => d.authority.server_derived.push('client_uuid'),
    (d) => d.authority.server_owned_read_only.splice(0, 1),
    (d) => { d.fields.review_status = d.fields.barangay; },
    (d) => { d.authority.undeclared_field_policy = 'rejected'; },
    (d) => { delete d.authority; },
    (d) => { d.authority.client_owned = {}; },
    (d) => { d.authority.server_owned_read_only = null; },
  ]) {
    const changed = structuredClone(definition);
    change(changed);
    assert.throws(() => validateMobileReportUploadV2Artifact(changed), { name: 'MobileReportUploadV2ArtifactError' });
  }
});

test('v2 widening preserves conditional Model V1 keys and bounded future evidence', () => {
  for (const change of [
    (d) => { d.fields.model_version.enum = ['v1.0-mobilenetv2']; },
    (d) => { d.fields.model_version.max_length = 101; },
    (d) => { d.fields.class_scores.max_properties = 4; },
    (d) => { d.fields.class_scores.conditions[0].additional_properties = true; },
    (d) => { d.fields.class_scores.conditions[0].required_keys.pop(); },
    (d) => { delete d.fields.class_scores.key_pattern; },
  ]) {
    const changed = structuredClone(definition);
    change(changed);
    assert.throws(() => validateMobileReportUploadV2Artifact(changed), { name: 'MobileReportUploadV2ArtifactError' });
  }
});
