import type { CSSProperties } from "react";
import "../../styles/public-learning.css";
import { EntryLinks } from "./EntryLinks";
import { growthStages } from "./publicContent";
import { DEFAULT_AUTO_TOUR_PAUSE_MS, useAutoTour } from "./useAutoTour";

const GROWTH_STEP_MS = 5400;

interface PhenologyTelemetry {
  canopyHeight: string;
  rootSystem: string;
}

const PHENOLOGY_META: Record<string, PhenologyTelemetry> = {
  germination: {
    canopyHeight: "0.15 – 0.35 m",
    rootSystem: "Fine temporary sett roots",
  },
  tillering: {
    canopyHeight: "0.6 – 1.2 m",
    rootSystem: "Thick permanent shoot roots",
  },
  "grand-growth": {
    canopyHeight: "2.0 – 3.0 m",
    rootSystem: "Deep 1–2 m peak root zone",
  },
  maturity: {
    canopyHeight: "2.8 – 3.5 m",
    rootSystem: "Ratoon-ready underground stool",
  },
};

function layerClass(activeId: string, layerId: string): string {
  return `pub-pheno__layer${activeId === layerId ? " pub-pheno__layer--active" : ""}`;
}

/**
 * Four-stage sugarcane phenology stepper with synchronized auto-cycling,
 * optical gradient progress rail, and animated botanical stage canvas.
 */
