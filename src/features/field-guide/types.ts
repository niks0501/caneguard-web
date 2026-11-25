/**
 * Field Guide content model.
 *
 * Ported from the CaneGuard Mobile Field Guide (mobile commit 9c7815f,
 * `src/features/field-guide`). Keep `contentVersion` in step with the mobile
 * entry it came from, so the two copies can be compared until the office
 * authoring API serves one shared copy.
 */

export type FieldGuideCategory = "healthy" | "disease" | "pest";

/** Stable, URL-safe identifier, never reused. Examples: `rust`, `rssi`. */
export type FieldGuideEntryId = string;

/** The launch set, in reading order. */
export const FIELD_GUIDE_LAUNCH_ENTRY_IDS = [
  "healthy",
  "mosaic",
  "rust",
  "smut",
  "rssi",
] as const;

export type FieldGuideLaunchEntryId =
  (typeof FIELD_GUIDE_LAUNCH_ENTRY_IDS)[number];

export type FieldGuideSourceId = string;

/** One published or expected document behind an entry's wording. */
export type FieldGuideSource = {
  id: FieldGuideSourceId;
  title: string;
  publisher: string;
  url: string | null;
  passage: string | null;
  supports: string;
  availability: "published" | "awaiting-supply";
  publishedDate: string | null;
};

/** Photo provenance. `recorded` stays false until licence evidence exists. */
export type FieldGuideImageCredit = {
  creator: string | null;
  licenseName: string | null;
  sourcePageUrl: string | null;
  attribution: string | null;
  recorded: boolean;
};

export type FieldGuideImage = {
  src: string;
  caption: string;
  subject: "leaf" | "leaf-underside" | "stalk" | "shoot" | "whole-plant" | "insect";
  credit: FieldGuideImageCredit;
};

export type FieldGuideGuideSection = {
  id: string;
  heading: string;
  paragraphs: readonly string[];
};

export type FieldGuideGuide = {
  intro: string;
  sections: readonly FieldGuideGuideSection[];
};

export type FieldGuideEntry = {
  id: FieldGuideEntryId;
  category: FieldGuideCategory;
  displayName: string;
  shortName: string;
  summary: string;
  signs: readonly string[];
  whereToLook: string;
  impact: string;
  conditionLabel: string;
  scientificName: string | null;
  /** Actions that keep the problem out of the field. No dosage, no brand name. */
  prevention: readonly string[];
  /** Non-chemical actions first. No dosage, no brand name. */
  management: readonly string[];
  detail: string;
  guide: FieldGuideGuide;
  sourceIds: readonly FieldGuideSourceId[];
  images: readonly FieldGuideImage[];
  /** One short visual cue, used by the identification quiz. */
  quizCue: string;
  contentVersion: string;
  updatedAt: string | null;
};
