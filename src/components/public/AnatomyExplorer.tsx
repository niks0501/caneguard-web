import { useState } from "react";
import { anatomyParts, type AnatomyPartId } from "./publicContent";
import { EntryLinks } from "./EntryLinks";

/**
 * Plant anatomy explorer. The buttons are the accessible control; the drawing
 * is a pointer shortcut to the same selection, so it stays out of the tab order
 * and the accessibility tree.
 */
export function AnatomyExplorer() {
  const [selectedId, setSelectedId] = useState<AnatomyPartId>("lower");
  const selected = anatomyParts.find((part) => part.id === selectedId)!;

  const hot = (id: AnatomyPartId) =>
    `pub-plant__hot${selectedId === id ? " pub-plant__hot--on" : ""}`;

  return (
    <div className="pub-anatomy">
      <svg
        className="pub-plant"
        viewBox="0 0 300 420"
        aria-hidden="true"
        focusable="false"
      >
        <rect className="pub-plant__soil" x="0" y="350" width="300" height="70" />
        <g className={hot("roots")} onClick={() => setSelectedId("roots")}>
          <path
            className="pub-plant__root"
            d="M150 352 C130 380,110 395,90 410 M150 352 C150 385,150 400,148 415 M150 352 C172 380,190 392,212 408 M130 352 C118 372,100 378,80 386 M170 352 C185 370,205 376,224 382"
          />
          <ellipse className="pub-plant__ring" cx="150" cy="384" rx="80" ry="32" />
        </g>
        <path className="pub-plant__tiller" d="M118 352 L104 210" />
        <g className={hot("stalk")} onClick={() => setSelectedId("stalk")}>
          <rect className="pub-plant__stalk" x="140" y="110" width="20" height="242" rx="9" />
          <rect className="pub-plant__ring" x="132" y="196" width="36" height="150" rx="10" />
        </g>
        <g className={hot("node")} onClick={() => setSelectedId("node")}>
          <rect className="pub-plant__node" x="138" y="180" width="24" height="5" rx="2" />
          <rect className="pub-plant__node" x="138" y="230" width="24" height="5" rx="2" />
          <rect className="pub-plant__node" x="138" y="280" width="24" height="5" rx="2" />
          <rect className="pub-plant__node" x="138" y="325" width="24" height="5" rx="2" />
          <circle className="pub-plant__bud" cx="163" cy="226" r="5" />
          <circle className="pub-plant__bud" cx="137" cy="276" r="5" />
          <circle className="pub-plant__ring" cx="150" cy="255" r="34" />
        </g>
        <g className={hot("lower")} onClick={() => setSelectedId("lower")}>
          <path className="pub-plant__leaf pub-plant__leaf--old" d="M150 300 C110 290,60 300,22 330 C70 310,110 305,150 306Z" />
          <path className="pub-plant__leaf pub-plant__leaf--old" d="M150 260 C195 250,240 262,282 296 C235 272,195 266,150 266Z" />
          <ellipse className="pub-plant__ring" cx="150" cy="290" rx="135" ry="38" />
        </g>
        <g className={hot("sheath")} onClick={() => setSelectedId("sheath")}>
          <path className="pub-plant__sheath" d="M138 185 L138 150 L162 150 L162 185Z" />
          <rect className="pub-plant__ring" x="128" y="142" width="44" height="50" rx="8" />
        </g>
        <g className={hot("upper")} onClick={() => setSelectedId("upper")}>
          <path className="pub-plant__leaf" d="M150 150 C110 120,60 110,14 128 C60 118,110 128,150 160Z" />
          <path className="pub-plant__leaf" d="M150 140 C190 105,240 96,288 110 C240 106,195 120,150 152Z" />
          <path className="pub-plant__leaf" d="M150 130 C130 90,100 60,70 40 C108 66,135 96,152 136Z" />
          <ellipse className="pub-plant__ring" cx="150" cy="118" rx="140" ry="52" />
        </g>
        <g className={hot("top")} onClick={() => setSelectedId("top")}>
          <path className="pub-plant__spindle" d="M150 112 L146 40 L154 40Z" />
          <circle className="pub-plant__ring" cx="150" cy="70" r="30" />
        </g>
      </svg>

      <div>
        <ul className="pub-chips" aria-label="Plant parts">
          {anatomyParts.map((part) => (
            <li key={part.id}>
              <button
                type="button"
                className="pub-chip pub-chip--button"
                aria-pressed={part.id === selectedId}
                onClick={() => setSelectedId(part.id)}
              >
                {part.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="pub-card" aria-live="polite">
          <h3>{selected.name}</h3>
          <p>{selected.text}</p>
          <p className="pub-card__label">Look here for</p>
          <EntryLinks ids={selected.watchFor} />
        </div>
      </div>
    </div>
  );
}