export function GrowthStepper() {
  const {
    index,
    isPaused,
    secondsRemaining,
    reducedMotion,
    selectManual,
    resumeNow,
  } = useAutoTour({
    count: growthStages.length,
    stepMs: GROWTH_STEP_MS,
    pauseMs: DEFAULT_AUTO_TOUR_PAUSE_MS,
    initialIndex: 0,
  });

  const stage = growthStages[index] ?? growthStages[0];
  const telemetry = PHENOLOGY_META[stage.id] ?? PHENOLOGY_META.germination;
  const progressPercent = ((index + 1) / growthStages.length) * 100;

  const dwellStyle = {
    "--pub-dwell-ms": `${GROWTH_STEP_MS}ms`,
  } as CSSProperties;

  const dwellFillClass = reducedMotion
    ? "pub-dwell__fill pub-dwell__fill--static"
    : isPaused
      ? "pub-dwell__fill pub-dwell__fill--paused"
      : "pub-dwell__fill pub-dwell__fill--running";

  return (
    <div className="pub-growth">
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
              Auto-cycling stages
            </span>
          )}
        </div>
      </div>

      <ol className="pub-stages" aria-label="Growth stages">
        {growthStages.map((item, i) => (
          <li key={item.id}>
            <button
              type="button"
              className={`pub-stage pub-stage--${i + 1}`}
              aria-pressed={i === index}
              onClick={() => selectManual(i)}
            >
              <strong>
                {i + 1}. {item.name}
              </strong>
              <span>{item.window}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="pub-growth__rail" aria-hidden="true">
        <div
          className="pub-growth__rail-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div
        className="pub-card pub-glass--strong pub-growth__panel"
        aria-live="polite"
      >
        <div className="pub-phenology">
          <svg
            className="pub-phenology__svg"
            viewBox="0 0 360 320"
            role="img"
            aria-label={`Sugarcane phenology stage ${index + 1}: ${stage.name}`}
            data-active-stage={stage.id}
          >
            {/* Atmospheric sky glow and canopy height grid */}
            <rect className="pub-pheno__sky" x="0" y="0" width="360" height="222" />
            <g className="pub-pheno__grid-line">
              <line x1="42" y1="54" x2="346" y2="54" />
              <line x1="42" y1="110" x2="346" y2="110" />
              <line x1="42" y1="166" x2="346" y2="166" />
            </g>
            <text className="pub-pheno__scale-label" x="10" y="58">3m</text>
            <text className="pub-pheno__scale-label" x="10" y="114">2m</text>
            <text className="pub-pheno__scale-label" x="10" y="170">1m</text>
            <text className="pub-pheno__scale-label" x="10" y="226">0m</text>

            {/* Shared soil profile: furrow horizon, topsoil, and deep subsoil */}
            <rect className="pub-pheno__topsoil" x="0" y="222" width="360" height="44" />
            <rect className="pub-pheno__subsoil" x="0" y="266" width="360" height="54" />
            <path
              className="pub-pheno__furrow"
              d="M0 222 Q90 218 140 226 Q180 232 220 226 Q275 218 360 222"
            />

            {/* Stage 1: Germination — buried 2-bud mother sett, fine sett roots, spear shoot */}
            <g
              className={layerClass(stage.id, "germination")}
              data-stage-layer="germination"
              aria-hidden={stage.id !== "germination"}
            >
              {/* Fine branched temporary sett roots from node rings */}
              <path
                className="pub-pheno__root-fine"
                d="M148 258 C142 272 132 280 120 288 M148 258 C148 274 146 286 142 296 M148 258 C156 270 162 280 166 290 M136 276 C128 280 122 282 114 282 M214 258 C206 272 198 282 192 292 M214 258 C216 274 220 284 224 294 M214 258 C224 268 234 276 244 282 M224 270 C232 274 240 274 248 276"
              />
              {/* Horizontally buried 2-bud mother sett with node rings */}
              <rect
                className="pub-pheno__sett"
                x="114"
                y="244"
                width="134"
                height="15"
                rx="7"
              />
              <line className="pub-pheno__sett-node" x1="148" y1="244" x2="148" y2="259" />
              <line className="pub-pheno__sett-node" x1="214" y1="244" x2="214" y2="259" />
              {/* Swelling secondary bud on right node */}
              <ellipse className="pub-pheno__bud" cx="214" cy="242" rx="5" ry="4" />
              <path
                className="pub-pheno__shoot"
                d="M212 242 C212 232 215 224 218 214 C220 224 218 234 217 242Z"
              />
              {/* Primary shoot piercing soil furrow with first spear leaves */}
              <g className="pub-pheno__sway pub-pheno__sway--slow">
                <path
                  className="pub-pheno__shoot"
                  d="M146 244 L148 186 L154 186 L154 244Z"
                />
                <path
                  className="pub-pheno__leaf-young"
                  d="M150 202 C142 186 128 176 112 174 C128 182 140 192 148 208Z"
                />
                <path
                  className="pub-pheno__leaf"
                  d="M152 198 C164 180 180 172 196 170 C178 178 164 190 154 205Z"
                />
                <path
                  className="pub-pheno__leaf-young"
                  d="M150 190 L147 154 L153 154 L152 190Z"
                />
              </g>
            </g>

            {/* Stage 2: Tillering — underground basal stool, thick shoot roots, bushy clump of 6 tillers */}
            <g
              className={layerClass(stage.id, "tillering")}
              data-stage-layer="tillering"
              aria-hidden={stage.id !== "tillering"}
            >
              {/* Thick fleshy permanent shoot roots */}
              <path
                className="pub-pheno__root-thick"
                d="M180 242 C156 262 132 280 106 298 M180 242 C164 268 152 288 144 308 M180 242 C180 272 180 292 180 312 M180 242 C198 268 210 288 218 308 M180 242 C208 260 232 278 256 296 M160 244 C140 258 118 268 96 274 M200 244 C222 258 242 266 264 272"
              />
              {/* Basal stool crown */}
              <ellipse className="pub-pheno__stool" cx="180" cy="236" rx="34" ry="12" />
              {/* 6 vigorous tillers fanning into a bushy arching clump */}
              <g className="pub-pheno__sway">
                {/* Stalks of primary + 5 secondary/tertiary tillers */}
                <path className="pub-pheno__stalk" d="M154 234 L132 162 L139 162 L161 234Z" />
                <path className="pub-pheno__stalk" d="M164 234 L152 142 L160 142 L171 234Z" />
                <path className="pub-pheno__stalk" d="M175 234 L174 128 L183 128 L184 234Z" />
                <path className="pub-pheno__stalk" d="M186 234 L196 138 L204 138 L193 234Z" />
                <path className="pub-pheno__stalk" d="M196 234 L216 156 L223 156 L203 234Z" />
                <path className="pub-pheno__stalk" d="M204 234 L236 174 L242 174 L210 234Z" />

                {/* Arching blades across the bushy clump */}
                <path
                  className="pub-pheno__leaf"
                  d="M138 176 C114 156 88 152 62 166 C90 162 114 168 138 186Z"
                />
                <path
                  className="pub-pheno__leaf-young"
                  d="M156 152 C132 126 102 118 74 132 C104 128 132 140 156 164Z"
                />
                <path
                  className="pub-pheno__leaf"
                  d="M178 136 C158 106 132 94 102 104 C132 104 158 118 178 148Z"
                />
                <path
                  className="pub-pheno__leaf-young"
                  d="M180 132 C180 100 176 84 180 74 C184 86 184 106 184 134Z"
                />
                <path
                  className="pub-pheno__leaf"
                  d="M183 136 C204 104 232 94 260 104 C232 104 204 118 184 148Z"
                />
                <path
                  className="pub-pheno__leaf-young"
                  d="M200 148 C226 122 256 116 286 130 C256 126 226 136 202 160Z"
                />
                <path
                  className="pub-pheno__leaf"
                  d="M220 168 C246 150 274 148 302 164 C272 158 246 162 222 178Z"
                />
                <path
                  className="pub-pheno__leaf-deep"
                  d="M152 192 C126 182 96 186 72 204 C100 194 126 192 152 200Z"
                />
                <path
                  className="pub-pheno__leaf-deep"
                  d="M208 192 C236 182 266 186 292 204 C264 194 236 192 208 200Z"
                />
              </g>
            </g>

            {/* Stage 3: Grand growth — tall jointed stalks, deep 1-2m root zone, emerald canopy, drying lowest leaves */}
            <g
              className={layerClass(stage.id, "grand-growth")}
              data-stage-layer="grand-growth"
              aria-hidden={stage.id !== "grand-growth"}
            >
              {/* Deep 1–2 m peak root zone spreading into subsoil */}
              <path
                className="pub-pheno__root-deep"
                d="M144 236 C112 260 82 284 56 312 M156 238 C134 268 114 292 100 316 M174 238 C164 272 158 296 152 318 M188 238 C192 272 196 296 202 318 M204 238 C226 268 246 292 262 316 M218 236 C250 260 280 284 306 312 M136 232 C104 246 76 254 48 264 M224 232 C256 246 286 254 314 264"
              />
              <ellipse className="pub-pheno__stool" cx="180" cy="232" rx="44" ry="11" />

              {/* Lowest leaves starting natural drying/senescence */}
              <path
                className="pub-pheno__leaf-dry"
                d="M146 192 C118 192 92 202 68 218 C96 206 122 200 146 200Z"
              />
              <path
                className="pub-pheno__leaf-dry"
                d="M214 192 C242 192 268 202 292 218 C264 206 238 200 214 200Z"
              />

              {/* Tall jointed cane stalks with elongated internodes and distinct node rings */}
              <rect className="pub-pheno__stalk" x="138" y="86" width="12" height="142" rx="5" />
              <rect className="pub-pheno__stalk" x="162" y="64" width="13" height="164" rx="5" />
              <rect className="pub-pheno__stalk" x="186" y="68" width="13" height="160" rx="5" />
              <rect className="pub-pheno__stalk" x="210" y="90" width="12" height="138" rx="5" />

              {/* Distinct dark node rings marking elongated internodes */}
              <g className="pub-pheno__node-ring">
                <rect x="137" y="114" width="14" height="3" rx="1" />
                <rect x="137" y="148" width="14" height="3" rx="1" />
                <rect x="137" y="182" width="14" height="3" rx="1" />
                <rect x="137" y="212" width="14" height="3" rx="1" />

                <rect x="161" y="96" width="15" height="3" rx="1" />
                <rect x="161" y="132" width="15" height="3" rx="1" />
                <rect x="161" y="168" width="15" height="3" rx="1" />
                <rect x="161" y="204" width="15" height="3" rx="1" />

                <rect x="185" y="100" width="15" height="3" rx="1" />
                <rect x="185" y="136" width="15" height="3" rx="1" />
                <rect x="185" y="172" width="15" height="3" rx="1" />
                <rect x="185" y="206" width="15" height="3" rx="1" />

                <rect x="209" y="118" width="14" height="3" rx="1" />
                <rect x="209" y="152" width="14" height="3" rx="1" />
                <rect x="209" y="186" width="14" height="3" rx="1" />
                <rect x="209" y="214" width="14" height="3" rx="1" />
              </g>

              {/* Dense interlocking emerald upper canopy with gentle sway */}
              <g className="pub-pheno__sway">
                <path
                  className="pub-pheno__leaf-deep"
                  d="M144 102 C110 76 74 72 38 92 C78 82 112 90 144 116Z"
                />
                <path
                  className="pub-pheno__leaf"
                  d="M168 80 C128 46 84 42 44 64 C88 54 130 64 168 94Z"
                />
                <path
                  className="pub-pheno__leaf-young"
                  d="M168 72 C148 36 122 22 92 24 C124 32 148 50 168 82Z"
                />
                <path
                  className="pub-pheno__leaf"
                  d="M192 82 C232 46 276 42 316 64 C272 54 230 64 192 96Z"
                />
                <path
                  className="pub-pheno__leaf-young"
                  d="M192 74 C212 36 238 22 268 24 C236 32 212 50 192 84Z"
                />
                <path
                  className="pub-pheno__leaf-deep"
                  d="M216 104 C250 78 286 74 322 94 C282 84 248 92 216 118Z"
                />
                <path
                  className="pub-pheno__leaf"
                  d="M166 118 C126 102 86 106 50 128 C90 116 128 116 166 130Z"
                />
                <path
                  className="pub-pheno__leaf"
                  d="M194 120 C234 104 274 108 310 130 C270 118 232 118 194 132Z"
                />
                <path
                  className="pub-pheno__leaf-young"
                  d="M178 70 C174 36 176 22 180 14 C184 24 186 40 182 72Z"
                />
              </g>
            </g>

            {/* Stage 4: Maturity and harvest — thick golden-green sucrose stalks, straw lower leaves, tassel plume, ratoon stool */}
            <g
              className={layerClass(stage.id, "maturity")}
              data-stage-layer="maturity"
              aria-hidden={stage.id !== "maturity"}
            >
              {/* Deep established roots + highlighted ratoon-ready underground stool */}
              <path
                className="pub-pheno__root-deep"
                d="M142 238 C114 264 88 288 64 314 M162 240 C146 272 136 296 128 318 M182 240 C182 274 182 296 182 318 M202 240 C218 272 228 296 236 318 M220 238 C248 264 274 288 298 314"
              />
              <ellipse className="pub-pheno__stool-glow" cx="180" cy="236" rx="58" ry="18" />
              <ellipse className="pub-pheno__stool" cx="180" cy="236" rx="48" ry="12" />
              {/* Dormant ratoon buds ready beneath soil */}
              <circle className="pub-pheno__bud" cx="148" cy="230" r="3.5" />
              <circle className="pub-pheno__bud" cx="174" cy="228" r="3.5" />
              <circle className="pub-pheno__bud" cx="198" cy="229" r="3.5" />
              <circle className="pub-pheno__bud" cx="216" cy="232" r="3.5" />

              {/* Straw-colored dried lower and mid leaves */}
              <path
                className="pub-pheno__leaf-dry"
                d="M138 192 C108 196 82 208 60 226 C88 214 114 204 138 202Z"
              />
              <path
                className="pub-pheno__leaf-dry"
                d="M138 156 C106 154 78 166 56 186 C84 172 112 164 138 166Z"
              />
              <path
                className="pub-pheno__leaf-dry"
                d="M222 192 C252 196 278 208 300 226 C272 214 246 204 222 202Z"
              />
              <path
                className="pub-pheno__leaf-dry"
                d="M222 156 C254 154 282 166 304 186 C276 172 248 164 222 166Z"
              />

              {/* Thick mature golden-green sucrose-rich stalks */}
              <rect className="pub-pheno__stalk-mature" x="134" y="76" width="15" height="154" rx="6" />
              <rect className="pub-pheno__stalk-mature" x="160" y="60" width="16" height="170" rx="6" />
              <rect className="pub-pheno__stalk-mature" x="186" y="62" width="16" height="168" rx="6" />
              <rect className="pub-pheno__stalk-mature" x="212" y="80" width="15" height="150" rx="6" />

              {/* Subtle upward sucrose sheen along mature stalks */}
              <rect className="pub-pheno__sucrose" x="139" y="106" width="5" height="114" rx="2" />
              <rect className="pub-pheno__sucrose" x="165" y="92" width="6" height="128" rx="3" />
              <rect className="pub-pheno__sucrose" x="191" y="94" width="6" height="126" rx="3" />
              <rect className="pub-pheno__sucrose" x="217" y="108" width="5" height="112" rx="2" />

              {/* Mature node rings */}
              <g className="pub-pheno__node-ring">
                <rect x="133" y="104" width="17" height="3" rx="1" />
                <rect x="133" y="138" width="17" height="3" rx="1" />
                <rect x="133" y="172" width="17" height="3" rx="1" />
                <rect x="133" y="206" width="17" height="3" rx="1" />

                <rect x="159" y="88" width="18" height="3" rx="1" />
                <rect x="159" y="124" width="18" height="3" rx="1" />
                <rect x="159" y="160" width="18" height="3" rx="1" />
                <rect x="159" y="196" width="18" height="3" rx="1" />

                <rect x="185" y="90" width="18" height="3" rx="1" />
                <rect x="185" y="126" width="18" height="3" rx="1" />
                <rect x="185" y="162" width="18" height="3" rx="1" />
                <rect x="185" y="198" width="18" height="3" rx="1" />

                <rect x="211" y="108" width="17" height="3" rx="1" />
                <rect x="211" y="142" width="17" height="3" rx="1" />
                <rect x="211" y="176" width="17" height="3" rx="1" />
                <rect x="211" y="208" width="17" height="3" rx="1" />
              </g>

              {/* Compact green terminal crown + delicate feathery tassel / arrow plume */}
              <g className="pub-pheno__sway pub-pheno__sway--slow">
                <path
                  className="pub-pheno__leaf"
                  d="M142 86 C116 66 86 64 58 80 C88 74 116 80 142 96Z"
                />
                <path
                  className="pub-pheno__leaf"
                  d="M168 70 C140 50 108 48 80 62 C110 56 140 64 168 80Z"
                />
                <path
                  className="pub-pheno__leaf-young"
                  d="M194 72 C222 50 254 48 282 62 C252 56 222 64 194 82Z"
                />
                <path
                  className="pub-pheno__leaf"
                  d="M218 88 C244 68 274 66 302 82 C272 76 244 82 218 98Z"
                />

                {/* Feathery arrow / tassel plume rising from mature stalks */}
                <path className="pub-pheno__tassel-stem" d="M168 60 L168 18" />
                <path className="pub-pheno__tassel-stem" d="M194 62 L196 22" />
                <path
                  className="pub-pheno__tassel-plume"
                  d="M168 46 C158 40 150 34 146 28 M168 46 C178 40 186 34 190 28 M168 36 C158 30 152 24 150 18 M168 36 C178 30 184 24 186 18 M168 26 C162 20 158 14 156 10 M168 26 C174 20 178 14 180 10"
                />
                <path
                  className="pub-pheno__tassel-plume"
                  d="M196 48 C188 42 182 36 180 30 M196 48 C206 42 214 36 218 30 M196 38 C188 32 184 26 182 20 M196 38 C206 32 212 26 214 20 M196 28 C192 22 190 16 188 12 M196 28 C202 22 206 16 208 12"
                />
                <ellipse className="pub-pheno__tassel-tip" cx="168" cy="24" rx="14" ry="12" />
                <ellipse className="pub-pheno__tassel-tip" cx="196" cy="28" rx="12" ry="10" />
              </g>
            </g>
          </svg>

          <dl className="pub-phenology__metrics">
            <div className="pub-phenology__metric">
              <dt>Canopy height</dt>
              <dd>{telemetry.canopyHeight}</dd>
            </div>
            <div className="pub-phenology__metric">
              <dt>Root system</dt>
              <dd>{telemetry.rootSystem}</dd>
            </div>
          </dl>
        </div>

        <div className="pub-growth__dossier">
          <p className="pub-card__label">{stage.window}</p>
          <h3>{stage.name}</h3>
          <p>{stage.text}</p>
          <p>
            <strong>Do:</strong> {stage.doThis}
          </p>
          <p className="pub-card__label">Watch for</p>
          <EntryLinks ids={stage.watchFor} />
        </div>

        <div className="pub-dwell" aria-hidden="true">
          <span
            key={`${stage.id}-${isPaused ? "paused" : reducedMotion ? "static" : "live"}`}
            className={dwellFillClass}
            style={dwellStyle}
          />
        </div>
      </div>

      <p className="pub-note">
        Months are approximate and change with variety and planting date. Ask
        the SRA office for your block&apos;s calendar.
      </p>
    </div>
  );
}
