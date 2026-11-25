import type { FieldGuideLaunchEntryId } from "../../features/field-guide/types";

/**
 * Static teaching content for the public landing page. Field Guide entries live
 * in `src/features/field-guide`; this file holds the rest. Figures cite their
 * source in `landingSources` so the page can show where each number came from.
 */

export const heroStats = [
  { value: "≈392k ha", label: "Philippine sugarcane area, crop year 2024–25" },
  { value: "≈1.87M MT", label: "Raw sugar, crop year 2024–25 final estimate" },
  { value: "9–13 mo", label: "Planting to harvest-ready cane" },
  { value: "5", label: "Conditions in the CaneGuard Field Guide" },
] as const;

export type AnatomyPartId =
  | "top"
  | "upper"
  | "sheath"
  | "lower"
  | "stalk"
  | "node"
  | "roots";

export interface AnatomyPart {
  id: AnatomyPartId;
  name: string;
  text: string;
  watchFor: readonly FieldGuideLaunchEntryId[];
}

export const anatomyParts: readonly AnatomyPart[] = [
  {
    id: "top",
    name: "Growing point",
    text: "The spindle at the top where new leaves unroll. It should open normally, not twisted or bunched.",
    watchFor: ["smut", "healthy"],
  },
  {
    id: "upper",
    name: "Young upper leaves",
    text: "Fresh leaves do most of the work of turning sunlight into sugar. Check both sides.",
    watchFor: ["mosaic", "rust"],
  },
  {
    id: "sheath",
    name: "Leaf sheath",
    text: "Wraps the stalk at each node. On a healthy stalk the sheaths fit closely.",
    watchFor: ["healthy"],
  },
  {
    id: "lower",
    name: "Lower leaves (underside)",
    text: "Older leaves near the ground. Turn them over: pests hide underneath.",
    watchFor: ["rssi"],
  },
  {
    id: "stalk",
    name: "Stalk and internodes",
    text: "Where the sugar is stored. Internode length is normal for the variety on a healthy plant, and smut shortens it.",
    watchFor: ["healthy", "smut"],
  },
  {
    id: "node",
    name: "Node and bud",
    text: "Each node carries a bud. The bud on a planted sett sprouts into a new plant, so clean setts mean a clean crop.",
    watchFor: ["mosaic", "smut"],
  },
  {
    id: "roots",
    name: "Roots and stool",
    text: "The underground stool regrows after harvest as a ratoon. A stool falling apart into many thin shoots is a warning sign.",
    watchFor: ["smut", "healthy"],
  },
];

export interface GrowthStage {
  id: string;
  name: string;
  window: string;
  text: string;
  doThis: string;
  watchFor: readonly FieldGuideLaunchEntryId[];
}

export const growthStages: readonly GrowthStage[] = [
  {
    id: "germination",
    name: "Germination",
    window: "About the first 1–1.5 months",
    text: "Buds on the planted setts sprout and roots form. Dry soil slows this down. SRA trials found early (November) and mid-season (January) plantings gave more tonnage than late (March) plantings, which gave the highest juice sucrose.",
    doThis: "Plant clean setts from inspected blocks only.",
    watchFor: ["mosaic", "smut"],
  },
  {
    id: "tillering",
    name: "Tillering",
    window: "About months 1.5–4",
    text: "Each plant sends up side shoots and forms the stool. Weeds compete hardest now, and water stress means fewer tillers.",
    doThis: "Control weeds early and walk the field every month.",
    watchFor: ["smut", "mosaic"],
  },
  {
    id: "grand-growth",
    name: "Grand growth",
    window: "About months 4–9",
    text: "The stalks shoot up and leaves fill the canopy. This is the fastest growth, and the stage where rust and RSSI can do the most harm.",
    doThis: "Check leaf undersides in warm, humid spells, and check for RSSI every week.",
    watchFor: ["rust", "rssi"],
  },
  {
    id: "maturity",
    name: "Maturity and harvest",
    window: "About months 9–13",
    text: "Growth slows and sugar builds up in the stalk. The cane is cut and hauled to the mill, and the stool then regrows as a ratoon.",
    doThis: "Do not ratoon a badly smut-affected block.",
    watchFor: ["smut", "healthy"],
  },
];

export interface TimelineEvent {
  id: string;
  when: string;
  title: string;
  text: string;
  hardship?: boolean;
}

