import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(SCRIPT_ROOT, "src");
const TOKENS_PATH = join(SRC_DIR, "styles", "tokens.css");

// Allowed font weights loaded from Google Fonts (Poppins 400, 500, 600, 700)
const ALLOWED_FONT_WEIGHTS = new Set(["400", "500", "600", "700"]);

function getAllCssFiles(dir = SRC_DIR, list = []) {
  for (const file of readdirSync(dir)) {
    const fullPath = join(dir, file);
    if (statSync(fullPath).isDirectory()) {
      getAllCssFiles(fullPath, list);
    } else if (file.endsWith(".css")) {
      list.push(fullPath);
    }
  }
  return list;
}

function parseHex(hex) {
  let clean = hex.replace(/^#/, "");
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length !== 6) return null;
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function channelLuminance(val) {
  const srgb = val / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb) {
  return (
    0.2126 * channelLuminance(rgb.r) +
    0.7152 * channelLuminance(rgb.g) +
    0.0722 * channelLuminance(rgb.b)
  );
}

export function contrastRatio(hex1, hex2) {
  const rgb1 = parseHex(hex1);
  const rgb2 = parseHex(hex2);
  if (!rgb1 || !rgb2) return 0;
  const l1 = relativeLuminance(rgb1);
  const l2 = relativeLuminance(rgb2);
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (brighter + 0.05) / (darker + 0.05);
}

export function parseTokensCss(content) {
  const tokens = {};
  const tokenRegex = /(--[a-zA-Z0-9_-]+):\s*([^;]+);/g;
  let match;
  while ((match = tokenRegex.exec(content)) !== null) {
    tokens[match[1].trim()] = match[2].trim();
  }
  return tokens;
}

export function validateDesignTokens(cssFiles = getAllCssFiles()) {
  const errors = [];

  for (const filePath of cssFiles) {
    const isTokensFile = filePath === TOKENS_PATH;
    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const stripped = line.trim();
      if (stripped.startsWith("/*") || stripped.startsWith("*")) return;

      // Check font weights
      const fwMatch = line.match(/font-weight:\s*(\d+)/);
      if (fwMatch) {
        const weight = fwMatch[1];
        if (!ALLOWED_FONT_WEIGHTS.has(weight)) {
          errors.push(
            `${filePath}:${lineNum} Unloaded font-weight '${weight}' (allowed: 400, 500, 600, 700)`
          );
        }
      }

      // Check CSS-injected user-visible copy (E12 / A5)
      const contentMatch = line.match(/content:\s*["']([A-Za-z0-9 /]{3,})["']/);
      if (contentMatch) {
        errors.push(
          `${filePath}:${lineNum} CSS-injected user-visible copy: "${contentMatch[1]}"`
        );
      }

      // If outside tokens.css, check for literal hex, font-size, and border-radius
      if (!isTokensFile) {
        // Literal hex colors
        const hexMatches = line.match(/#[0-9a-fA-F]{3,8}/g);
        if (hexMatches) {
          for (const hex of hexMatches) {
            errors.push(
              `${filePath}:${lineNum} Literal hex color '${hex}' outside tokens.css`
            );
          }
        }

        // Literal font-size
        const fsMatch = line.match(/font-size:\s*([0-9.]+(px|rem|pt))/);
        if (fsMatch) {
          errors.push(
            `${filePath}:${lineNum} Literal font-size '${fsMatch[1]}' outside tokens.css`
          );
        }

        // Literal border-radius (ignoring 0, 50%, inherit)
        const brMatch = line.match(/border-radius:\s*([0-9.]+(px|rem))/);
        if (brMatch && brMatch[1] !== "0px") {
          errors.push(
            `${filePath}:${lineNum} Literal border-radius '${brMatch[1]}' outside tokens.css`
          );
        }
      }
    });
  }

  return errors;
}

export function validateSemanticContrast(tokensContent = readFileSync(TOKENS_PATH, "utf8")) {
  const errors = [];
  const tokens = parseTokensCss(tokensContent);

  const semanticPairs = [
    { fg: "--color-text", bg: "--color-surface", min: 4.5 },
    { fg: "--color-text", bg: "--color-surface-soft", min: 4.5 },
    { fg: "--color-text", bg: "--color-page", min: 4.5 },
    { fg: "--color-muted", bg: "--color-surface", min: 4.5 },
    { fg: "--color-muted", bg: "--color-surface-soft", min: 4.5 },
    { fg: "--color-muted", bg: "--color-page", min: 4.5 },
  ];

  if (tokens["--color-secondary-text"]) {
    semanticPairs.push(
      { fg: "--color-secondary-text", bg: "--color-surface", min: 4.5 },
      { fg: "--color-secondary-text", bg: "--color-surface-soft", min: 4.5 },
      { fg: "--color-secondary-text", bg: "--color-page", min: 4.5 }
    );
  }

  for (const { fg, bg, min } of semanticPairs) {
    const fgVal = tokens[fg];
    const bgVal = tokens[bg];
    if (!fgVal || !bgVal) {
      errors.push(`Missing token for pair ${fg} (${fgVal}) on ${bg} (${bgVal})`);
      continue;
    }
    const ratio = contrastRatio(fgVal, bgVal);
    if (ratio < min) {
      errors.push(
        `Contrast failure for ${fg} (${fgVal}) on ${bg} (${bgVal}): ${ratio.toFixed(2)}:1 (required >= ${min}:1)`
      );
    }
  }

  return errors;
}

/**
 * Dashboard solid fill guard (overhaul §3.8 + risk 7).
 *
 * Every dashboard mark that splits one whole into ordered parts — the KPI
 * waiting-age radial, the field-validation schedule bar, the decision-chart
 * series and every legend swatch — paints one flat solid from the four-step
 * `--kpi-band-<N>` ramp. The plan measured the shipped brand ramp's
 * neighbouring fills at 1.08–1.40:1, and a hatch pattern used to carry the
 * split; both are gone. These rules keep the solid replacement honest: the
 * four fills must each clear 3:1 against `--color-surface`, every neighbouring
 * pair must clear 3:1 too — including the radial ring's 4-1 join, because a
 * ring's last band touches its first — every band fill and radial slice must
 * be that band's own flat solid rather than a texture, the separator strokes
 * must stay token-driven, and no pattern may return.
 */
export const KPI_BAND_FILL_TOKENS = [
  "--kpi-band-1",
  "--kpi-band-2",
  "--kpi-band-3",
  "--kpi-band-4",
];
export const KPI_BAND_ADJACENT_PAIRS = [
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 1],
];
export const KPI_BAND_MIN_CONTRAST = 3;

/**
 * The one solid fill class every dashboard band paints: a KPI bar segment, a
 * radial slice's band rule, a decision-chart mark and every legend swatch all
 * resolve through it, so a legend can never drift from the chart it explains.
 */
export const KPI_BAND_FILL_CLASSES = KPI_BAND_FILL_TOKENS.map(
  (_, index) => `.kpi-band-fill--${index + 1}`,
);

/** Sparkline tones: the area fill against the series line over it. */
export const SPARKLINE_ADJACENT_TOKENS = ["--kpi-band-1", "--color-primary-dark"];

/**
 * Assert one selector paints a flat solid and draws no texture.
 *
 * A missing fill token is the colour-only regression; a `background-image` is
 * the pattern regression this task removed.
 */
function assertSolidFill(errors, cssContent, selector, token) {
  const block = blockForSelector(cssContent, selector);
  if (block === null) {
    errors.push(`Missing flat solid rule for '${selector}'`);
    return;
  }
  if (!block.includes(`var(${token})`)) {
    errors.push(`'${selector}' must paint the flat solid 'var(${token})'`);
  }
  if (/background-image\s*:/.test(block)) {
    errors.push(`'${selector}' must be a flat solid, not a texture`);
  }
}

export function validateKpiBandDistinction(
  tokensContent = readFileSync(TOKENS_PATH, "utf8"),
  cssContent = readFileSync(join(SRC_DIR, "index.css"), "utf8"),
) {
  const errors = [];
  const tokens = parseTokensCss(tokensContent);
  const surface = tokens["--color-surface"];

  if (!surface) {
    errors.push("Missing '--color-surface' for the KPI band contrast check");
  }

  for (const token of KPI_BAND_FILL_TOKENS) {
    const value = tokens[token];
    if (!value) {
      errors.push(`Missing KPI band token '${token}'`);
      continue;
    }
    if (!surface) continue;
    const ratio = contrastRatio(value, surface);
    if (ratio < KPI_BAND_MIN_CONTRAST) {
      errors.push(
        `KPI band '${token}' (${value}) on '--color-surface' (${surface}) is ${ratio.toFixed(2)}:1 (required >= ${KPI_BAND_MIN_CONTRAST}:1)`,
      );
    }
  }

  for (const [a, b] of KPI_BAND_ADJACENT_PAIRS) {
    const va = tokens[`--kpi-band-${a}`];
    const vb = tokens[`--kpi-band-${b}`];
    if (!va || !vb) continue;
    const ratio = contrastRatio(va, vb);
    if (ratio < KPI_BAND_MIN_CONTRAST) {
      errors.push(
        `KPI bands ${a} and ${b} are adjacent (or join across the ring): ${ratio.toFixed(2)}:1 (required >= ${KPI_BAND_MIN_CONTRAST}:1)`,
      );
    }
  }

  const [sparkFill, sparkLine] = SPARKLINE_ADJACENT_TOKENS;
  if (tokens[sparkFill] && tokens[sparkLine]) {
    const ratio = contrastRatio(tokens[sparkFill], tokens[sparkLine]);
    if (ratio < KPI_BAND_MIN_CONTRAST) {
      errors.push(
        `Sparkline area '${sparkFill}' and line '${sparkLine}' are ${ratio.toFixed(2)}:1 (required >= ${KPI_BAND_MIN_CONTRAST}:1)`,
      );
    }
  }

  // The bar: a real gutter plus a --color-surface stroke, and one flat solid
  // per band straight from that band's own token.
  const track = blockForSelector(cssContent, ".kpi-bar__track");
  if (track === null || !/gap\s*:\s*var\(--kpi-band-gap\)/.test(track)) {
    errors.push(
      "'.kpi-bar__track' must set 'gap: var(--kpi-band-gap)' between bands",
    );
  }

  const bandStroke = blockForSelector(cssContent, ".kpi-band-fill--1");
  if (bandStroke === null || !/border[^;]*var\(--color-surface\)/.test(bandStroke)) {
    errors.push(
      "KPI bar bands must carry a '--color-surface' separator stroke",
    );
  }

  KPI_BAND_FILL_TOKENS.forEach((token, index) => {
    assertSolidFill(
      errors,
      cssContent,
      KPI_BAND_FILL_CLASSES[index],
      token,
    );
  });

  // The radial: a --color-surface separator ring under every band, and one
  // flat band solid on each slice band class instead of a pattern paint.
  const separator = blockForSelector(cssContent, ".kpi-radial__separator");
  if (
    separator === null ||
    !/stroke\s*:\s*var\(--color-surface\)/.test(separator)
  ) {
    errors.push(
      "'.kpi-radial__separator' must draw a '--color-surface' separator ring",
    );
  }
  const slice = blockForSelector(cssContent, ".kpi-radial__slice");
  if (slice === null) {
    errors.push("Missing '.kpi-radial__slice' rule");
  } else if (/(?:^|[;{\s])stroke\s*:/.test(slice)) {
    errors.push(
      "'.kpi-radial__slice' must not paint its own colour; each band class supplies the band solid",
    );
  }
  KPI_BAND_FILL_TOKENS.forEach((token, index) => {
    const selector = `.kpi-radial__slice--band-${index + 1}`;
    const block = blockForSelector(cssContent, selector);
    if (block === null) {
      errors.push(`Missing '${selector}' rule`);
    } else if (!block.includes(`var(${token})`)) {
      errors.push(`'${selector}' must paint the flat solid 'var(${token})'`);
    }
  });

  // The sibling KPI graphics: the sparkline's tone pair is separated by a
  // surface halo, and the status lane is a flat solid rather than a hatch.
  const halo = blockForSelector(cssContent, ".kpi-sparkline__halo");
  if (halo === null || !/stroke\s*:\s*var\(--color-surface\)/.test(halo)) {
    errors.push(
      "'.kpi-sparkline__halo' must separate the sparkline line from its area",
    );
  }
  assertSolidFill(
    errors,
    cssContent,
    ".kpi-status__lane",
    "--color-surface-tint",
  );
  const statusMark = blockForSelector(cssContent, ".kpi-status__mark");
  if (statusMark === null || !/var\(--color-warning\)/.test(statusMark)) {
    errors.push("'.kpi-status__mark' must ring its icon in '--color-warning'");
  }

  return errors;
}

/**
 * No-pattern guard: the dashboard draws solids only.
 *
 * Patterns are gone from every KPI graphic, decision chart, legend and the map
 * symbology, so no `<pattern>` definition, `patternUnits` attribute, pattern
 * id helper, `url(#…)` paint reference or MapLibre `fill-pattern` may survive
 * in the shipped dashboard components or in the dashboard CSS. The decorative
 * auth page background gradients are page chrome, not a data encoding, and
 * stay. Test files are exempt, because the visual tests exist to assert these
 * exact strings are absent.
 */
export function validateNoPatternEncoding(
  cssContent = readFileSync(join(SRC_DIR, "index.css"), "utf8"),
  dashboardDir = join(SRC_DIR, "components", "dashboard"),
) {
  const errors = [];
  const forbidden = [
    { pattern: /<pattern[\s>]/, what: "an SVG <pattern> definition" },
    { pattern: /patternUnits/, what: "a patternUnits attribute" },
    { pattern: /data-kpi-pattern/, what: "a data-kpi-pattern attribute" },
    {
      pattern: /kpiBandPatternId|kpiBandSignature|patternIdFor/,
      what: "a pattern id helper",
    },
    { pattern: /url\(#/, what: "a url(#…) paint reference" },
    { pattern: /fill-pattern/, what: "a MapLibre fill-pattern" },
  ];

  for (const entry of readdirSync(dashboardDir)) {
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry)) continue;
    const content = readFileSync(join(dashboardDir, entry), "utf8");
    for (const { pattern, what } of forbidden) {
      if (pattern.test(content)) {
        errors.push(`components/dashboard/${entry} must not use ${what}`);
      }
    }
  }

  if (/\.kpi-pattern/.test(cssContent)) {
    errors.push("index.css must not define '.kpi-pattern*' rules any more");
  }

  const solidSelectors = [
    ...KPI_BAND_FILL_CLASSES,
    ...KPI_BAND_FILL_TOKENS.map((_, index) => `.kpi-radial__slice--band-${index + 1}`),
    ".kpi-status__lane",
  ];
  for (const selector of solidSelectors) {
    const block = blockForSelector(cssContent, selector);
    if (block !== null && /background-image\s*:|repeating-linear-gradient|\.kpi-pattern/.test(block)) {
      errors.push(`'${selector}' must be a flat solid, not a texture`);
    }
  }

  return errors;
}

/**
 * Layout-track guard (P0 grid rhythm + §13.2 long identifiers).
 *
 * The dashboard grid, its cards and the report table expose unbreakable
 * identifiers (e.g. summary.queues.unverified_no_active_work) and long
 * barangay names, so every track keeps `min-width: 0` and
 * `max-width: 100%`; the text slots inside a track additionally wrap
 * anywhere. A missing rule here is a real sideways-push bug, not a style
 * preference.
 */
const DASHBOARD_TRACK_SELECTORS = [
  ".dashboard-grid > *",
  ".dashboard-section",
  ".dashboard-section__heading > *",
  ".dashboard-card",
  ".kpi-card",
  ".kpi-card__label",
  ".kpi-card__value",
  ".kpi-card__support",
  ".decision-chart-card",
  ".decision-chart-card__title",
  ".decision-chart-card__hint",
  ".dashboard-report-table",
  ".dashboard-report-table th",
  ".dashboard-report-table td",
];

/** Slots whose own text must wrap instead of widening its track. */
const DASHBOARD_WRAP_SELECTORS = [
  ".kpi-card__label",
  ".kpi-card__value",
  ".kpi-card__support",
  ".decision-chart-card__title",
  ".decision-chart-card__hint",
  ".dashboard-report-table th",
  ".dashboard-report-table td",
];

function blockForSelector(cssContent, selector) {
  // Match the selector as a whole token: a rule boundary (start of file, `}`
  // or `,`) before it and `{` or `,` after it, so `.dashboard-section`
  // never matches `.dashboard-section-heading`.
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|[}{,])\\s*${escaped}\\s*(?=[,{])`, "m");
  const match = pattern.exec(cssContent);
  if (!match) return null;
  const open = cssContent.indexOf("{", match.index);
  if (open === -1) return null;
  const close = cssContent.indexOf("}", open);
  return cssContent.slice(open, close + 1);
}

export function validateDashboardWrapRules(
  cssContent = readFileSync(join(SRC_DIR, "index.css"), "utf8"),
) {
  const errors = [];
  for (const selector of DASHBOARD_TRACK_SELECTORS) {
    const block = blockForSelector(cssContent, selector);
    if (block === null) {
      errors.push(`Missing dashboard layout rule for '${selector}'`);
      continue;
    }
    if (!/min-width\s*:\s*0/.test(block)) {
      errors.push(`Dashboard track '${selector}' must set 'min-width: 0'`);
    }
    if (!/max-width\s*:\s*100%/.test(block)) {
      errors.push(`Dashboard track '${selector}' must set 'max-width: 100%'`);
    }
  }
  for (const selector of DASHBOARD_WRAP_SELECTORS) {
    const block = blockForSelector(cssContent, selector);
    if (block === null) {
      errors.push(`Missing dashboard wrap rule for '${selector}'`);
      continue;
    }
    if (!/overflow-wrap\s*:\s*anywhere/.test(block)) {
      errors.push(
        `Dashboard wrap rule '${selector}' must set 'overflow-wrap: anywhere'`,
      );
    }
  }
  return errors;
}

/**
 * Report-table pill guard (dashboard P0A follow-up).
 *
 * The Possible Condition and Work status columns hold badges, not prose, so
 * their cells must size to their content and never wrap: the longest real
 * strings ("No supported disease detected", "Needs field validation") have to
 * stay on one line, with the card's horizontal scroll as the small-screen
 * escape. A missing rule here silently squashes a real badge onto two lines.
 */
export const REPORT_TABLE_PILL_SELECTORS = [
  ".dashboard-report-table__cell-condition",
  ".dashboard-report-table__cell-status",
];

export function validateReportTablePillRules(
  cssContent = readFileSync(join(SRC_DIR, "index.css"), "utf8"),
) {
  const errors = [];
  for (const selector of REPORT_TABLE_PILL_SELECTORS) {
    const block = blockForSelector(cssContent, selector);
    if (block === null) {
      errors.push(`Missing report-table pill rule for '${selector}'`);
      continue;
    }
    if (!/white-space\s*:\s*nowrap/.test(block)) {
      errors.push(`Pill column '${selector}' must set 'white-space: nowrap'`);
    }
    if (!/min-width\s*:\s*max-content/.test(block)) {
      errors.push(
        `Pill column '${selector}' must set 'min-width: max-content'`,
      );
    }
  }
  const scrollBlock = blockForSelector(cssContent, ".table-scroll");
  if (scrollBlock === null || !/overflow-x\s*:\s*auto/.test(scrollBlock)) {
    errors.push(
      "'.table-scroll' must keep 'overflow-x: auto' as the small-screen escape",
    );
  }
  return errors;
}

/**
 * KPI card fill guard (overhaul §3.2 card composition).
 *
 * Each KPI card is header row, large value, supporting line and graphic, with
 * the card itself as the action. The graphic therefore owns the leftover card
 * height: when one card in the 4-up band is taller, the others must fill rather
 * than leave their graphic floating at the top and the band half empty.
 */
const KPI_CARD_FILL_RULES = [
  {
    selector: ".kpi-card__link",
    requirement: /height\s*:\s*100%/,
    message: "'.kpi-card__link' must set 'height: 100%' to fill the card",
  },
  {
    selector: ".kpi-card__graphic",
    requirement: /flex\s*:\s*1 1 auto/,
    message:
      "'.kpi-card__graphic' must set 'flex: 1 1 auto' to absorb the card's spare height",
  },
];

export function validateKpiCardFillRules(
  cssContent = readFileSync(join(SRC_DIR, "index.css"), "utf8"),
) {
  const errors = [];
  for (const { selector, requirement, message } of KPI_CARD_FILL_RULES) {
    const block = blockForSelector(cssContent, selector);
    if (block === null || !requirement.test(block)) {
      errors.push(message);
    }
  }
  return errors;
}

export function assertDesignSpine() {
  const tokenErrors = validateDesignTokens();
  const contrastErrors = validateSemanticContrast();
  const bandErrors = validateKpiBandDistinction();
  const patternErrors = validateNoPatternEncoding();
  const wrapErrors = validateDashboardWrapRules();
  const pillErrors = validateReportTablePillRules();
  const kpiErrors = validateKpiCardFillRules();
  const allErrors = [
    ...tokenErrors,
    ...contrastErrors,
    ...bandErrors,
    ...patternErrors,
    ...wrapErrors,
    ...pillErrors,
    ...kpiErrors,
  ];

  if (allErrors.length > 0) {
    throw new Error(
      `Design spine validation failed with ${allErrors.length} violation(s):\n- ` +
        allErrors.slice(0, 30).join("\n- ") +
        (allErrors.length > 30 ? `\n... and ${allErrors.length - 30} more.` : "")
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    assertDesignSpine();
    console.log("Design spine validation passed: no un-tokenized styles, valid font-weights, and WCAG AA contrast satisfied.");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
