import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  contrastRatio,
  parseThemeTokens,
  parseTokensCss,
  validateDashboardWrapRules,
  validateDarkKpiBandDistinction,
  validateDarkSemanticContrast,
  validateDarkThemeIsScreenOnly,
  validateDarkTokenParity,
  validateKpiBandDistinction,
  validateKpiCardFillRules,
  validateKpiSupportTooltip,
  validateNoPatternEncoding,
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
    .kpi-card__support { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
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

test("validateKpiCardFillRules requires the KPI graphic to absorb card height", () => {
  const passing = `
    .kpi-card__link { display: flex; height: 100%; }
    .kpi-card__graphic { display: flex; flex: 1 1 auto; }
  `;
  assert.equal(validateKpiCardFillRules(passing).length, 0);

  const failing = `
    .kpi-card__link { display: flex; }
    .kpi-card__graphic { display: flex; }
  `;
  const errors = validateKpiCardFillRules(failing);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((error) => /kpi-card__link.*height/.test(error)));
  assert.ok(errors.some((error) => /kpi-card__graphic.*flex/.test(error)));
});

const KPI_BAND_CSS = `
  .kpi-bar__track { gap: var(--kpi-band-gap); }
  .kpi-band-fill--1 {
    background-color: var(--kpi-band-1);
    border: var(--kpi-band-stroke) solid var(--color-surface);
  }
  .kpi-band-fill--2 {
    background-color: var(--kpi-band-2);
    border: var(--kpi-band-stroke) solid var(--color-surface);
  }
  .kpi-band-fill--3 {
    background-color: var(--kpi-band-3);
    border: var(--kpi-band-stroke) solid var(--color-surface);
  }
  .kpi-band-fill--4 {
    background-color: var(--kpi-band-4);
    border: var(--kpi-band-stroke) solid var(--color-surface);
  }
  .kpi-radial__separator { stroke: var(--color-surface); }
  .kpi-radial__slice { fill: none; stroke-width: 9; }
  .kpi-radial__slice--band-1 { stroke: var(--kpi-band-1); }
  .kpi-radial__slice--band-2 { stroke: var(--kpi-band-2); }
  .kpi-radial__slice--band-3 { stroke: var(--kpi-band-3); }
  .kpi-radial__slice--band-4 { stroke: var(--kpi-band-4); }
  .kpi-sparkline__halo { stroke: var(--color-surface); }
  .kpi-status__lane { background-color: var(--color-surface-tint); border: 1px solid var(--color-border-strong); }
  .kpi-status__mark { border: 2px solid var(--color-warning); }
`;

function bandTokens(bands) {
  return `
    :root {
      --color-surface: #ffffff;
      --color-warning: #6e5213;
      --kpi-band-1: ${bands[0]};
      --kpi-band-2: ${bands[1]};
      --kpi-band-3: ${bands[2]};
      --kpi-band-4: ${bands[3]};
    }
  `;
}

const SHIPPED_BANDS = ["#749926", "#1e452a", "#ae8a1b", "#45370b"];

test("validateKpiBandDistinction passes the shipped tuned solid band set", () => {
  const shipped = readFileSync(
    new URL("../src/styles/tokens.css", import.meta.url),
    "utf8",
  );
  const shippedCss = readFileSync(
    new URL("../src/index.css", import.meta.url),
    "utf8",
  );
  assert.deepEqual(validateKpiBandDistinction(shipped, shippedCss), []);
});

