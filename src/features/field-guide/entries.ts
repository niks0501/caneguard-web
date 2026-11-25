import healthyField from "../../assets/field-guide/healthy-field.jpg";
import healthyReference from "../../assets/field-guide/healthy-reference.jpg";
import mosaicField from "../../assets/field-guide/mosaic-field.jpg";
import mosaicReference from "../../assets/field-guide/mosaic-reference.jpg";
import rssiField1 from "../../assets/field-guide/rssi-field-1.jpg";
import rssiField2 from "../../assets/field-guide/rssi-field-2.jpg";
import rustField from "../../assets/field-guide/rust-field.jpg";
import rustReference from "../../assets/field-guide/rust-reference.jpg";
import smutField1 from "../../assets/field-guide/smut-field-1.jpg";
import smutField2 from "../../assets/field-guide/smut-field-2.jpg";
import { fieldGuideEntryContent } from "./content";
import {
  FIELD_GUIDE_LAUNCH_ENTRY_IDS,
  type FieldGuideCategory,
  type FieldGuideEntry,
  type FieldGuideImage,
  type FieldGuideLaunchEntryId,
} from "./types";

/**
 * A photo whose licence and source page are not recorded yet. The creator is
 * named only where the mobile `MANIFEST.csv` names one; nothing else is filled
 * in by guesswork, and `recorded` stays false until evidence exists.
 */
function photo(
  src: string,
  caption: string,
  subject: FieldGuideImage["subject"],
  creator: string | null = null,
): FieldGuideImage {
  return {
    src,
    caption,
    subject,
    credit: {
      creator,
      licenseName: null,
      sourcePageUrl: null,
      attribution: null,
      recorded: false,
    },
  };
}

const meta: Record<
  FieldGuideLaunchEntryId,
  {
    category: FieldGuideCategory;
    displayName: string;
    quizCue: string;
    images: readonly FieldGuideImage[];
  }
> = {
  healthy: {
    category: "healthy",
    displayName: "Healthy sugarcane",
    quizCue:
      "Even green blades and a normal growing point. Stalk colour alone is not a health test.",
    images: [
      photo(healthyField, "Clean, evenly green leaf blades on a healthy stool", "leaf", "Nikko"),
      photo(healthyReference, "A healthy sugarcane stool with evenly green leaves", "whole-plant"),
    ],
  },
  mosaic: {
    category: "disease",
    displayName: "Sugarcane mosaic",
    quizCue: "Light-and-dark green islands, strongest on young leaves near the base.",
    images: [
      photo(mosaicField, "Paler green streaking along an otherwise green leaf blade", "leaf", "Nikko"),
      photo(mosaicReference, "Leaf mottling with contrasting light and dark green areas", "leaf"),
    ],
  },
  rust: {
    category: "disease",
    displayName: "Sugarcane rust",
    quizCue: "Orange-brown pustules on the leaf, and the spore dust rubs off.",
    images: [
      photo(rustField, "Orange-brown rust pustules scattered over the leaf blade", "leaf", "Nikko"),
      photo(rustReference, "Orange-brown rust pustules on the leaf underside", "leaf-underside"),
    ],
  },
  smut: {
    category: "disease",
    displayName: "Sugarcane smut",
    quizCue: "A long, dark whip coming out of the growing point.",
    images: [
      photo(smutField1, "A single long whip rising above the cane canopy", "shoot", "Nikko"),
      photo(smutField2, "Several whips curling over a smut-affected block", "shoot", "Nikko"),
    ],
  },
  rssi: {
    category: "pest",
    displayName: "Red-Striped Soft Scale Insect",
    quizCue: "Red-striped insects with honeydew and sooty mold on the lower leaves.",
    images: [
      photo(rssiField1, "Red-striped scale insects clustered along the leaf blade", "insect", "Nikko"),
      photo(rssiField2, "A heavy colony of wax-covered scale insects on a leaf", "insect", "Nikko"),
    ],
  },
};

export const fieldGuideEntries: readonly FieldGuideEntry[] =
  FIELD_GUIDE_LAUNCH_ENTRY_IDS.map((id) => {
    const content = fieldGuideEntryContent[id];
    const entryMeta = meta[id];
    return {
      id,
      category: entryMeta.category,
      displayName: entryMeta.displayName,
      shortName: content.shortName,
      summary: content.summary,
      signs: content.signs,
      whereToLook: content.whereToLook,
      impact: content.impact,
      conditionLabel: content.conditionLabel,
      scientificName: content.scientificName,
      prevention: content.prevention,
      management: content.management,
      detail: content.detail,
      guide: content.guide,
      sourceIds: content.sourceIds,
      images: entryMeta.images,
      quizCue: entryMeta.quizCue,
      contentVersion: content.contentVersion,
      updatedAt: content.updatedAt,
    };
  });

/** `null` for an unknown id, so the route can render the not-found page. */
export function findFieldGuideEntry(id: string | undefined): FieldGuideEntry | null {
  return fieldGuideEntries.find((entry) => entry.id === id) ?? null;
}

export const FIELD_GUIDE_CATEGORY_LABELS: Record<FieldGuideCategory, string> = {
  healthy: "Healthy",
  disease: "Diseases",
  pest: "Pest",
};
