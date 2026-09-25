import test from "node:test";
import assert from "node:assert/strict";
import {
  contrastRatio,
  parseTokensCss,
  validateDashboardWrapRules,
  validateReportTablePillRules,
  validateSemanticContrast,
} from "./validate-design-spine.mjs";

test("contrastRatio computes accurate WCAG relative luminance contrast", () => {
  // Black on white is 21:1
  assert.ok(contrastRatio("#000000", "#ffffff") >= 20.9);
  // White on white is 1:1
  assert.equal(Math.round(contrastRatio("#ffffff", "#ffffff")), 1);
  // #66736a on #edf3ed fails AA normal text (is ~4.41:1)
  const ratio = contrastRatio("#66736a", "#edf3ed");
  assert.ok(ratio < 4.5, `Expected < 4.5 but got ${ratio}`);
});

test("validateSemanticContrast catches failing token pairs", () => {
  const failingTokens = `
    :root {
      --color-text: #243228;
      --color-muted: #66736a;
      --color-page: #f4f7f3;
      --color-surface: #ffffff;
      --color-surface-soft: #edf3ed;
    }
  `;
  const errors = validateSemanticContrast(failingTokens);
  assert.ok(errors.length > 0);
  assert.match(errors[0], /--color-muted .* on --color-surface-soft/);

  const passingTokens = `
    :root {
      --color-text: #1d2720;
      --color-muted: #505d54;
      --color-page: #f4f7f3;
      --color-surface: #ffffff;
      --color-surface-soft: #edf3ed;
    }
  `;
  const passingErrors = validateSemanticContrast(passingTokens);
  assert.equal(passingErrors.length, 0);
});

test("validateDashboardWrapRules requires min-width 0, max-width 100% and wrapping on dashboard tracks", () => {
  const passing = `
    .dashboard-grid > * { min-width: 0; max-width: 100%; }
    .dashboard-section { min-width: 0; max-width: 100%; }
    .dashboard-section__heading > * { min-width: 0; max-width: 100%; }
    .dashboard-card { min-width: 0; max-width: 100%; }
    .kpi-card { min-width: 0; max-width: 100%; }
    .kpi-card__label { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
    .kpi-card__value { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
    .kpi-card__segment-label { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
    .decision-chart-card { min-width: 0; max-width: 100%; }
    .decision-chart-card__title { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
    .decision-chart-card__hint { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
    .dashboard-report-table { min-width: 0; max-width: 100%; }
    .dashboard-report-table th { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
    .dashboard-report-table td { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
  `;
  assert.equal(validateDashboardWrapRules(passing).length, 0);

  const failing = ".kpi-card { display: flex; }\n.kpi-card__value { overflow-wrap: anywhere; }";
  const errors = validateDashboardWrapRules(failing);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((error) => /kpi-card.*min-width/.test(error)));
  assert.ok(errors.some((error) => /kpi-card__value.*max-width/.test(error)));
});

test("validateReportTablePillRules requires content-sized no-wrap pill columns", () => {
  const passing = `
    .table-scroll { width: 100%; overflow-x: auto; }
    .dashboard-report-table__cell-condition { min-width: max-content; white-space: nowrap; }
    .dashboard-report-table__cell-status { min-width: max-content; white-space: nowrap; }
  `;
  assert.equal(validateReportTablePillRules(passing).length, 0);

  // The pre-fix shape: wrapping cells and no small-screen scroll escape.
  const failing = `
    .table-scroll { width: 100%; }
    .dashboard-report-table__cell-condition { overflow-wrap: anywhere; }
    .dashboard-report-table__cell-status { overflow-wrap: anywhere; }
  `;
  const errors = validateReportTablePillRules(failing);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((error) => /cell-condition.*nowrap/.test(error)));
  assert.ok(errors.some((error) => /cell-status.*max-content/.test(error)));
  assert.ok(errors.some((error) => /table-scroll.*overflow-x/.test(error)));
});