test("validateKpiBandDistinction rejects colour-only or textured bands", () => {
  // The shipped pre-fix brand ramp: neighbouring fills at 1.08-1.40:1.
  const ramp = bandTokens(["#1e452a", "#2d6b40", "#447a54", "#4d5c52"]);
  const rampErrors = validateKpiBandDistinction(ramp, KPI_BAND_CSS);
  assert.ok(rampErrors.length > 0);
  assert.ok(rampErrors.some((error) => /bands 1 and 2 are adjacent/.test(error)));

  // A band fill that vanishes on the card surface.
  const paleTokens = bandTokens(["#f6faf5", "#1e452a", "#ae8a1b", "#45370b"]);
  assert.ok(
    validateKpiBandDistinction(paleTokens, KPI_BAND_CSS).some((error) =>
      /--kpi-band-1' .*on '--color-surface'/.test(error),
    ),
  );

  // A band fill that swaps its flat solid for a texture.
  const texturedBand = KPI_BAND_CSS.replace(
    ".kpi-band-fill--2 {\n    background-color: var(--kpi-band-2);",
    ".kpi-band-fill--2 {\n    background-color: var(--kpi-band-2);\n    background-image: repeating-linear-gradient(45deg, var(--color-surface) 0 1px, transparent 1px 8px);",
  );
  assert.ok(
    validateKpiBandDistinction(SHIPPED_BANDS, texturedBand).some((error) =>
      /kpi-band-fill--2.*flat solid/.test(error),
    ),
  );

  // The radial: a flat colour creeping onto the base slice, and a band class
  // that stops naming its own solid.
  const flatSlice = KPI_BAND_CSS.replace(
    ".kpi-radial__slice { fill: none; stroke-width: 9; }",
    ".kpi-radial__slice { fill: none; stroke: var(--color-primary); }",
  );
  assert.ok(
    validateKpiBandDistinction(SHIPPED_BANDS, flatSlice).some((error) =>
      /kpi-radial__slice' must not paint its own colour/.test(error),
    ),
  );

  const missingBandSlice = KPI_BAND_CSS.replace(
    ".kpi-radial__slice--band-1 { stroke: var(--kpi-band-1); }",
    "",
  );
  assert.ok(
    validateKpiBandDistinction(SHIPPED_BANDS, missingBandSlice).some((error) =>
      /Missing '.kpi-radial__slice--band-1' rule/.test(error),
    ),
  );

  // The status lane must stay a flat solid rather than a hatch.
  const texturedLane = KPI_BAND_CSS.replace(
    ".kpi-status__lane { background-color: var(--color-surface-tint); border: 1px solid var(--color-border-strong); }",
    ".kpi-status__lane { background-image: repeating-linear-gradient(45deg, var(--color-border-strong) 0 1px, transparent 1px 7px); }",
  );
  assert.ok(
    validateKpiBandDistinction(SHIPPED_BANDS, texturedLane).some((error) =>
      /kpi-status__lane.*flat solid/.test(error),
    ),
  );

  const noGutter = KPI_BAND_CSS.replace(
    "gap: var(--kpi-band-gap);",
    "gap: 0;",
  );
  assert.ok(
    validateKpiBandDistinction(SHIPPED_BANDS, noGutter).some((error) =>
      /kpi-bar__track.*kpi-band-gap/.test(error),
    ),
  );
});

test("validateKpiSupportTooltip requires a clipped, hover- and focus-reachable, token-painted bubble", () => {
  const shippedCss = readFileSync(
    new URL("../src/index.css", import.meta.url),
    "utf8",
  );
  assert.deepEqual(validateKpiSupportTooltip(shippedCss), []);

  const passing = `
    .kpi-card__support--annotated { text-decoration: underline dotted var(--color-border-strong); }
    .kpi-card__support-tip { position: absolute; width: 1px; clip: rect(0, 0, 0, 0); border: 0; }
    .kpi-card__link:hover .kpi-card__support-tip,
    .kpi-card__link:focus-visible .kpi-card__support-tip {
      background: var(--color-surface);
      border: 1px solid var(--color-border-strong);
    }
  `;
  assert.deepEqual(validateKpiSupportTooltip(passing), []);

  // A bubble that is display:none drops out of the accessibility tree, so the
  // card link's aria-describedby would resolve to nothing.
  const removedFromTree = passing.replace(
    "clip: rect(0, 0, 0, 0);",
    "display: none;",
  );
  assert.ok(
    validateKpiSupportTooltip(removedFromTree).some((error) =>
      /display: none.*aria-describedby/.test(error),
    ),
  );

  // A tooltip reachable by hover alone strands keyboard users.
  const hoverOnly = passing.replace(
    ".kpi-card__link:focus-visible .kpi-card__support-tip",
    ".kpi-card__link--unused .kpi-card__support-tip",
  );
  assert.ok(
    validateKpiSupportTooltip(hoverOnly).some((error) =>
      /Missing tooltip reveal rule '.kpi-card__link:focus-visible/.test(error),
    ),
  );
});

