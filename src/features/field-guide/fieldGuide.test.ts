import { describe, expect, it } from "vitest";
import { fieldGuideEntries, findFieldGuideEntry } from "./entries";
import { findFieldGuideSource } from "./sources";
import {
  FIELD_GUIDE_LAUNCH_ENTRY_IDS,
  type FieldGuideEntry,
} from "./types";

/** Every reading-text field on an entry, for the forbidden-pattern sweep. */
function readingText(entry: FieldGuideEntry): string[] {
  return [
    entry.displayName,
    entry.shortName,
    entry.conditionLabel,
    ...(entry.scientificName ? [entry.scientificName] : []),
    entry.summary,
    ...entry.signs,
    entry.whereToLook,
    entry.impact,
    ...entry.prevention,
    ...entry.management,
    entry.detail,
    entry.guide.intro,
    ...entry.guide.sections.flatMap((section) => [section.heading, ...section.paragraphs]),
    entry.quizCue,
    ...entry.images.map((image) => image.caption),
  ];
}

describe("field guide content", () => {
  it("keeps the five launch entries in reading order", () => {
    expect(fieldGuideEntries.map((entry) => entry.id)).toEqual([
      ...FIELD_GUIDE_LAUNCH_ENTRY_IDS,
    ]);
  });

  it("gives every entry symptoms, prevention, management and a photo with a caption", () => {
    for (const entry of fieldGuideEntries) {
      expect(entry.signs.length, entry.id).toBeGreaterThan(0);
      expect(entry.prevention.length, entry.id).toBeGreaterThan(0);
      expect(entry.management.length, entry.id).toBeGreaterThan(0);
      expect(entry.images.length, entry.id).toBeGreaterThan(0);
      for (const image of entry.images) {
        expect(image.src, entry.id).toBeTruthy();
        expect(image.caption.trim(), entry.id).not.toBe("");
      }
    }
  });

  it("resolves every cited source", () => {
    for (const entry of fieldGuideEntries) {
      for (const id of entry.sourceIds) {
        expect(findFieldGuideSource(id), `${entry.id} cites ${id}`).not.toBeNull();
      }
    }
  });

  it("never invents a photo licence", () => {
    for (const entry of fieldGuideEntries) {
      for (const image of entry.images) {
        if (!image.credit.recorded) {
          expect(image.credit.licenseName, entry.id).toBeNull();
          expect(image.credit.sourcePageUrl, entry.id).toBeNull();
        }
      }
    }
  });

  it("returns null for an unknown entry id", () => {
    expect(findFieldGuideEntry("rust")?.id).toBe("rust");
    expect(findFieldGuideEntry("banana")).toBeNull();
    expect(findFieldGuideEntry(undefined)).toBeNull();
  });
});

describe("field guide safety rules", () => {
  const DOSAGE_UNIT = /\b\d+(\.\d+)?\s?(kg|g|mL|L|ha)\b/i;
  const FORMULATION_CODE = /\b\d+\s?(EC|WP|SC|WG|SL)\b/;
  const BRAND_MARKER = /[®™]/;
  const NAMED_ACTIVE =
    /\b(imidacloprid|thiamethoxam|chlorantraniliprole|fipronil|lambda-cyhalothrin|deltamethrin|malathion|dimethoate|cartap|buprofezin|dinotefuran|sulfoxaflor|acephate|glyphosate|paraquat|atrazine|chlorpyrifos|profenofos|bifenthrin|cypermethrin|abamectin)\b/i;
  const PROVENANCE_WORDING =
    /\b(pending|licen[cs]e|licensing|provenance|manifest|attribution|watermark)\b/i;

  it("carries no dose, formulation code, brand marker, named active or provenance wording", () => {
    const violations: string[] = [];
    for (const entry of fieldGuideEntries) {
      for (const text of readingText(entry)) {
        if (DOSAGE_UNIT.test(text)) violations.push(`${entry.id}: dosage unit in "${text}"`);
        if (FORMULATION_CODE.test(text)) violations.push(`${entry.id}: formulation code in "${text}"`);
        if (BRAND_MARKER.test(text)) violations.push(`${entry.id}: brand marker in "${text}"`);
        if (NAMED_ACTIVE.test(text)) violations.push(`${entry.id}: named active in "${text}"`);
        if (PROVENANCE_WORDING.test(text)) violations.push(`${entry.id}: provenance wording in "${text}"`);
      }
    }
    expect(violations).toEqual([]);
  });
});
