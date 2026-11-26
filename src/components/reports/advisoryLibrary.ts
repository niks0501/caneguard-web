import type { Advisory, AdvisoryCategory } from "../../domain/report.types";

export type AdvisoryTopicFilter = AdvisoryCategory | "all";

const filler = new Set(["a", "an", "the", "and", "or", "of", "to", "for", "in", "on", "with", "when", "from"]);

function titleWords(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !filler.has(word));
}

/**
 * An existing advisory whose title reads like the one being typed: the same
 * wording, one contained in the other, or most of the same words.
 */
export function findSimilarAdvisory(title: string, library: Advisory[], excludeUuid?: string): Advisory | undefined {
  const typed = titleWords(title);
  if (typed.join("").length < 4) return undefined;
  const typedSet = new Set(typed);
  return library.find((candidate) => {
    if (candidate.uuid === excludeUuid) return false;
    const words = titleWords(candidate.title);
    if (!words.length) return false;
    const normalized = words.join(" ");
    const typedNormalized = typed.join(" ");
    if (normalized.includes(typedNormalized) || typedNormalized.includes(normalized)) return true;
    const shared = words.filter((word) => typedSet.has(word)).length;
    const union = new Set([...words, ...typed]).size;
    return shared / union >= 0.6;
  });
}

export function filterAdvisories(library: Advisory[], search: string, topic: AdvisoryTopicFilter): Advisory[] {
  const needle = search.trim().toLowerCase();
  return library.filter((item) => (
    (topic === "all" || item.category === topic)
    && (!needle || [item.code, item.title, item.content].some((value) => value.toLowerCase().includes(needle)))
  ));
}
