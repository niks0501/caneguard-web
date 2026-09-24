import test from "node:test";
import assert from "node:assert/strict";
import {
  contrastRatio,
  parseTokensCss,
  validateDashboardWrapRules,
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

test("validateDashboardWrapRules requires overflow-wrap on KPI text slots", () => {
  const passing = [
    ".kpi-card",
    ".kpi-card__value",
    ".kpi-card__comparison",
    ".kpi-card__scope",
    ".kpi-card__asof",
    ".kpi-card__footnote",
    ".kpi-card__segment-label",
  ]
    .map((selector) => `${selector} { overflow-wrap: anywhere; }`)
    .join("\n");
  assert.equal(validateDashboardWrapRules(passing).length, 0);

  const failing = ".kpi-card { display: flex; }\n.kpi-card__value { overflow-wrap: anywhere; }";
  const errors = validateDashboardWrapRules(failing);
  assert.ok(errors.length > 0);
  assert.match(errors[0], /kpi-card.*overflow-wrap/);
});
