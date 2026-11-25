import type { FieldGuideSource, FieldGuideSourceId } from './types';

/**
 * The documents the gallery cites.
 *
 * Only links the captain's launch brief lists as verified are registered as
 * `published`. Researcher-supplied documents that are still missing are
 * registered as `awaiting-supply` with `url: null`, so the reading surface can
 * show the citation and an honest "not supplied yet" row instead of a dead
 * link or a silently omitted source.
 */
const SOURCES: readonly FieldGuideSource[] = [
  {
    id: 'sra-rssi-profile',
    title: 'Red-Striped Soft Scale Insect (RSSI) in Sugarcane: Pest Profile and Pest Management Recommendation',
    publisher: 'Sugar Regulatory Administration (SRA), Philippines',
    url: 'https://www.sra.gov.ph/article/red-striped-soft-scale-insect-rssi-in-sugarcane-pest-profile-and-pest-management-recommendation/HLNwOhbTgYVglRl',
    passage: null,
    supports:
      'Philippine pest profile and the official recommendation route for RSSI. The article body is image-based, so this app has not text-verified every statement against it.',
    availability: 'published',
    publishedDate: null,
  },
  {
    id: 'sra-rssi-awareness',
    title: 'SRA awareness campaign on Red-Striped Soft Scale Insect (RSSI)',
    publisher: 'Sugar Regulatory Administration (SRA), Philippines',
    url: 'https://www.sra.gov.ph/article/sra-awareness-campaign-on-red-striped-soft-scale-insect-rssi/pV352Fkalf1FVkv',
    passage: null,
    supports:
      'Field-edge vigilance, reporting and prevention messages for RSSI in the Philippines.',
    availability: 'published',
    publishedDate: null,
  },
  {
    id: 'lsu-idm',
    title: 'Integrated Disease Management of Sugarcane',
    publisher: 'LSU AgCenter, Louisiana, United States',
    url: 'https://www.lsuagcenter.com/profiles/lblack/articles/page1485980431119',
    passage: null,
    supports:
      'General integrated disease management: healthy planting material, resistant varieties and monitoring. Louisiana findings are not Philippine registration or approval.',
    availability: 'published',
    publishedDate: null,
  },
  {
    id: 'sra-rusts',
    title: 'Rusts (diseases of sugarcane)',
    publisher: 'Sugar Research Australia (SRA), Australia',
    url: 'https://sugarresearch.com.au/diseases/rusts/',
    passage: null,
    supports:
      'Rust symptoms, the brown-versus-orange educational distinction and the role of resistant varieties. Australian findings are not Philippine registration or approval.',
    availability: 'published',
    publishedDate: null,
  },
  {
    id: 'sra-mosaic',
    title: 'Sugarcane mosaic (information sheet, 2022)',
    publisher: 'Sugar Research Australia (SRA), Australia',
    url: 'https://sugarresearch.com.au/wp-content/uploads/2025/04/Mosaic_2022.pdf',
    passage: null,
    supports:
      'Mosaic symptoms, aphid and planting-material spread, disease-free seed and the limits of roguing. Australian findings are not Philippine registration or approval.',
    availability: 'published',
    publishedDate: '2022',
  },
  {
    id: 'fpa-registered-products',
    title: 'Registered Products',
    publisher: 'Fertilizer and Pesticide Authority (FPA), Department of Agriculture, Philippines',
    url: 'https://fpa.da.gov.ph/resources/reports/registered-products/',
    passage: null,
    supports:
      'The official Philippine register to check before any product is considered. A registration entry is not a recommendation for RSSI or for this farm.',
    availability: 'published',
    publishedDate: null,
  },
  {
    id: 'sra-booklet-smut',
    title: 'Ang Mga Pangunahing Sakit ng Halamang Tubo: Smut (booklet, pages 21-22)',
    publisher:
      'Sugar Regulatory Administration (SRA), Extension Services Division, Luzon and Mindanao, Philippines',
    url: null,
    passage: 'pages 21-22',
    supports:
      'Primary source for the smut entry: the whip, how spores spread, other host grasses, and control steps. Printed booklet, no web link.',
    availability: 'published',
    publishedDate: null,
  },
  {
    id: 'sra-brochure-rssi-2025',
    title: 'Red-Striped Soft Scale Insect brochure (2025)',
    publisher: 'Sugar Regulatory Administration (SRA), Philippines',
    url: null,
    passage: null,
    supports:
      'Requested 2025 brochure. Until it arrives this guide gives no life-stage timing for RSSI.',
    availability: 'awaiting-supply',
    publishedDate: '2025',
  },
  {
    id: 'sra-brochure-rssi-2026',
    title: 'Red-Striped Soft Scale Insect brochure (2026)',
    publisher: 'Sugar Regulatory Administration (SRA), Philippines',
    url: null,
    passage: null,
    supports:
      'Requested 2026 brochure. Until it arrives this guide gives no life-stage timing for RSSI.',
    availability: 'awaiting-supply',
    publishedDate: '2026',
  },
];

const sourcesById = new Map<FieldGuideSourceId, FieldGuideSource>(
  SOURCES.map((source) => [source.id, source]),
);

export const fieldGuideSources: readonly FieldGuideSource[] = SOURCES;

/** `null` for an unknown id, so a broken citation is visible instead of silent. */
export function findFieldGuideSource(id: FieldGuideSourceId): FieldGuideSource | null {
  return sourcesById.get(id) ?? null;
}

/** The sources of one entry, in the entry's display order, skipping unknown ids. */
export function sourcesForEntry(
  sourceIds: readonly FieldGuideSourceId[],
): readonly FieldGuideSource[] {
  return sourceIds
    .map((id) => findFieldGuideSource(id))
    .filter((source): source is FieldGuideSource => source !== null);
}