export const historyEvents: readonly TimelineEvent[] = [
  {
    id: "austronesian",
    when: "3500 BCE or earlier",
    title: "An Austronesian crop",
    text: "Sugarcane was among the original crops the Austronesian peoples, the ancestors of Filipinos, carried across the islands.",
  },
  {
    id: "iloilo-port",
    when: "1855",
    title: "Iloilo opens to world trade",
    text: "The port opening, with British vice-consul Nicholas Loney's encouragement and imported machinery, launched the export sugar trade.",
  },
  {
    id: "negros",
    when: "Late 1800s",
    title: "Negros becomes the sugar island",
    text: "Iloilo families start haciendas on Negros, which soon leads national sugar production.",
  },
  {
    id: "sida",
    when: "2015",
    title: "The Sugarcane Industry Development Act",
    text: "RA 10659 funds block farms, research, credit and scholarships for the children of small farmers and industry workers.",
  },
  {
    id: "rssi",
    when: "2022",
    title: "RSSI detected in Pampanga",
    text: "The red-striped soft scale insect appears in Luzon and is confirmed in parts of Negros in early 2025.",
    hardship: true,
  },
  {
    id: "cadpi",
    when: "2023",
    title: "The Nasugbu mill stops milling",
    text: "The Central Azucarera Don Pedro mill closes, citing losses and dwindling cane supply. Thousands of planters and workers are affected.",
    hardship: true,
  },
  {
    id: "balayan",
    when: "2024 onward",
    title: "Nasugbu cane goes to Balayan",
    text: "Balayan Sugar Central is rehabilitated to take more of the district's cane.",
  },
  {
    id: "next",
    when: "Next",
    title: "Your generation",
    text: "Young farmers who can read the field, use the data and keep the district growing.",
  },
];

export interface LegacyPath {
  id: string;
  title: string;
  text: string;
}

export const legacyPaths: readonly LegacyPath[] = [
  {
    id: "scholarship",
    title: "Study on a SIDA scholarship",
    text: "Under RA 10659, children and dependents of certified small sugarcane farmers and industry workers can apply for CHED–SRA grants. Check the latest SRA circular for current requirements.",
  },
  {
    id: "block-farm",
    title: "Join a block farm",
    text: "Small farmers enrol their two to three hectares with a cooperative or association to share equipment, credit and support.",
  },
  {
    id: "scout",
    title: "Scout and report",
    text: "Walk the field every month, and every week for RSSI. An early report protects the whole district.",
  },
  {
    id: "career",
    title: "Build a career",
    text: "Agronomy, mill engineering, SRA research, drone mapping and the kind of AI that CaneGuard uses all need people who know cane.",
  },
];

export const flowSteps = [
  { id: "capture", title: "Capture", text: "A field reporter photographs the leaf, offline if needed." },
  { id: "hint", title: "AI hint", text: "A possible condition, as decision support only." },
  { id: "review", title: "Office review", text: "SRA district staff check the evidence." },
  { id: "follow-up", title: "Follow-up", text: "Field validation where it is needed." },
] as const;

export const landingSources = [
  {
    label: "SRA, Philippine Sugar Statistics, crop year 2024–25",
    url: "https://www.sra.gov.ph/view_file/sugar_statistics/rbXDLKT2EZKlqKS",
  },
  {
    label: "SRA planting-season research",
    url: "https://www.sra.gov.ph/view_file/researches/mGtMCpCeLRyak0k",
  },
  {
    label: "Negros sugarcane growth-stage study",
    url: "https://sciforum.net/paper/28312",
  },
  {
    label: "RA 10659, the Sugarcane Industry Development Act",
    url: "https://legacy.senate.gov.ph/republic_acts/ra%2010659.pdf",
  },
  {
    label: "CHED SIDA scholarship program",
    url: "https://legacy.ched.gov.ph/sida-sgp/",
  },
  {
    label: "Inquirer: Nasugbu sugar mill shutdown",
    url: "https://newsinfo.inquirer.net/1777368/over-13000-lose-livelihoods-after-nasugbu-sugar-mill-shutdown-romualdez-leads-aid-distribution",
  },
  {
    label: "Sugar industry of the Philippines",
    url: "https://en.wikipedia.org/wiki/Sugar_industry_of_the_Philippines",
  },
] as const;
