/**
 * Shared solid fill ramp for the dashboard graphics.
 *
 * Every dashboard mark that splits one whole into ordered parts paints a flat
 * solid from the four-step `--kpi-band-<N>` ramp in `tokens.css`: the KPI
 * waiting-age radial, the field-validation schedule bar, the decision charts
 * and their legends all index into the same ordered band sequence. The ramp
 * alternates a lighter and a darker stop — deepened brand tones on paper, mid
 * and pale tones on the dark set — so every *neighbouring* pair clears the 3:1
 * adjacent-fill rule — including the radial ring's 4-1 join, because a ring's
 * last band touches its first — and every fill also clears 3:1 against the
 * card surface (`npm run test:design-spine` fails if any of those regress).
 *
 * There is no non-colour channel left: no pattern, hatch or texture is drawn.
 * Separation rests on hue and lightness alone, so every graphic keeps its
 * direct labels, printed counts, legend entries and accessible name — nothing
 * is ever read by fill colour only.
 *
 * Light bands are fills only, never text.
 */

/** Number of encodable bands; band N uses `--kpi-band-<N>`. */
export const KPI_BAND_COUNT = 4;

/** 1-based band position, matching `--kpi-band-<band>`. */
export type KpiBand = 1 | 2 | 3 | 4;

/** The ordered ramp: deepened light, deep, deepened light, deep. */
export const KPI_BANDS: readonly KpiBand[] = [1, 2, 3, 4];

/** The band for a zero-based segment index, wrapping after the fourth. */
export function kpiBandForIndex(index: number): KpiBand {
  const position = ((index % KPI_BAND_COUNT) + KPI_BAND_COUNT) % KPI_BAND_COUNT;
  return KPI_BANDS[position];
}

/** The `--kpi-band-<band>` custom property name for a band. */
export function kpiBandFillToken(band: KpiBand): string {
  return `--kpi-band-${band}`;
}

/** The solid fill class for a band: `kpi-band-fill--<band>`. */
export function kpiBandFillClass(band: KpiBand): string {
  return `kpi-band-fill--${band}`;
}
