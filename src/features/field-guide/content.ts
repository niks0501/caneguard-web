import type {
  FieldGuideGuide,
  FieldGuideLaunchEntryId,
  FieldGuideSourceId,
} from './types';

export type FieldGuideEntryContent = {
  shortName: string;
  summary: string;
  signs: readonly string[];
  whereToLook: string;
  impact: string;
  conditionLabel: string;
  scientificName: string | null;
  prevention: readonly string[];
  management: readonly string[];
  detail: string;
  guide: FieldGuideGuide;
  sourceIds: readonly FieldGuideSourceId[];
  /** Content revision, for the "last updated" line and for cache invalidation. */
  contentVersion: string;
  /** Null for the bundled seed; ISO date once refreshed from the office. */
  updatedAt: string | null;
};

/**
 * Reading content for the launch set, ported from CaneGuard Mobile (commit 9c7815f).
 *
 * This is the office's draft baseline, written as short plain sentences so the
 * office booklet can correct it as a content edit rather than a rewrite. It
 * teaches recognition, monitoring, sanitation and reporting only: no active
 * ingredient, no dose and no product brand name belongs here, and the
 * forbidden-pattern test in `fieldGuide.test.ts` enforces
 * that mechanically.
 *
 * Sources are structured records in `sources.ts`, cited by id here;
 * the reading surface shows them with their exact page or passage. Foreign
 * research is cited as education, never as Philippine registration or local
 * approval.
 *
 * Editing rules for the long-form guide:
 * - Never claim the app distinguishes rust species, and never turn an
 *   educational clue into a diagnosis.
 * - Never claim a chemical cure, dose or brand for any entry.
 * - When a source is still missing, say what is missing instead of filling
 *   the gap with an invented detail.
 */