test("validateNoPatternEncoding passes the shipped dashboard and rejects any pattern", () => {
  assert.deepEqual(validateNoPatternEncoding(), []);

  const dir = mkdtempSync(join(tmpdir(), "spine-pattern-"));
  writeFileSync(
    join(dir, "PatternedChart.tsx"),
    `
      export function PatternedChart() {
        return (
          <svg>
            <defs>
              <pattern id="pattern-x" patternUnits="userSpaceOnUse" />
            </defs>
            <rect fill="url(#pattern-x)" data-kpi-pattern="x/hatch" />
          </svg>
        );
      }
    `,
  );
  const errors = validateNoPatternEncoding(
    ".kpi-pattern__mark { fill: var(--color-surface); }",
    dir,
  );
  assert.ok(errors.some((error) => /must not use an SVG <pattern> definition/.test(error)));
  assert.ok(errors.some((error) => /must not use a patternUnits attribute/.test(error)));
  assert.ok(errors.some((error) => /must not use a url\(#…\) paint reference/.test(error)));
  assert.ok(errors.some((error) => /must not use a data-kpi-pattern attribute/.test(error)));
  assert.ok(errors.some((error) => /must not define '.kpi-pattern\*' rules/.test(error)));
});

const DARK_FIXTURE = `
  :root {
    --color-text: #1d2720;
    --color-surface: #ffffff;
  }
  @media screen {
    :root[data-theme="dark"] {
      --color-text: #ede9df;
      --color-surface: #20241f;
    }
  }
`;

test("parseThemeTokens keeps the paper and dark scopes apart", () => {
  const paper = parseThemeTokens(DARK_FIXTURE, "paper");
  const dark = parseThemeTokens(DARK_FIXTURE, "dark");

  assert.equal(paper["--color-text"], "#1d2720");
  assert.equal(paper["--color-surface"], "#ffffff");
  assert.equal(dark["--color-text"], "#ede9df");
  assert.equal(dark["--color-surface"], "#20241f");
  // The dark scope never inherits a paper declaration into its own block.
  assert.equal(dark["--color-muted"], undefined);
  assert.throws(() => parseThemeTokens(DARK_FIXTURE, "sepia"), /Unknown theme scope/);
});

test("validateSemanticContrast gates the paper scope, not the later dark block", () => {
  const shipped = readFileSync(
    new URL("../src/styles/tokens.css", import.meta.url),
    "utf8",
  );
  // The dark block redeclares --color-text and --color-surface; if the gate
  // read the last declaration it would be measuring dark values against paper
  // ones and passing by accident.
  assert.deepEqual(validateSemanticContrast(shipped), []);

  const failingPaper = `
    :root {
      --color-text: #eeeeee;
      --color-muted: #eeeeee;
      --color-secondary-text: #eeeeee;
      --color-page: #ffffff;
      --color-surface: #ffffff;
      --color-surface-soft: #ffffff;
    }
    @media screen {
      :root[data-theme="dark"] {
        --color-text: #ede9df;
        --color-muted: #b9b6a9;
        --color-page: #171a16;
        --color-surface: #20241f;
        --color-surface-soft: #2a2e28;
      }
    }
  `;
  const errors = validateSemanticContrast(failingPaper);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((error) => /Contrast failure for --color-text/.test(error)));
});

test("validateDarkSemanticContrast passes the shipped dark set and rejects a pale ink", () => {
  const shipped = readFileSync(
    new URL("../src/styles/tokens.css", import.meta.url),
    "utf8",
  );
  assert.deepEqual(validateDarkSemanticContrast(shipped), []);

  const missing = validateDarkSemanticContrast(":root { --color-text: #1d2720; }");
  assert.ok(missing.some((error) => /Missing the dark token block/.test(error)));

  const paleInk = shipped.replace(
    "--color-text: #ede9df;",
    "--color-text: #3a443c;",
  );
  const errors = validateDarkSemanticContrast(paleInk);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((error) => /Dark contrast failure for --color-text/.test(error)));

  const paleSecondary = shipped.replace(
    "--color-secondary-text: #b9b6a9;",
    "--color-secondary-text: #4a5650;",
  );
  assert.ok(
    validateDarkSemanticContrast(paleSecondary).some((error) =>
      /Dark contrast failure for --color-secondary-text/.test(error),
    ),
  );
});

test("validateDarkKpiBandDistinction rejects dark bands that vanish or merge", () => {
  const shipped = readFileSync(
    new URL("../src/styles/tokens.css", import.meta.url),
    "utf8",
  );
  assert.deepEqual(validateDarkKpiBandDistinction(shipped), []);

  // The paper deep tones on the dark surface: every band disappears.
  const vanished = shipped
    .replace("--kpi-band-1: #5f7f5b;", "--kpi-band-1: #1d2720;")
    .replace("--kpi-band-2: #cfe0c6;", "--kpi-band-2: #2f3831;");
  const vanishedErrors = validateDarkKpiBandDistinction(vanished);
  assert.ok(vanishedErrors.some((error) => /Dark KPI band '--kpi-band-1'/.test(error)));
  assert.ok(vanishedErrors.some((error) => /Dark KPI band '--kpi-band-2'/.test(error)));

  const merged = shipped.replace("--kpi-band-2: #cfe0c6;", "--kpi-band-2: #5f7f5b;");
  assert.ok(
    validateDarkKpiBandDistinction(merged).some((error) =>
      /Dark KPI bands 1 and 2 are adjacent/.test(error),
    ),
  );

  const sparkMerge = shipped.replace("--kpi-band-1: #5f7f5b;", "--kpi-band-1: #b9dcc0;");
  assert.ok(
    validateDarkKpiBandDistinction(sparkMerge).some((error) =>
      /Dark sparkline area .* are/.test(error),
    ),
  );
});

test("validateDarkThemeIsScreenOnly keeps print on paper", () => {
  const shipped = readFileSync(
    new URL("../src/styles/tokens.css", import.meta.url),
    "utf8",
  );
  assert.deepEqual(validateDarkThemeIsScreenOnly(shipped), []);

  const escaped = `
    :root[data-theme="dark"] {
      --color-text: #ede9df;
    }
  `;
  const errors = validateDarkThemeIsScreenOnly(escaped);
  assert.ok(errors.some((error) => /must sit inside '@media screen'/.test(error)));

  // A dark block that also leaks a copy outside the screen block is the same
  // regression: printing would pick up the dark page again.
  const leaked = `${DARK_FIXTURE}
    :root[data-theme="dark"] { --color-surface: #20241f; }
  `;
  assert.ok(
    validateDarkThemeIsScreenOnly(leaked).some((error) =>
      /must only be declared inside '@media screen'/.test(error),
    ),
  );
});

test("validateDarkTokenParity requires a dark value for every flippable colour", () => {
  const shipped = readFileSync(
    new URL("../src/styles/tokens.css", import.meta.url),
    "utf8",
  );
  assert.deepEqual(validateDarkTokenParity(shipped), []);

  const missing = shipped.replace(
    "    --color-surface-soft: #2a2e28;",
    "",
  );
  assert.ok(
    validateDarkTokenParity(missing).some((error) =>
      /Colour token '--color-surface-soft' has no dark value/.test(error),
    ),
  );

  // The values that stay identical in both themes are exempt on purpose.
  assert.ok(
    !validateDarkTokenParity(shipped).some((error) =>
      /--color-inverse-text|--color-accent/.test(error),
    ),
  );
});
