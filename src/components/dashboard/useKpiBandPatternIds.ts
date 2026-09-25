import { useId } from "react";
import { KPI_BANDS, kpiBandPatternId } from "./kpiBandEncoding";

/**
 * Scope-unique pattern ids for one KPI graphic's `<defs>` (overhaul §3.8).
 *
 * Two KPI graphics mount at once, so the ids are scoped with `useId()` and
 * kept to `[A-Za-z0-9_-]` so `url(#…)` references stay valid.
 *
 * Kept out of `KpiBandPatternDefs.tsx` so that file exports components only
 * (react-refresh/only-export-components).
 */
export function useKpiBandPatternIds(): string[] {
  const scope = useId();
  return KPI_BANDS.map((band) => kpiBandPatternId(scope, band.band));
}
