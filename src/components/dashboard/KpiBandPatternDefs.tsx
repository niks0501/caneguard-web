import {
  KPI_BANDS,
  kpiBandSignature,
} from "./kpiBandEncoding";

/**
 * The KPI band pattern set (overhaul §3.8 + risk 7).
 *
 * Rendered inside each graphic's own `<svg>`, so every band paints as its
 * `--kpi-band-<N>` tile plus a distinct hatch: the non-colour channel that
 * keeps neighbouring bands apart. Nothing here carries an accessible name,
 * because the graphic's `role="img"` label already repeats every band label
 * and count in text; the ids come from `useKpiBandPatternIds()`.
 */
export function KpiBandPatternDefs({ ids }: { ids: string[] }) {
  return (
    <defs aria-hidden="true">
      {KPI_BANDS.map((band, index) => (
        <pattern
          key={band.band}
          id={ids[index]}
          className={`kpi-pattern kpi-pattern--${band.band}`}
          data-kpi-pattern={kpiBandSignature(band)}
          width={band.size}
          height={band.size}
          patternUnits="userSpaceOnUse"
        >
          <rect
            className="kpi-pattern__base"
            width={band.size}
            height={band.size}
          />
          {band.dot ? (
            <circle
              className="kpi-pattern__mark"
              cx={band.size / 2}
              cy={band.size / 2}
              r={1}
            />
          ) : null}
          {band.paths.map((d) => (
            <path key={d} className="kpi-pattern__mark" d={d} />
          ))}
        </pattern>
      ))}
    </defs>
  );
}