export const fieldGuideEntryContent: Record<FieldGuideLaunchEntryId, FieldGuideEntryContent> = {
  healthy: {
    shortName: 'Healthy',
    summary: 'A vigorous plant with no visible sign of disease or pest damage.',
    conditionLabel: 'Healthy baseline',
    scientificName: null,
    signs: [
      'An upright clump of several strong shoots.',
      'Long, evenly green leaves with a normal green midrib, about ten green leaves on a mature stalk.',
      'Leaves alternating up the stalk, with sheaths fitting closely.',
      'New leaves unfurling normally at the growing point, not twisted or bunched.',
      'Internode spacing normal for the variety.',
    ],
    whereToLook:
      'Look at the whole stool: the growing point at the top first, then the middle and lower leaves.',
    impact:
      'This is the baseline you compare every other plant against. Knowing what a clean plant looks like makes the other entries easier to judge, and it stops a healthy field being treated for nothing.',
    prevention: [
      'Plant material from a healthy, inspected block.',
      'Keep drains open so water does not stand in the field.',
      'Control weeds early, before they compete with young cane.',
      'Walk the field every month so a change is seen while it is still small.',
    ],
    management: [
      'Keep the field well drained and free of weeds.',
      'Walk the field every month so change is noticed early.',
      'Use planting material from a healthy block.',
      'Ask your agriculture officer if cane looks healthy but a whole block is yielding poorly.',
    ],
    detail:
      'Stalk colour is not a health test. Healthy cane can be green, red or purple depending on the variety and how much sun it gets, so judge the plant by its shape, its leaves and how evenly it is growing rather than by colour alone. Some diseases cannot be seen at all, or cannot be ruled out, just by looking.',
    guide: {
      intro:
        'Healthy sugarcane is the reference the other four entries are judged against. This page explains what normal growth looks like, what a healthy result from the app can and cannot tell you, and the routine work that keeps a block in good shape.',
      sections: [
        {
          id: 'what-healthy-looks-like',
          heading: 'What healthy growth looks like',
          paragraphs: [
            'A healthy stool is an upright clump of several strong shoots, not one thin stem. Leaves alternate up the stalk, the sheaths fit closely, and new leaves unfurl cleanly at the growing point.',
            'On a mature stalk you can expect roughly ten green leaves. Internode length and stalk colour change with variety, age and sunlight, so they are poor tests on their own.',
            'Compare plants within the same block and the same variety. A single odd plant is a reason to look closer, not a reason to treat the whole field.',
          ],
        },
        {
          id: 'what-the-app-can-say',
          heading: 'What a healthy result from the app can tell you',
          paragraphs: [
            'The app looks at leaf appearance. A healthy result means the leaf in the photo looked like the healthy class it was trained on. It is not a laboratory test and it cannot certify a plant as disease-free.',
            'Several serious sugarcane diseases are invisible or nearly invisible early, and a photo of one leaf says nothing about the roots, the soil or the rest of the block.',
            'If a block looks healthy on the phone but yields poorly, the cause is more likely soil, water, variety or an unseen disease. That question belongs with your agriculture officer.',
          ],
        },
        {
          id: 'keeping-a-block-healthy',
          heading: 'Keeping a block healthy',
          paragraphs: [
            'Start with planting material from a healthy, inspected block. Most sugarcane diseases travel in the cane you plant, so clean seed is the cheapest protection available.',
            'Keep drains open, control weeds early and walk the field every month. Regular walking is what turns a small, treatable problem into something you noticed in time.',
            'Ask your agriculture officer for soil and fertiliser advice for your area. This guide does not give rates, because the right answer depends on your soil test and local recommendation.',
          ],
        },
        {
          id: 'when-to-ask-for-help',
          heading: 'When to ask for help',
          paragraphs: [
            'Ask for help when a whole block is yielding below its usual level, when growth is patchy for no clear reason, or when leaves change colour across many plants rather than a few.',
            'Bring the block name, the variety, the planting date and a few photos, including the underside of the leaves. That information is what makes a visit useful.',
          ],
        },
      ],
    },
    sourceIds: ['lsu-idm'],
    contentVersion: '1.1.0',
    updatedAt: null,
  },
  mosaic: {
    shortName: 'Mosaic',
    summary:
      'Irregular light-and-dark green mottling on the leaf, most obvious on young leaves.',
    conditionLabel: 'Viral disease',
    scientificName: null,
    signs: [
      'Contrasting islands or streaks of normal green among paler green or yellowish areas.',
      'Mottling strongest on young leaves, and often toward the leaf base.',
      'Weaker growth and thinner stalks in susceptible varieties.',
      'Leaf colour visibly uneven from plant to plant across a block.',
    ],
    whereToLook: 'Young leaves, especially near the base of the leaf blade.',
    impact:
      'Mosaic reduces how much the plant can grow and how much sugar it makes. There is no spray that cures an infected plant.',
    prevention: [
      'Plant a resistant variety recommended for your area.',
      'Take planting material only from a clean, inspected seed source.',
      'Never take seed cane from a block that shows mosaic.',
      'Keep grass weeds down, and avoid planting maize or sorghum beside cane.',
    ],
    management: [
      'Plant a recommended variety suited to your area.',
      'Take planting material from a clean seed source, never from a block that has mosaic.',
      'Remove badly affected plants early and destroy them.',
      'Keep weeds down around the field, because they can shelter the aphids that carry the virus.',
      'Ask the office before replacing a block, because the right variety matters more than anything else.',
    ],
    detail:
      'Mosaic is caused by viruses carried from plant to plant by aphids, and also by planting infected cane. Cold injury and some other problems can look similar, so do not treat a mottled leaf as proof on its own. Because it spreads through planting material, the single most useful thing a farmer can do is to keep seed cane clean and separate from production fields.',
    guide: {
      intro:
        'Mosaic is a viral disease. This page explains what the pattern means, how the virus moves through a farm, and why the answer is clean planting material and resistant varieties rather than a spray.',
      sections: [
        {
          id: 'what-mosaic-is',
          heading: 'What mosaic is',
          paragraphs: [
            'Mosaic shows as irregular patches of pale green, yellow and normal green on the leaf. The patches have soft edges rather than sharp lines, and they are usually clearest on young, fast-growing leaves.',
            'The pattern fades as leaves age, and it looks different from variety to variety. A dark red or purple stalked variety can even show the pattern on the stalk.',
            'Mosaic is caused by viruses. More than one virus can produce mosaic-like symptoms, which is one reason a photo alone cannot confirm which one is present.',
          ],
        },
        {
          id: 'how-it-spreads',
          heading: 'How it spreads',
          paragraphs: [
            'The virus moves in two main ways: through infected planting material, and by aphids feeding on an infected plant and then on a healthy one.',
            'Because the virus is inside the cane, a planted infected stalk starts an infected stool. That stool then becomes a source for aphids to spread the virus further.',
            'Mosaic is not spread by cane knives or harvesters. It does spread most quickly when young cane is growing at the same time as a burst of aphid activity.',
          ],
        },
        {
          id: 'what-it-can-be-confused-with',
          heading: 'What it can be confused with',
          paragraphs: [
            'Cold injury, nutrient problems and other virus diseases can all produce pale or mottled leaves. Symptoms that appear after a cold spell are a good reason to wait and look again before acting.',
            'Treat a mottled leaf as a reason to inspect the block, not as a confirmed diagnosis. If the cause matters for a seed decision, ask your agriculture officer.',
          ],
        },
        {
          id: 'prevention',
          heading: 'Prevention',
          paragraphs: [
            'Resistant varieties and disease-free planting material do most of the work. No variety is immune, so clean seed and resistant varieties are used together rather than one instead of the other.',
            'Keep fields and headlands free of grass weeds, and avoid planting maize or sorghum next to cane. Those grasses can host both the virus and the aphids that carry it.',
            'Inspect seed plots often and remove infected stools early, while the level of infection is still low.',
          ],
        },
        {
          id: 'management-and-limits',
          heading: 'Management and its limits',
          paragraphs: [
            'There is no spray that cures a plant already infected with a virus. Insecticides are not a reliable way to stop aphid transmission, which is why they are not presented here as a mosaic treatment.',
            'Roguing, which means digging out infected stools, can help in a seed plot with low infection. In a commercial field with widespread infection it rarely solves the problem.',
            'The long-term answer is to change to a more resistant variety and to replant with clean seed. Ask the office before replacing a block, because variety choice matters more than any single action.',
          ],
        },
        {
          id: 'what-the-app-reports',
          heading: 'What the app reports',
          paragraphs: [
            'The app can report a mosaic-like leaf pattern as one possible condition. It cannot test for a virus, name the virus or tell you how badly a block is infected.',
            'Use the result to decide where to look next. A confirmed answer needs a plant sample and a laboratory or agriculture officer.',
          ],
        },
      ],
    },
    sourceIds: ['sra-mosaic', 'lsu-idm'],
    contentVersion: '1.1.0',
    updatedAt: null,
  },
  rust: {
    shortName: 'Rust',
    summary: 'Oval orange to cinnamon-brown pustules, mostly on the underside of the leaf.',
    conditionLabel: 'Fungal disease',
    scientificName: null,
    signs: [
      'Tiny yellow flecks first, then oval pustules about 2 to 10 mm long on the leaf underside.',
      'Orange spore dust that rubs off.',
      'Pustules clustering in patches and merging into scorched, dead leaf tissue.',
      'In a bad year, the canopy looks burnt from the bottom up.',
    ],
    whereToLook: 'The underside of the leaf, easiest to see on younger, upper leaves.',
    impact:
      'Heavy rust kills leaf area the plant needs to grow, which lowers both tonnage and sugar content. In susceptible varieties, losses can be severe.',
    prevention: [
      'Plant rust-resistant varieties recommended for your area.',
      'Spread several varieties across the farm instead of one variety everywhere.',
      'Check leaf undersides during warm, humid spells.',
      'Keep a note of which varieties rust in your fields.',
    ],
    management: [
      'Plant a recommended resistant variety.',
      'Spread your varieties rather than putting one variety over the whole farm, because the fungus can change and beat a resistance.',
      'Walk the field during warm, wet spells and look at leaf undersides.',
      'Report a sudden severe outbreak to your agriculture officer, because timing decides whether anything can be done.',
      'Do not expect clean planting material alone to solve rust, because the fungus arrives on the wind and infects leaves.',
    ],
    detail:
      'Two rusts occur in sugarcane, and they look alike. Orange rust has fresher orange pustules that are usually shorter, clustered and nearer the leaf base. Brown rust is darker, longer, more evenly spread and nearer the leaf tip. If you are unsure which one you have, say so when you report it, because the distinction changes what the office recommends. Some varieties are resistant to one and not the other.',
    guide: {
      intro:
        'Rust is a fungal disease that shows as pustules on the leaf. This page explains the two common rusts as education, why the app reports only "rust", and what actually protects a block.',
      sections: [
        {
          id: 'two-rusts',
          heading: 'Two rusts, one name',
          paragraphs: [
            'Sugarcane has two common rust diseases: brown rust and orange rust. They are caused by different fungi, and a variety can resist one and not the other.',
            'Both start as small yellow flecks that lengthen into lesions running along the leaf. Spores then break through the leaf surface, usually on the underside, which gives it a rough, dusty look.',
            'The app reports rust as one condition. It does not tell brown rust from orange rust, and nothing on this page should be read as the app making that distinction.',
          ],
        },
        {
          id: 'telling-them-apart',
          heading: 'Telling brown rust from orange rust',
          paragraphs: [
            'These are clues for learning, not a diagnosis. Orange rust pustules are orange to orange-brown when fresh, usually shorter, often grouped, and tend to sit nearer the leaf base. It is favoured by warm, wet, humid weather.',
            'Brown rust pustules are darker cinnamon-brown, more elongated and more evenly spread, and tend to sit nearer the leaf tip. It is favoured by cool nights with dew followed by warm days.',
            'The two overlap, and old orange rust can look like brown rust once the bright spores have gone. A field sample checked by an agriculture officer or laboratory is what confirms the species, and only that confirmation should drive a variety or treatment decision.',
          ],
        },
        {
          id: 'spread-and-risk',
          heading: 'How rust spreads and where the risk is',
          paragraphs: [
            'Rust spores travel on the wind, and wet leaves allow infection. Whole fields can change colour within one to two weeks when conditions suit the fungus.',
            'The fungus does not need infected planting material to arrive: wind can bring it in. That is why clean seed alone cannot protect a block from rust.',
            'Heavy infection kills leaf area the plant needs for growth, so tonnage and sugar both fall. The size of the loss depends on the variety and on how early the infection starts.',
          ],
        },
        {
          id: 'prevention',
          heading: 'Prevention',
          paragraphs: [
            'Resistant varieties are the main defence. Choose varieties recommended for your area, and ask specifically about rust, because resistance differs between brown and orange rust.',
            'Do not put one variety over the whole farm. A mix spreads the risk, and the fungus can change over time in ways that reduce a resistance.',
            'Walk fields during warm, humid weather and look at the underside of leaves, where the pustules are easiest to see.',
          ],
        },
        {
          id: 'management',
          heading: 'Management',
          paragraphs: [
            'Report a sudden, severe outbreak to your agriculture officer straight away. Whether anything can be done depends on how early it is caught and on local guidance.',
            'This guide does not name a product, an active ingredient or a dose. Any chemical decision needs local advice based on the confirmed rust, the variety, the growth stage and Philippine registration.',
            'Note which varieties rust in your fields and share that with the office. Variety choice over the next planting is the most reliable long-term control.',
          ],
        },
        {
          id: 'what-the-app-reports',
          heading: 'What the app reports',
          paragraphs: [
            'The app reports rust as one possible condition based on leaf appearance. It does not identify brown rust or orange rust, and it cannot confirm a diagnosis.',
            'If you need the species for a decision, say that clearly when you report the problem and ask for a sample to be checked.',
          ],
        },
      ],
    },
    sourceIds: ['sra-rusts', 'lsu-idm'],
    contentVersion: '1.1.0',
    updatedAt: null,
  },
  smut: {
    shortName: 'Smut',
    summary: 'A long dark whip growing out of the growing point — the clearest sign of smut.',
    conditionLabel: 'Fungal disease',
    scientificName: 'Sporisorium scitamineum',
    signs: [
      'A thin whip-like growth from the top of a shoot or from a side shoot, usually 25 to 150 cm long.',
      'The whip is greyish at first, then releases a mass of black powdery spores.',
      'Plants that look like grass, with many thin shoots growing from one stool.',
      'Narrow, stiff, upright leaves, with thin stalks and shortened internodes.',
      'In a ratoon crop, a stool that is falling apart into many small shoots.',
      'Weak, thin shoots with narrow, upright leaves coming from planted setts or ratoon stools that carry smut.',
    ],
    whereToLook: 'The growing point and the top of the cane, and the side shoots of older stalks.',
    impact:
      'Smut lives inside the plant and cannot be cured once a plant has it. Each whip can release an enormous number of spores, and those spores move on the wind to neighbouring fields. A badly affected block can lose much of its yield and will keep infecting the next crop if it is kept as ratoon. The SRA booklet reports that when half of the stalks carry a whip, susceptible varieties can lose well over half of their tonnage.',
    prevention: [
      'Plant resistant, recommended varieties.',
      'Take planting material only from a clean, inspected source.',
      'Never plant cane from a block that has smut.',
      'Keep wild grasses such as talahib and aguingay away from the cane field, because they can also carry the fungus.',
      'Do not feed whip-bearing cane tops to carabao or cattle.',
      'Inspect new plantings often and remove any whip as soon as it appears.',
    ],
    management: [
      'Plant a resistant, recommended variety.',
      'Take planting material only from a clean, inspected source, never from a block with smut.',
      'Check new plantings often and pull out any plant with a whip early.',
      'Cover the whip with a bag before you remove it, so the spores do not blow away.',
      'Do not ratoon a badly affected block. Replant with clean material.',
      'Clean tools and footwear when you move between fields.',
      'Do not feed cane tops that carry whips to carabao or cattle, because the fungus can survive in their dung and return to the field with ploughed soil.',
      'Remove talahib and aguingay growing near an affected field.',
    ],
    detail:
      'Because the fungus lives inside the plant, smut is a whole-farm problem rather than a single-plant one. Removing whips promptly reduces the spores in the air, but the plants around them may already be infected. That is why resistant varieties and clean planting material do most of the work, and why pulling out whips alone is not enough once a block is heavily affected.',
    guide: {
      intro:
        'Sugarcane smut is a fungal disease that lives inside the plant. This page explains the whip, the other signs, how the disease moves between blocks, and why clean planting material matters more than any single field action.',
      sections: [
        {
          id: 'what-smut-is',
          heading: 'What smut is',
          paragraphs: [
            'Smut is caused by the fungus Sporisorium scitamineum. The fungus grows inside the cane rather than sitting on the surface, which is why an infected plant cannot be cured after planting.',
            'The disease is a whole-farm problem. A plant that looks normal can already carry the fungus, and the next ratoon can show the signs.',
          ],
        },
        {
          id: 'the-whip',
          heading: 'The whip',
          paragraphs: [
            'The clearest sign is a long, thin whip growing out of the growing point or a side shoot. It is usually between 25 and 150 cm long.',
            'The whip starts greyish and then releases a mass of black powdery spores. The SRA booklet explains that the whip is the youngest cane leaf, which the fungus stops from opening, and that under a microscope the brown to chocolate-coloured powder shows round spores. Each whip can produce an enormous number of spores, and they travel on the wind to neighbouring fields.',
            'A whip is the moment the disease becomes visible, not the moment it arrives. By the time whips appear, other plants in the block may already be infected.',
          ],
        },
        {
          id: 'other-signs',
          heading: 'Other signs',
          paragraphs: [
            'Affected stools can look like grass: many thin shoots from one stool, narrow stiff leaves and thin stalks with shortened internodes.',
            'In a ratoon crop, a stool that is falling apart into many small shoots is another reason to look for a whip. These signs overlap with other problems, so they are a prompt to inspect, not a diagnosis.',
          ],
        },
        {
          id: 'how-it-spreads',
          heading: 'How it spreads',
          paragraphs: [
            'Smut spreads mainly through infected planting material and through spores carried on the wind. Moving cane from an affected block is the surest way to start the disease somewhere new.',
            'Because the fungus survives inside the plant, keeping an affected block as ratoon keeps the disease in the field for the next crop.',
            'Spores in the whip powder are blown by the wind. When they land on the buds of a susceptible variety that has taken up moisture, they sprout, enter the bud and spread to the other buds up the stalk. Spores in the soil, carried by rain or irrigation water, can infect buds at the base of the stalk and planted setts.',
            'Two more routes are easy to miss. Wild grasses such as talahib and aguingay can host the fungus. And when whip-bearing tops are fed to carabao or cattle, the fungus stays alive in their dung, which can reach setts when it is mixed into ploughed soil.',
            'Smut can appear at any age of the crop, from young cane to mature cane, when the weather suits it, the variety is susceptible and the fungus is present.',
          ],
        },
        {
          id: 'prevention',
          heading: 'Prevention',
          paragraphs: [
            'Plant resistant varieties recommended for your area, and take planting material only from a clean, inspected source. Never plant cane from a block with smut, even if most of it looks healthy.',
            'Keep talahib and aguingay out of the area around the field, and never feed cane tops that carry whips to carabao or cattle.',
            'Inspect new plantings and ratoons often so a whip is found while there are still few of them. Once you know the early signs, pulling out young affected cane before the whip shows is also an option. Clean tools and footwear when moving between fields as routine hygiene.',
            'The SRA booklet lists several resistant Phil-series varieties. Variety recommendations change, so ask your SRA district office for the current list before choosing one.',
            'Do not ratoon a badly affected block. Replant it with clean material, and ask the office which variety to use.',
          ],
        },
        {
          id: 'management',
          heading: 'Management',
          paragraphs: [
            'Remove whips early, and cover the whip with a bag before cutting so the spores do not blow away. This reduces the spores in the air, but it does not cure the plants around it.',
            'Pulling out whips alone is not enough once a block is heavily affected. The decision that matters is whether to keep the block as ratoon at all.',
            'This guide does not name a chemical treatment for smut. Ask your agriculture officer before any chemical decision.',
          ],
        },
        {
          id: 'source-note',
          heading: 'About this entry’s source',
          paragraphs: [
            'The primary source for this entry is the SRA Extension Services Division booklet on the main diseases of sugarcane, pages 21 to 22, supported by LSU disease notes. The booklet names the fungus Ustilago scitaminea, the older name for Sporisorium scitamineum.',
          ],
        },
      ],
    },
    sourceIds: ['sra-booklet-smut', 'lsu-idm'],
    contentVersion: '1.2.0',
    updatedAt: null,
  },
  rssi: {
    shortName: 'RSSI',
    summary:
      'Red-Striped Soft Scale Insect: a sap-sucking pest that builds up on the lower leaves and coats them in sticky honeydew and black mold.',
    conditionLabel: 'Insect pest',
    scientificName: 'Pulvinaria tenuivalvata',
    signs: [
      'Small insects with red stripes, in young and adult stages, on the lower leaves first, then moving upward.',
      'Yellowing leaves, especially toward the base.',
      'Sticky honeydew on the leaf surface.',
      'A black sooty mold growing on the honeydew, which makes the cane look dirty.',
      'Leaves drying and, in a heavy infestation, dying.',
    ],
    whereToLook:
      'The underside of the lower leaves first. Check the underside of each leaf rather than the top, because that is where the colony sits, and sooty mold may not appear until the infestation is already established.',
    impact:
      'The insect removes sap and the mold blocks light, so the plant grows less and stores less sugar. It spreads quickly from field to field, and moving infested planting material is a known way it travels. It is hard to see early, which is why weekly checking matters.',
    prevention: [
      'Check the undersides of lower leaves every week, especially along field edges.',
      'Do not move cane plants or planting material out of an affected block.',
      'Clean tools, boots and clothing after working in an affected field.',
      'Keep grassy weeds and volunteer cane down around field edges.',
      'Protect natural enemies by avoiding unnecessary broad-spectrum spraying.',
    ],
    management: [
      'Walk the field every week and look at the undersides of the lower leaves.',
      'Remove and destroy heavily infested leaves, including any covered in black mold, as directed locally.',
      'Do not move cane plants or planting material out of an affected block.',
      'Clean tools and footwear after working in an affected area.',
      'Report a suspected infestation to the Sugar Regulatory Administration, the Department of Agriculture, PHILSURIN or your local agriculture officer straight away, because official records and sample testing matter here and the area-wide response matters more than one farm acting alone.',
      'Keep the field edges and grassy weeds under control, because several weeds can host the insect.',
      'Ask the office before any chemical treatment rather than treating on your own.',
    ],
    detail:
      'RSSI was first detected in Pampanga in 2022 and confirmed in parts of Negros in early 2025. It is treated as an area problem, not a single-farm problem: treating one field while the neighbours are infested invites reinvasion, so the Philippine response uses coordinated surveillance and reporting. Natural enemies, including parasitoid wasps and beneficial fungi, already help suppress it, which is one reason repeated broad-spectrum spraying is discouraged. The scientific name is Pulvinaria tenuivalvata.',
    guide: {
      intro:
        'The Red-Striped Soft Scale Insect is a sap-sucking pest, not a disease the app can detect. This page explains what to look for, why it is handled as an area problem, and what this guide deliberately leaves out until the SRA brochures arrive.',
      sections: [
        {
          id: 'what-rssi-is',
          heading: 'What RSSI is',
          paragraphs: [
            'RSSI is a soft scale insect that feeds on sugarcane sap. It has red stripes, and it builds up on the lower leaves before moving upward.',
            'The scientific name is Pulvinaria tenuivalvata.',
            'Feeding removes sap. The insect also produces sticky honeydew, and a black sooty mould grows on it, which blocks light and makes the cane look dirty.',
          ],
        },
        {
          id: 'where-to-look',
          heading: 'Where to look',
          paragraphs: [
            'Start with the underside of the lower leaves, and check along field edges as well as inside the block. That is where a colony is easiest to find before it spreads.',
            'Look for yellowing toward the leaf base, sticky honeydew and black sooty mould. Sooty mould often appears only after the infestation is already established, so do not wait for it as your first sign.',
            'Walk the field weekly. Weekly checking is what makes early detection possible with a pest this hard to see.',
          ],
        },
        {
          id: 'area-problem',
          heading: 'Why it is an area problem',
          paragraphs: [
            'RSSI spreads between fields, and moving infested planting material is a known way it travels. Treating one farm while neighbours are infested invites reinvasion.',
            'That is why the Philippine response uses coordinated surveillance and reporting. Report a suspected infestation to the Sugar Regulatory Administration, the Department of Agriculture, PHILSURIN or your local agriculture officer straight away.',
            'Do not move cane plants or planting material out of an affected block, and clean tools, boots and clothing after working there.',
          ],
        },
        {
          id: 'life-stages',
          heading: 'Life stages: what this guide still needs',
          paragraphs: [
            'This page does not yet describe the RSSI life stages, their timing or the best moment to act. That information belongs in the 2025 and 2026 SRA brochures, which have been requested but not supplied to this build.',
            'When the brochures arrive, the stage descriptions, timing and monitoring advice will be added here with their exact page references. Until then, the honest position is that this part of the guide is incomplete.',
          ],
        },
        {
          id: 'prevention-and-field-hygiene',
          heading: 'Prevention and field hygiene',
          paragraphs: [
            'Weekly checks of lower-leaf undersides, clean tools and footwear, and no movement of planting material out of an affected block are the practical basics.',
            'Keep grassy weeds and volunteer cane down around field edges, because several weeds can host the insect. Protect natural enemies such as parasitoid wasps and beneficial fungi by avoiding unnecessary broad-spectrum spraying.',
            'Treat suspected infestations as something to report and confirm, not something to handle alone.',
          ],
        },
        {
          id: 'management-and-treatment',
          heading: 'Management and treatment',
          paragraphs: [
            'This guide gives no pesticide name, no active ingredient and no dose. Any chemical decision needs verified local approval and must follow the Philippine label and the FPA register.',
            'The FPA Registered Products list is the official place to check what is registered. A registration entry is not a recommendation for RSSI, for your variety or for your field, and foreign product advice does not apply in the Philippines.',
            'Ask your agriculture officer or the SRA before treating, and keep the report and the field record together so the area response can see the whole picture.',
          ],
        },
        {
          id: 'what-the-app-reports',
          heading: 'What the app reports',
          paragraphs: [
            'The scan model has five classes, and RSSI is one of them. A scan can return RSSI as a Possible Condition, but that is a model output on a photo, not proof of an infestation.',
            'Whatever a scan returns, also record RSSI as something you observed in the field, with a photo and the block name. That record is what a follow-up visit can act on.',
          ],
        },
      ],
    },
    sourceIds: [
      'sra-rssi-profile',
      'sra-rssi-awareness',
      'sra-brochure-rssi-2025',
      'sra-brochure-rssi-2026',
      'fpa-registered-products',
    ],
    contentVersion: '1.1.0',
    updatedAt: null,
  },
};
