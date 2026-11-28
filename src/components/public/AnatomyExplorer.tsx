import type { CSSProperties } from "react";
import "../../styles/public-learning.css";
import { EntryLinks } from "./EntryLinks";
import { anatomyParts, type AnatomyPartId } from "./publicContent";
import { DEFAULT_AUTO_TOUR_PAUSE_MS, useAutoTour } from "./useAutoTour";

const ANATOMY_STEP_MS = 4200;
const ANATOMY_INITIAL_INDEX = 3;

const ANATOMY_FOCUS: Record<
  AnatomyPartId,
  { cx: number; cy: number; r: number }
> = {
  top: { cx: 150, cy: 70, r: 30 },
  upper: { cx: 150, cy: 118, r: 44 },
  sheath: { cx: 150, cy: 168, r: 28 },
  lower: { cx: 150, cy: 284, r: 42 },
  stalk: { cx: 150, cy: 210, r: 30 },
  node: { cx: 150, cy: 255, r: 32 },
  roots: { cx: 150, cy: 384, r: 40 },
};

const ANATOMY_INDEX_BY_ID: Record<AnatomyPartId, number> = anatomyParts.reduce(
  (acc, part, idx) => {
    acc[part.id] = idx;
    return acc;
  },
  {} as Record<AnatomyPartId, number>,
);

/**
 * Plant anatomy explorer. The buttons are the accessible control; the botanical
 * lab plate SVG is a synchronized pointer shortcut and stays out of the tab
 * order and accessibility tree.
 */
