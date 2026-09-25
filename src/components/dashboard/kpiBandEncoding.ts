/**
 * Shared band encoding for the compact KPI graphics (overhaul §3.8 + risk 7).
 *
 * Every part-of-whole KPI graphic — the waiting-age radial meter and the
 * field-validation schedule bar — splits one whole into up to four ordered
 * bands. Colour alone cannot separate them: the plan measured the shipped
 * brand ramp's neighbouring fills at 1.08–1.40:1, so the band fills live in
 * `tokens.css` as a tuned four-step set that clears the 3:1 adjacent rule
 * (asserted by `npm run test:design-spine`), and each band additionally
 * carries its own hatch tile AND a surface separator (see the `.kpi-radial*`
 * and `.kpi-bar*` rules in `index.css`).
 *
 * The four tile geometries below are the encoding's non-colour channel: dots,
 * a single diagonal, a cross-hatch and a grid. They are deliberately
 * different *shapes*, not the same hatch at different opacities, so a
 * reader who cannot separate the fills can still separate the bands, and the
 * card's accessible name repeats every label and count in text.
 */

/** Number of encodable bands; band N uses `--kpi-band-<N>`. */
export const KPI_BAND_COUNT = 4;

export interface KpiBand {
  /** 1-based band position, matching `--kpi-band-<band>`. */
  band: 1 | 2 | 3 | 4;
  /** Pattern tile edge in user units. */
  size: number;
  /** Straight tile strokes drawn in the hatch ink. */
  paths: string[];
  /** Adds one dot at the tile centre, drawn in the hatch ink. */
  dot: boolean;
}

/**
 * Ordered band tiles: sparse dot, single diagonal, cross-hatch, grid. Each
 * entry is a distinct shape signature, so no two bands share a texture.
 */
export const KPI_BANDS: readonly KpiBand[] = [
  { band: 1, size: 8, paths: [], dot: true },
  { band: 2, size: 8, paths: ["M0 8 L8 0"], dot: false },
  { band: 3, size: 8, paths: ["M0 8 L8 0", "M0 0 L8 8"], dot: false },
  {
    band: 4,
    size: 8,
    paths: ["M4 0 L4 8", "M0 4 L8 4"],
    dot: false,
  },
];

/** The band for a zero-based segment index, wrapping after the fourth. */
export function kpiBandForIndex(index: number): KpiBand {
  const position = ((index % KPI_BAND_COUNT) + KPI_BAND_COUNT) % KPI_BAND_COUNT;
  return KPI_BANDS[position];
}

/**
 * A scope-unique pattern id. Two KPI graphics can be mounted at once, so the
 * caller passes `useId()` output; ids stay `[A-Za-z0-9_-]` so they survive
 * `url(#…)` references.
 */
export function kpiBandPatternId(scope: string, band: number): string {
  const safeScope = scope.replace(/[^a-zA-Z0-9_-]/g, "");
  return `kpi-band-${safeScope}-${band}`;
}

/** Stable, structural signature of one band's tile (used by tests/tooling). */
export function kpiBandSignature(band: KpiBand): string {
  const shape = band.dot ? "dot" : band.paths.join(" ");
  return `${band.band}/${band.size}/${shape}`;
}
