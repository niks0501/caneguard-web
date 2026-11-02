import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { validateMobileReportUploadV3Artifact } from './validate-mobile-report-upload-v3.mjs';

const definition = JSON.parse(await readFile(new URL('../docs/contracts/mobile-report-upload-v3.json', import.meta.url), 'utf8'));

test('v3 declares the survey link as client-owned, optional and nullable', () => {
  assert.equal(validateMobileReportUploadV3Artifact(definition), definition);
  assert.ok(definition.authority.client_owned.includes('field_survey_client_uuid'));
  for (const change of [
    (d) => { delete d.fields.field_survey_client_uuid; },
    (d) => { d.fields.field_survey_client_uuid.required = true; },
    (d) => { d.fields.field_survey_client_uuid.nullable = false; },
    (d) => { d.fields.field_survey_client_uuid.type = 'string'; },
    (d) => { d.fields.field_survey_client_uuid.normalization = {}; },
    (d) => d.authority.client_owned.splice(d.authority.client_owned.indexOf('field_survey_client_uuid'), 1),
    (d) => { d.wire.path = '/api/v2/mobile/reports'; },
    (d) => { d.version = 2; },
  ]) {
    const changed = structuredClone(definition);
    change(changed);
    assert.throws(() => validateMobileReportUploadV3Artifact(changed), { name: 'MobileReportUploadV3ArtifactError' });
  }
});