export function AnatomyExplorer() {
  const {
    index,
    isPaused,
    secondsRemaining,
    reducedMotion,
    selectManual,
    resumeNow,
  } = useAutoTour({
    count: anatomyParts.length,
    stepMs: ANATOMY_STEP_MS,
    pauseMs: DEFAULT_AUTO_TOUR_PAUSE_MS,
    initialIndex: ANATOMY_INITIAL_INDEX,
  });

  const selected = anatomyParts[index] ?? anatomyParts[0];
  const focus = ANATOMY_FOCUS[selected.id];

  const hot = (id: AnatomyPartId) =>
    `pub-plant__hot${selected.id === id ? " pub-plant__hot--on" : ""}`;

  const dwellStyle = {
    "--pub-dwell-ms": `${ANATOMY_STEP_MS}ms`,
  } as CSSProperties;

  const dwellFillClass = reducedMotion
    ? "pub-dwell__fill pub-dwell__fill--static"
    : isPaused
      ? "pub-dwell__fill pub-dwell__fill--paused"
      : "pub-dwell__fill pub-dwell__fill--running";

  return (
    <div className="pub-anatomy">
      <div className="pub-glass pub-anatomy__plate">
        <svg
          className="pub-plant"
          viewBox="0 0 300 420"
          aria-hidden="true"
          focusable="false"
        >
          <g className="pub-plant__grid">
            <line x1="20" y1="80" x2="280" y2="80" />
            <line x1="20" y1="168" x2="280" y2="168" />
            <line x1="20" y1="256" x2="280" y2="256" />
          </g>
          <rect
            className="pub-plant__soil"
            x="0"
            y="350"
            width="300"
            height="70"
            rx="12"
          />
          <line className="pub-plant__horizon" x1="8" y1="350" x2="292" y2="350" />

          <g
            data-zone="roots"
            data-active={selected.id === "roots" ? "true" : "false"}
            className={hot("roots")}
            onClick={() => selectManual(ANATOMY_INDEX_BY_ID.roots)}
          >
            <path
              className="pub-plant__root"
              d="M150 352 C130 380,110 395,90 410 M150 352 C150 385,150 400,148 415 M150 352 C172 380,190 392,212 408 M130 352 C118 372,100 378,80 386 M170 352 C185 370,205 376,224 382"
            />
            <ellipse
              className="pub-plant__ring"
              cx="150"
              cy="384"
              rx="80"
              ry="32"
            />
          </g>

          <path className="pub-plant__tiller" d="M118 352 L104 210" />

          <g
            data-zone="stalk"
            data-active={selected.id === "stalk" ? "true" : "false"}
            className={hot("stalk")}
            onClick={() => selectManual(ANATOMY_INDEX_BY_ID.stalk)}
          >
            <rect
              className="pub-plant__stalk"
              x="140"
              y="110"
              width="20"
              height="242"
              rx="9"
            />
            <rect
              className="pub-plant__ring"
              x="132"
              y="196"
              width="36"
              height="150"
              rx="10"
            />
          </g>

          <g
            data-zone="node"
            data-active={selected.id === "node" ? "true" : "false"}
            className={hot("node")}
            onClick={() => selectManual(ANATOMY_INDEX_BY_ID.node)}
          >
            <rect
              className="pub-plant__node"
              x="138"
              y="180"
              width="24"
              height="5"
              rx="2"
            />
            <rect
              className="pub-plant__node"
              x="138"
              y="230"
              width="24"
              height="5"
              rx="2"
            />
            <rect
              className="pub-plant__node"
              x="138"
              y="280"
              width="24"
              height="5"
              rx="2"
            />
            <rect
              className="pub-plant__node"
              x="138"
              y="325"
              width="24"
              height="5"
              rx="2"
            />
            <circle className="pub-plant__bud" cx="163" cy="226" r="5" />
            <circle className="pub-plant__bud" cx="137" cy="276" r="5" />
            <circle className="pub-plant__ring" cx="150" cy="255" r="34" />
          </g>

          <g
            data-zone="lower"
            data-active={selected.id === "lower" ? "true" : "false"}
            className={hot("lower")}
            onClick={() => selectManual(ANATOMY_INDEX_BY_ID.lower)}
          >
            <path
              className="pub-plant__leaf pub-plant__leaf--old"
              d="M150 300 C110 290,60 300,22 330 C70 310,110 305,150 306Z"
            />
            <path
              className="pub-plant__leaf pub-plant__leaf--old"
              d="M150 260 C195 250,240 262,282 296 C235 272,195 266,150 266Z"
            />
            <ellipse
              className="pub-plant__ring"
              cx="150"
              cy="290"
              rx="135"
              ry="38"
            />
          </g>

          <g
            data-zone="sheath"
            data-active={selected.id === "sheath" ? "true" : "false"}
            className={hot("sheath")}
            onClick={() => selectManual(ANATOMY_INDEX_BY_ID.sheath)}
          >
            <path
              className="pub-plant__sheath"
              d="M138 185 L138 150 L162 150 L162 185Z"
            />
            <rect
              className="pub-plant__ring"
              x="128"
              y="142"
              width="44"
              height="50"
              rx="8"
            />
          </g>

          <g
            data-zone="upper"
            data-active={selected.id === "upper" ? "true" : "false"}
            className={hot("upper")}
            onClick={() => selectManual(ANATOMY_INDEX_BY_ID.upper)}
          >
            <path
              className="pub-plant__leaf"
              d="M150 150 C110 120,60 110,14 128 C60 118,110 128,150 160Z"
            />
            <path
              className="pub-plant__leaf"
              d="M150 140 C190 105,240 96,288 110 C240 106,195 120,150 152Z"
            />
            <path
              className="pub-plant__leaf"
              d="M150 130 C130 90,100 60,70 40 C108 66,135 96,152 136Z"
            />
            <ellipse
              className="pub-plant__ring"
              cx="150"
              cy="118"
              rx="140"
              ry="52"
            />
          </g>

          <g
            data-zone="top"
            data-active={selected.id === "top" ? "true" : "false"}
            className={hot("top")}
            onClick={() => selectManual(ANATOMY_INDEX_BY_ID.top)}
          >
            <path
              className="pub-plant__spindle"
              d="M150 112 L146 40 L154 40Z"
            />
            <circle className="pub-plant__ring" cx="150" cy="70" r="30" />
          </g>

          <g
            className="pub-plant__reticle"
            data-focus-zone={selected.id}
            style={{ transform: `translate(${focus.cx}px, ${focus.cy}px)` }}
          >
            <circle
              className="pub-plant__reticle-ring"
              cx="0"
              cy="0"
              r={focus.r}
            />
            <circle className="pub-plant__beacon-pulse" cx="0" cy="0" r="11" />
            <circle className="pub-plant__beacon-dot" cx="0" cy="0" r="5" />
          </g>
        </svg>

        <p className="pub-anatomy__caption">
          <span>Inspecting:</span> <strong>{selected.name}</strong>
        </p>
      </div>

      <div className="pub-anatomy__side">
        <div className="pub-tour-bar">
          <div className="pub-tour-bar__group">
            {reducedMotion ? (
              <span className="pub-tour-pill">
                <span
                  className="pub-tour-pill__dot pub-tour-pill__dot--static"
                  aria-hidden="true"
                />
                Manual mode · reduced motion
              </span>
            ) : isPaused ? (
              <>
                <span className="pub-tour-pill pub-tour-pill--paused">
                  <span className="pub-tour-pill__dot" aria-hidden="true" />
                  Paused · resumes in {secondsRemaining}s
                </span>
                <button
                  type="button"
                  className="pub-tour-resume"
                  onClick={resumeNow}
                >
                  Resume now
                </button>
              </>
            ) : (
              <span className="pub-tour-pill pub-tour-pill--active">
                <span className="pub-tour-pill__dot" aria-hidden="true" />
                Auto-tour active
              </span>
            )}
          </div>
        </div>

        <ul className="pub-chips pub-anatomy__parts" aria-label="Plant parts">
          {anatomyParts.map((part, idx) => (
            <li key={part.id}>
              <button
                type="button"
                className="pub-chip pub-chip--button"
                aria-pressed={idx === index}
                onClick={() => selectManual(idx)}
              >
                {part.name}
              </button>
            </li>
          ))}
        </ul>

        <div
          className="pub-card pub-glass--strong pub-anatomy__inspector"
          aria-live="polite"
        >
          <h3>{selected.name}</h3>
          <p className="pub-anatomy__desc">{selected.text}</p>
          <div className="pub-anatomy__watch">
            <p className="pub-card__label">Look here for</p>
            <EntryLinks ids={selected.watchFor} />
          </div>
          <div className="pub-dwell" aria-hidden="true">
            <span
              key={`${selected.id}-${isPaused ? "paused" : reducedMotion ? "static" : "live"}`}
              className={dwellFillClass}
              style={dwellStyle}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
